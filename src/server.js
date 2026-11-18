import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { airtableSyncEnabled, pushApprovedSubmission } from "./airtable.js";
import {
  SESSION_COOKIE,
  TXN_COOKIE,
  authorizeUrl,
  createTxn,
  destinationAfterLogin,
  displayName,
  hcaConfig,
  isAdminEmail,
  readCookie,
  readSession,
  readTxn,
  redeemCode,
  safeNext,
  sessionSecret,
  signSession,
  signTxn,
} from "./auth.js";
import {
  closePool,
  getScreenshot,
  getSubmission,
  insertSubmission,
  isDbUnavailable,
  listSubmissions,
  migrate,
  recordAirtablePush,
  reviewSubmission,
} from "./db.js";
import { createRateLimiter } from "./rate-limit.js";
import { renderAdmin, renderSignIn, renderStatus, renderSubmit, renderSubmitThanks } from "./render.js";
import { MAX_SCREENSHOT_BYTES, inspectScreenshot } from "./screenshot.js";
import { prefillFromSession, validateAdminAction, validateSubmission } from "./validate.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
    "Cache-Control": "no-cache",
  });
  next();
});
app.use(
  express.static(publicDir, {
    index: false,
    etag: true,
    maxAge: 0,
    setHeaders(res) {
      if (res.req.query?.v) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    },
  }),
);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const submitLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SCREENSHOT_BYTES, files: 1, fields: 40, fieldSize: 64 * 1024 },
});

function screenshotUpload(req, res, next) {
  upload.single("screenshot")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    req.screenshotError =
      error.code === "LIMIT_FILE_SIZE"
        ? "That screenshot is larger than 5 MB."
        : "Could not read that screenshot. Upload a PNG, JPEG, WebP, or GIF.";
    next();
  });
}

function tooMany(res, { title, heading, text }) {
  res.status(429).type("html").send(renderStatus({ title, heading, text }));
}

function currentSession(req) {
  return readSession(readCookie(req.headers.cookie, SESSION_COOKIE), sessionSecret());
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(req.secure),
    path: "/",
    maxAge,
  };
}

function requireParticipant(req, res, next) {
  const session = currentSession(req);
  if (!session) {
    res.redirect(303, "/auth/login?next=/submit");
    return;
  }
  req.participant = session;
  next();
}

function requireAdmin(req, res, next) {
  const session = currentSession(req);
  if (!session) {
    res.redirect(req.method === "GET" || req.method === "HEAD" ? 302 : 303, "/auth/login?next=/admin");
    return;
  }
  if (!isAdminEmail(session.email)) {
    res.status(403).type("html").send(
      renderStatus({
        title: "Organisers only",
        heading: "Organisers only.",
        text: "This review page is for the people running the hackathon.",
      }),
    );
    return;
  }
  req.admin = session;
  next();
}

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.get("/auth/login", (req, res) => {
  const secret = sessionSecret();
  const config = hcaConfig();
  const next = safeNext(typeof req.query.next === "string" ? req.query.next : "");
  if (!secret || !config) {
    res.status(503).type("html").send(
      renderStatus({
        title: "Sign-in isn't set up",
        heading: "Sign-in isn't set up yet.",
        text: "Hack Club Auth needs a client id, secret, and redirect URI before anyone can sign in.",
      }),
    );
    return;
  }
  const existing = currentSession(req);
  if (existing) {
    res.redirect(303, destinationAfterLogin(existing, next));
    return;
  }
  const txn = createTxn();
  res.cookie(TXN_COOKIE, signTxn({ ...txn, next }, secret), cookieOptions(req, 10 * 60 * 1000));
  res.redirect(302, authorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, txn }));
});

app.get(
  "/auth/callback",
  asyncRoute(async (req, res) => {
    const secret = sessionSecret();
    const config = hcaConfig();
    const txn = secret ? readTxn(readCookie(req.headers.cookie, TXN_COOKIE), secret) : null;
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    res.clearCookie(TXN_COOKIE, { path: "/" });
    if (!secret || !config || !txn || !code || !state || req.query.error) {
      res.redirect(303, "/submit?auth=error");
      return;
    }
    try {
      const identity = await redeemCode({
        code,
        state,
        expectedState: txn.state,
        verifier: txn.verifier,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
      });
      res.cookie(SESSION_COOKIE, signSession(identity, secret), cookieOptions(req, 30 * 24 * 60 * 60 * 1000));
      res.redirect(303, destinationAfterLogin(identity, txn.next));
    } catch (error) {
      console.error(`Hack Club Auth callback failed (${error.code || error.name || "error"})`);
      res.redirect(303, "/submit?auth=error");
    }
  }),
);

app.post("/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.redirect(303, "/submit");
});

app.get(["/", "/submit"], (req, res) => {
  const session = currentSession(req);
  if (!session) {
    const authError = req.query.auth === "error" ? "Hack Club sign-in didn't finish. Try again." : "";
    res.type("html").send(renderSignIn({ authError }));
    return;
  }
  const values = prefillFromSession(session);
  const prefilled = Boolean(
    values.first_name || values.last_name || values.email || values.birthday || values.address1 || values.city,
  );
  res.type("html").send(renderSubmit({ values, session, prefilled }));
});

app.get(["/signup", "/signup/thanks"], (_req, res) => {
  res.redirect(302, "/submit");
});

app.post("/signup", (_req, res) => {
  res.redirect(303, "/submit");
});

app.post(
  "/submit",
  requireParticipant,
  screenshotUpload,
  asyncRoute(async (req, res) => {
    const session = req.participant;
    if (!submitLimit(`submit:${session.sub}`)) {
      tooMany(res, {
        title: "Slow down",
        heading: "Too many submissions from this connection",
        text: "Wait about ten minutes, then send the form again.",
      });
      return;
    }

    const inspected = req.file ? inspectScreenshot(req.file) : null;
    const fileError = req.screenshotError || (inspected && !inspected.ok ? inspected.error : "");
    const result = validateSubmission(req.body || {}, {
      hasScreenshot: Boolean(fileError || inspected?.ok),
    });
    if (fileError) {
      result.errors.push({ field: "screenshot", message: fileError });
      result.ok = false;
    }
    if (!result.ok) {
      res.status(422).type("html").send(
        renderSubmit({ values: result.values, errors: result.errors, session }),
      );
      return;
    }

    try {
      await insertSubmission({ ...result.value, hackclubId: session.sub }, inspected?.ok ? inspected : null);
    } catch (error) {
      const unavailable = error.code === "DB_CONFIG" || isDbUnavailable(error);
      console.error(`Submit failed (${error.code || error.name || "error"})`);
      res.status(unavailable ? 503 : 500).type("html").send(
        renderSubmit({
          values: result.values,
          session,
          formError: unavailable
            ? "Project submission is not available yet because the database is not configured. Nothing was saved."
            : "We couldn't save the project. Try again.",
        }),
      );
      return;
    }

    res.redirect(303, "/submit/thanks");
  }),
);

app.get("/submit/thanks", (_req, res) => {
  res.type("html").send(renderSubmitThanks());
});

app.use("/admin", requireAdmin);

app.get(
  "/admin",
  asyncRoute(async (req, res) => {
    try {
      const submissions = await listSubmissions("all");
      res.type("html").send(
        renderAdmin({
          submissions,
          session: req.admin,
          syncEnabled: airtableSyncEnabled(),
        }),
      );
    } catch (error) {
      const unavailable = error.code === "DB_CONFIG" || isDbUnavailable(error);
      console.error(`Review list failed (${error.code || error.name || "error"})`);
      res.status(unavailable ? 503 : 500).type("html").send(
        renderStatus({
          title: "Review isn't available",
          heading: "The review list isn't available right now.",
          text: "Try again in a moment.",
        }),
      );
    }
  }),
);

function submissionId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

app.get(
  "/admin/submissions/:id/screenshot",
  asyncRoute(async (req, res) => {
    const id = submissionId(req);
    if (!id) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const shot = await getScreenshot(id);
    if (!shot || !/^image\/(png|jpeg|webp|gif)$/.test(shot.contentType || "")) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    const filename = String(shot.filename || "screenshot").replace(/["\r\n]/g, "");
    res.set({
      "Content-Type": shot.contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    });
    res.send(shot.bytes);
  }),
);

app.post(
  "/admin/submissions/:id",
  asyncRoute(async (req, res) => {
    const id = submissionId(req);
    if (!id) {
      res.status(404).type("html").send(
        renderStatus({ title: "Not found", heading: "That project isn't here.", text: "Go back to the review list." }),
      );
      return;
    }
    const sync = airtableSyncEnabled();
    const decision = validateAdminAction(req.body || {}, { requireHours: sync });
    const show = async (status, message) => {
      const submissions = await listSubmissions("all");
      res.status(status).type("html").send(
        renderAdmin({
          submissions,
          session: req.admin,
          syncEnabled: sync,
          actionError: { id, message },
          draft: {
            id,
            note: typeof req.body?.note === "string" ? req.body.note : "",
            hours: typeof req.body?.approved_hours === "string" ? req.body.approved_hours : "",
          },
        }),
      );
    };
    if (!decision.ok) {
      await show(422, decision.errors[0].message);
      return;
    }
    const updated = await reviewSubmission(id, {
      status: decision.decision === "approve" ? "approved" : "rejected",
      reviewerName: displayName(req.admin),
      note: decision.note,
      approvedHours: decision.decision === "approve" ? decision.approvedHours : null,
    });
    if (!updated) {
      await show(409, "That project was already reviewed.");
      return;
    }
    if (decision.decision === "approve" && sync) {
      try {
        const row = await getSubmission(id, { includeBytes: true });
        const result = await pushApprovedSubmission(row);
        await recordAirtablePush(id, {
          recordId: result.id,
          pushed: true,
          error: null,
          screenshotUploaded: Boolean(row.screenshotBytes),
        });
      } catch (error) {
        console.error(`YSWS sync failed (${error.code || error.name || "error"})`);
        await recordAirtablePush(id, {
          recordId: error.airtableRecordId || null,
          pushed: false,
          error: error.message || "Could not send this to the YSWS table.",
          screenshotUploaded: false,
        });
      }
    }
    res.redirect(303, "/admin");
  }),
);

app.use("/admin", (_req, res) => {
  res.status(404).type("html").send(
    renderStatus({
      title: "Not found",
      heading: "That page isn't here.",
      text: "The review list is the admin home.",
    }),
  );
});

app.use((req, res) => {
  res.redirect(req.method === "GET" || req.method === "HEAD" ? 302 : 303, "/submit");
});

app.use((error, _req, res, next) => {
  console.error(error.code || error.name || "error");
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).type("html").send(
    renderStatus({
      title: "Something went wrong",
      heading: "Something went wrong.",
      text: "Try again in a moment.",
    }),
  );
});

export async function start() {
  await migrate();
  const port = Number(process.env.PORT) || 3000;
  const server = await new Promise((resolve) => {
    const listening = app.listen(port, "0.0.0.0", () => resolve(listening));
  });
  console.log(`Listening on ${port}`);
  const shutdown = async () => {
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return server;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  start().catch((error) => {
    console.error(error.code || error.name || "startup failed");
    process.exit(1);
  });
}
