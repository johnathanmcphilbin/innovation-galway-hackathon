import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adminCookieValue, isAdminRequest, passwordMatches } from "./auth.js";
import { pushApprovedSubmission } from "./airtable.js";
import {
  closePool,
  deleteSubmission,
  getScreenshot,
  getSubmission,
  insertSubmission,
  isDbUnavailable,
  listSubmissions,
  migrate,
  recordAirtablePush,
  saveReview,
  submissionCounts,
} from "./db.js";
import { createRateLimiter } from "./rate-limit.js";
import { prefillReview } from "./review.js";
import {
  renderAdminDetail,
  renderAdminList,
  renderAdminLogin,
  renderHome,
  renderStatus,
  renderSubmit,
  renderSubmitThanks,
} from "./render.js";
import { MAX_SCREENSHOT_BYTES, inspectScreenshot } from "./screenshot.js";
import { emptySubmissionValues, validateReview, validateSubmission } from "./validate.js";

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
const loginLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

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

function tooMany(res, { title, heading, text, path }) {
  res.status(429).type("html").send(renderStatus({ title, heading, text, path }));
}

function cookieFlags(req, maxAge) {
  const secure = req.secure ? "; Secure" : "";
  return `HttpOnly; SameSite=Lax; Path=/admin; Max-Age=${maxAge}${secure}`;
}

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.get("/", (_req, res) => {
  res.type("html").send(renderHome());
});

app.get(["/signup", "/signup/thanks"], (_req, res) => {
  res.redirect(302, "/");
});

app.post("/signup", (_req, res) => {
  res.redirect(303, "/");
});

app.get("/submit", (_req, res) => {
  res.type("html").send(renderSubmit({ values: emptySubmissionValues() }));
});

app.post(
  "/submit",
  screenshotUpload,
  asyncRoute(async (req, res) => {
    if (!submitLimit(`submit:${req.ip}`)) {
      tooMany(res, {
        title: "Slow down",
        heading: "Too many submissions from this connection",
        text: "Wait about ten minutes, then send the form again.",
        path: "/submit",
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
      res.status(422).type("html").send(renderSubmit({ values: result.values, errors: result.errors }));
      return;
    }

    try {
      await insertSubmission(result.value, inspected?.ok ? inspected : null);
    } catch (error) {
      const unavailable = error.code === "DB_CONFIG" || isDbUnavailable(error);
      console.error(`Submit failed (${error.code || error.name || "error"})`);
      res.status(unavailable ? 503 : 500).type("html").send(
        renderSubmit({
          values: result.values,
          formError: unavailable
            ? "Project submission is not available yet because the database is not configured. Nothing was saved."
            : "We couldn't save the project. Nothing was sent to Airtable. Try again.",
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

function submissionId(raw) {
  if (!/^\d+$/.test(String(raw || ""))) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return id;
}

function adminPage(req, res) {
  res.set("Cache-Control", "no-store");
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; font-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  );
  if (!isAdminRequest(req)) {
    res.status(req.method === "GET" ? 200 : 401).type("html").send(renderAdminLogin({}));
    return false;
  }
  return true;
}

app.get(
  "/admin",
  asyncRoute(async (req, res) => {
    if (!adminPage(req, res)) return;
    const status = ["pending", "approved", "rejected", "all"].includes(req.query.status)
      ? req.query.status
      : "pending";
    try {
      const [submissions, counts] = await Promise.all([listSubmissions(status), submissionCounts()]);
      res.type("html").send(renderAdminList({ status, submissions, counts }));
    } catch (error) {
      const unavailable = error.code === "DB_CONFIG" || isDbUnavailable(error);
      res.status(unavailable ? 503 : 500).type("html").send(
        renderAdminList({
          status,
          dbError: unavailable
            ? "The database is not configured, so submissions cannot be listed."
            : "The submission list could not be loaded.",
        }),
      );
    }
  }),
);

function sameOriginPost(req) {
  const host = req.get("host");
  if (!host) return false;
  const origin = req.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const referer = req.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).host === host;
  } catch {
    return false;
  }
}

app.get(
  "/admin/submissions/:id/screenshot",
  asyncRoute(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Vary", "Cookie");
    if (!isAdminRequest(req)) {
      res.status(401).setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Sign in required.");
      return;
    }
    const id = submissionId(req.params.id);
    const shot = id ? await getScreenshot(id) : null;
    if (!shot || !Buffer.isBuffer(shot.bytes) || !/^image\/(png|jpeg|webp|gif)$/.test(shot.contentType || "")) {
      res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("No screenshot.");
      return;
    }
    const filename = String(shot.filename || "screenshot").replace(/["\r\n]/g, "");
    res.status(200);
    res.setHeader("Content-Type", shot.contentType);
    res.setHeader("Content-Length", String(shot.bytes.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.end(shot.bytes);
  }),
);

app.get(
  "/admin/submissions/:id",
  asyncRoute(async (req, res) => {
    if (!adminPage(req, res)) return;
    const id = submissionId(req.params.id);
    const submission = id ? await getSubmission(id) : null;
    if (!submission) {
      res.status(404).type("html").send(
        renderStatus({
          title: "Not found",
          heading: "That submission is not in the list.",
          text: "Go back to the review list.",
          path: "/admin",
        }),
      );
      return;
    }
    res.type("html").send(renderAdminDetail({ submission, review: prefillReview(submission) }));
  }),
);

app.post(
  "/admin/submissions/:id/delete",
  asyncRoute(async (req, res) => {
    if (!adminPage(req, res)) return;
    if (!sameOriginPost(req)) {
      res.status(403).type("html").send(
        renderStatus({
          title: "Not allowed",
          heading: "That delete request did not come from this site.",
          text: "Go back to the submission and use the delete button.",
          path: "/admin",
        }),
      );
      return;
    }
    const id = submissionId(req.params.id);
    const removed = id ? await deleteSubmission(id) : false;
    if (!removed) {
      res.status(404).type("html").send(
        renderStatus({
          title: "Not found",
          heading: "That submission is not in the list.",
          text: "Go back to the review list.",
          path: "/admin",
        }),
      );
      return;
    }
    res.redirect(303, "/admin");
  }),
);

app.post(
  "/admin/submissions/:id",
  asyncRoute(async (req, res) => {
    if (!adminPage(req, res)) return;
    const id = submissionId(req.params.id);
    const existing = id ? await getSubmission(id) : null;
    if (!existing) {
      res.status(404).type("html").send(
        renderStatus({
          title: "Not found",
          heading: "That submission is not in the list.",
          text: "Go back to the review list.",
          path: "/admin",
        }),
      );
      return;
    }
    if (existing.airtablePushedAt) {
      res.type("html").send(renderAdminDetail({ submission: existing, review: prefillReview(existing) }));
      return;
    }

    const decision = req.body?.decision === "reject" ? "reject" : "approve";
    if (decision === "reject") {
      if (existing.airtableRecordId) {
        res.status(409).type("html").send(
          renderAdminDetail({
            submission: existing,
            review: prefillReview(existing),
            formError: "An Airtable row already exists for this project. Retry the upload instead of rejecting it.",
          }),
        );
        return;
      }
      await saveReview(id, {
        status: "rejected",
        projectName: existing.projectName,
        reviewerName: String(req.body?.reviewer_name || "").trim() || existing.reviewerName || null,
        approvedHours: null,
        reviewerFeedback: String(req.body?.reviewer_feedback || "").trim() || null,
        justHackatimeProjects: null,
        justHackatimeId: null,
        justLapseLinks: null,
        justTechnicalFeatures: null,
        justDeflation: null,
        justAlternateTracking: null,
        justAdditional: null,
        reviewedAt: new Date(),
      });
      res.redirect(303, `/admin/submissions/${id}`);
      return;
    }

    const review = validateReview(req.body);
    if (!review.ok) {
      res.status(422).type("html").send(
        renderAdminDetail({ submission: existing, review: review.values, errors: review.errors }),
      );
      return;
    }

    const reviewedAt = new Date();
    const saved = await saveReview(id, { ...review.value, status: "approved", reviewedAt });
    if (!saved) {
      const current = await getSubmission(id);
      res.type("html").send(renderAdminDetail({ submission: current, review: prefillReview(current) }));
      return;
    }

    const row = await getSubmission(id, { includeBytes: true });
    try {
      const pushed = await pushApprovedSubmission(row);
      await recordAirtablePush(id, {
        recordId: pushed.id,
        pushed: true,
        error: null,
        screenshotUploaded: Boolean(row.screenshotBytes),
      });
    } catch (error) {
      const recordId = Object.prototype.hasOwnProperty.call(error, "airtableRecordId")
        ? error.airtableRecordId
        : row.airtableRecordId;
      console.error(`Airtable push failed (${error.code || "error"})`);
      await recordAirtablePush(id, {
        recordId: recordId || null,
        pushed: false,
        error: error.code === "AIRTABLE_CONFIG"
          ? "Airtable is not configured, so this approval was saved here only."
          : error.message,
        screenshotUploaded: false,
      });
    }
    res.redirect(303, `/admin/submissions/${id}`);
  }),
);

app.post("/admin/login", (req, res) => {
  if (!loginLimit(`login:${req.ip}`)) {
    tooMany(res, {
      title: "Slow down",
      heading: "Too many password attempts",
      text: "Wait fifteen minutes, then try again.",
      path: "/admin",
    });
    return;
  }
  if (!process.env.ADMIN_PASSWORD) {
    res.status(503).type("html").send(renderAdminLogin({ error: "Admin is not configured on this server." }));
    return;
  }
  if (!passwordMatches(req.body?.password)) {
    res.status(401).type("html").send(renderAdminLogin({ error: "That password doesn't match." }));
    return;
  }
  const token = adminCookieValue();
  res.setHeader("Set-Cookie", `ig_admin=${encodeURIComponent(token)}; ${cookieFlags(req, 43200)}`);
  res.redirect(303, "/admin");
});

app.post("/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", `ig_admin=; ${cookieFlags(req, 0)}`);
  res.redirect(303, "/admin");
});

app.use((_req, res) => {
  res.status(404).type("html").send(
    renderStatus({
      title: "Not found",
      heading: "That page is not on the programme.",
      text: "The project page and the submit form are the pages that exist.",
    }),
  );
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
