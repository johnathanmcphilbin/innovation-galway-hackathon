import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adminCookieValue, isAdminRequest, passwordMatches } from "./auth.js";
import { submitToAirtable } from "./airtable.js";
import { signupsToCsv } from "./csv.js";
import { closePool, findSignupByEmail, insertSignup, isDbUnavailable, listSignups, migrate } from "./db.js";
import { createRateLimiter } from "./rate-limit.js";
import {
  renderAdmin,
  renderAdminLogin,
  renderHome,
  renderSignup,
  renderSignupThanks,
  renderStatus,
  renderSubmit,
  renderSubmitThanks,
} from "./render.js";
import { emptySignupValues, emptySubmissionValues, validateSignup, validateSubmission } from "./validate.js";

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
  });
  next();
});
app.use(express.static(publicDir, { maxAge: "1h", index: false }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const signupLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });
const submitLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });
const loginLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

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

app.get("/signup", (_req, res) => {
  res.type("html").send(renderSignup({ values: emptySignupValues() }));
});

app.post(
  "/signup",
  asyncRoute(async (req, res) => {
    if (!signupLimit(`signup:${req.ip}`)) {
      tooMany(res, {
        title: "Slow down",
        heading: "Too many sign-ups from this connection",
        text: "Wait about ten minutes, then send the form again.",
        path: "/signup",
      });
      return;
    }

    const result = validateSignup(req.body);
    if (!result.ok) {
      res.status(422).type("html").send(renderSignup({ values: result.values, errors: result.errors }));
      return;
    }

    try {
      await insertSignup(result.value);
    } catch (error) {
      if (error.code === "DUPLICATE_EMAIL") {
        res.status(409).type("html").send(
          renderSignup({
            values: result.values,
            errors: [
              {
                field: "email",
                message: "That email is already signed up. Use it on the submit page if the project is yours.",
              },
            ],
          }),
        );
        return;
      }
      if (isDbUnavailable(error)) {
        console.error(`Signup unavailable (${error.code})`);
        res.status(503).type("html").send(
          renderSignup({
            values: result.values,
            formError: "Sign-up is not available right now because the database is not connected. Nothing was saved.",
          }),
        );
        return;
      }
      throw error;
    }

    res.redirect(303, "/signup/thanks");
  }),
);

app.get("/signup/thanks", (_req, res) => {
  res.type("html").send(renderSignupThanks());
});

app.get("/submit", (_req, res) => {
  res.type("html").send(renderSubmit({ values: emptySubmissionValues() }));
});

app.post(
  "/submit",
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

    const result = validateSubmission(req.body);
    if (!result.ok) {
      res.status(422).type("html").send(renderSubmit({ values: result.values, errors: result.errors }));
      return;
    }

    try {
      const existing = await findSignupByEmail(result.value.email);
      if (!existing) {
        res.status(422).type("html").send(
          renderSubmit({
            values: result.values,
            errors: [
              {
                field: "email",
                message: "Sign up with this email before submitting a project.",
              },
            ],
          }),
        );
        return;
      }
    } catch (error) {
      if (isDbUnavailable(error)) {
        console.error(`Submit lookup unavailable (${error.code})`);
        res.status(503).type("html").send(
          renderSubmit({
            values: result.values,
            formError:
              "We can't check sign-ups right now because the database is not connected. Nothing was submitted.",
          }),
        );
        return;
      }
      throw error;
    }

    try {
      await submitToAirtable(result.value);
    } catch (error) {
      const status = error.code === "AIRTABLE_CONFIG" ? 503 : 502;
      const message =
        error.code === "AIRTABLE_CONFIG"
          ? "Project submission is not available yet because Airtable is not configured. Nothing was submitted."
          : `We couldn't send the project. ${error.message}`;
      console.error(`Submit failed (${error.code || "error"})`);
      res.status(status).type("html").send(renderSubmit({ values: result.values, formError: message }));
      return;
    }

    res.redirect(303, "/submit/thanks");
  }),
);

app.get("/submit/thanks", (_req, res) => {
  res.type("html").send(renderSubmitThanks());
});

app.get(
  "/admin",
  asyncRoute(async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!isAdminRequest(req)) {
      res.type("html").send(renderAdminLogin({}));
      return;
    }
    try {
      const rows = await listSignups();
      res.type("html").send(renderAdmin({ rows }));
    } catch (error) {
      if (isDbUnavailable(error)) {
        res.status(503).type("html").send(
          renderAdmin({
            rows: [],
            dbError: "The database is not connected, so sign-ups cannot be listed.",
          }),
        );
        return;
      }
      throw error;
    }
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

app.get(
  "/admin/export.csv",
  asyncRoute(async (req, res) => {
    if (!isAdminRequest(req)) {
      res.redirect(303, "/admin");
      return;
    }
    try {
      const rows = await listSignups();
      res.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="innovation-galway-signups.csv"',
        "Cache-Control": "no-store",
      });
      res.send(signupsToCsv(rows));
    } catch (error) {
      if (isDbUnavailable(error)) {
        res.status(503).type("text/plain").send("Database is not connected.");
        return;
      }
      throw error;
    }
  }),
);

app.use((_req, res) => {
  res.status(404).type("html").send(
    renderStatus({
      title: "Not found",
      heading: "That page is not on the programme.",
      text: "The event page, sign-up, and project form are the pages that exist.",
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
