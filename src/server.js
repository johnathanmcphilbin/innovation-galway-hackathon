import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closePool, insertSubmission, isDbUnavailable, migrate } from "./db.js";
import { createRateLimiter } from "./rate-limit.js";
import { renderStatus, renderSubmit, renderSubmitThanks } from "./render.js";
import { MAX_SCREENSHOT_BYTES, inspectScreenshot } from "./screenshot.js";
import { emptySubmissionValues, validateSubmission } from "./validate.js";

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

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.get(["/", "/submit"], (_req, res) => {
  res.type("html").send(renderSubmit({ values: emptySubmissionValues() }));
});

app.get(["/signup", "/signup/thanks"], (_req, res) => {
  res.redirect(302, "/submit");
});

app.post("/signup", (_req, res) => {
  res.redirect(303, "/submit");
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
