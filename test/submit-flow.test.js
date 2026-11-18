import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { setAirtableFetchForTests } from "../src/airtable.js";
import { signSession, sessionSecret } from "../src/auth.js";
import { closePool, getPool, getSubmission, migrate } from "../src/db.js";
import { app } from "../src/server.js";
import { withDbLock } from "./db-lock.js";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://ig:ig@127.0.0.1:5432/innovation_galway";
process.env.SESSION_SECRET = "test-session-secret";
process.env.AIRTABLE_API_KEY = "patSECRETVALUE";
process.env.AIRTABLE_BASE_ID = "appInkJZdtOT67t8l";
process.env.AIRTABLE_TABLE = "YSWS Project Submission";
delete process.env.SYNC_APPROVED_TO_AIRTABLE;

const teen = {
  sub: "ident!teen",
  email: "cristian@example.com",
  givenName: "Cristian",
  familyName: "Rotariu",
  birthdate: "2008-04-02",
  address1: "15 Market St",
  address2: "",
  city: "Galway",
  state: "",
  country: "Ireland",
  zip: "H91 TCX3",
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function submissionForm({ file, filename = "shot.png", type = "image/png", project = "Voice guide" } = {}) {
  const form = new FormData();
  form.set("first_name", "Cristian");
  form.set("last_name", "Rotariu");
  form.set("email", "cristian@example.com");
  form.set("birthday", "2008-04-02");
  form.set("hackclub_id", "spoofed");
  form.set("project_name", project);
  form.set("code_url", "https://github.com/cristian/voice-guide");
  form.set("playable_url", "https://voice-guide.example.com/");
  form.set("description", "A voice guide that tells a student which session fits them.");
  form.set("team_members", "Cristian Rotariu");
  form.set("elevenlabs_use", "ElevenLabs text to speech for the guide.");
  form.set("youth_impact", "Students can hear which session fits them.");
  form.set("how_heard", "A teacher");
  form.set("doing_well", "The brief is specific.");
  form.set("improve", "Put the timetable up sooner.");
  form.set("address1", "15 Market St");
  form.set("city", "Galway");
  form.set("country", "Ireland");
  form.set("zip", "H91 TCX3");
  if (file === "url") form.set("screenshot_url", "https://images.example.com/shot.png");
  else if (file) form.set("screenshot", new Blob([file], { type }), filename);
  return form;
}

function teenCookie() {
  return `ig_session=${signSession(teen, sessionSecret())}`;
}

test("submissions and screenshots stay in Postgres and nothing reaches Airtable", async () => {
  const calls = [];
  setAirtableFetchForTests(async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ records: [{ id: "recShouldNotHappen" }] }), { status: 200 });
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await withDbLock(async () => {
    await migrate();
    await getPool().query("TRUNCATE submissions RESTART IDENTITY");
    const submitted = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { cookie: teenCookie() },
      body: submissionForm({ file: PNG }),
      redirect: "manual",
    });
    assert.equal(submitted.status, 303);
    assert.equal(new URL(submitted.headers.get("location"), base).pathname, "/submit/thanks");
    const saved = await getSubmission(1, { includeBytes: true });
    assert.equal(saved.status, "pending");
    assert.equal(saved.projectName, "Voice guide");
    assert.equal(saved.birthday, "2008-04-02");
    assert.equal(saved.githubUsername, null);
    assert.equal(saved.hackatimeId, null);
    assert.equal(saved.hackclubId, "ident!teen");
    assert.equal(saved.address1, "15 Market St");
    assert.equal(saved.city, "Galway");
    assert.equal(saved.country, "Ireland");
    assert.equal(saved.zip, "H91 TCX3");
    assert.equal(saved.screenshotContentType, "image/png");
    assert.equal(saved.screenshotBytes.length, PNG.length);
    assert.equal(saved.airtableRecordId, null);

    const other = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { cookie: teenCookie() },
      body: submissionForm({ file: "url", project: "Second project" }),
      redirect: "manual",
    });
    assert.equal(other.status, 303);

    const wrongType = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { cookie: teenCookie() },
      body: submissionForm({ file: Buffer.from("<html>not an image</html>"), filename: "shot.png", type: "image/png" }),
    });
    assert.equal(wrongType.status, 422);
    assert.match(await wrongType.text(), /PNG, JPEG/);

    const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
    PNG.copy(huge);
    const tooBig = await fetch(`${base}/submit`, {
      method: "POST",
      headers: { cookie: teenCookie() },
      body: submissionForm({ file: huge, filename: "big.png", type: "image/png" }),
    });
    assert.equal(tooBig.status, 422);
    assert.match(await tooBig.text(), /5 MB/);

    for (const [method, route] of [
      ["GET", "/admin"],
      ["GET", "/admin/submissions/1"],
      ["GET", "/admin/submissions/1/screenshot"],
      ["POST", "/admin/login"],
      ["POST", "/admin/submissions/1"],
      ["POST", "/admin/submissions/1/delete"],
    ]) {
      const res = await fetch(`${base}${route}`, {
        method,
        headers: { origin: base, "content-type": "application/x-www-form-urlencoded" },
        body: method === "POST" ? "decision=approve&approved_hours=5" : undefined,
        redirect: "manual",
      });
      assert.equal(res.status, method === "GET" ? 302 : 303, `${method} ${route}`);
      assert.equal(new URL(res.headers.get("location"), base).pathname, "/auth/login");
      const text = await res.text();
      assert.doesNotMatch(text, /Voice guide/);
    }

    const after = await getSubmission(1, { includeBytes: true });
    assert.equal(after.status, "pending");
    assert.equal(after.screenshotBytes.length, PNG.length);
    assert.ok(await getSubmission(2));
    assert.equal(calls.length, 0);
    });
  } finally {
    setAirtableFetchForTests(null);
    server.close();
    await once(server, "close");
    await closePool();
  }
});
