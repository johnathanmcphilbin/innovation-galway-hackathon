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
  address2: "Flat 2",
  city: "Galway",
  state: "",
  country: "Ireland",
  zip: "H91 TCX3",
};

const organiser = {
  sub: "ident!johnny",
  email: "johnny@hackclub.com",
  givenName: "Johnny",
  familyName: "McPhilbin",
  birthdate: "1990-01-01",
  address1: "",
  address2: "",
  city: "",
  state: "",
  country: "",
  zip: "",
};

function cookie(identity) {
  return `ig_session=${signSession(identity, sessionSecret())}`;
}

function form(project = "Voice guide") {
  const body = new FormData();
  body.set("first_name", "Cristian");
  body.set("last_name", "Rotariu");
  body.set("email", "cristian@example.com");
  body.set("birthday", "2008-04-02");
  body.set("project_name", project);
  body.set("code_url", "https://github.com/cristian/voice-guide");
  body.set("playable_url", "https://voice-guide.example.com/");
  body.set("screenshot_url", "https://images.example.com/shot.png");
  body.set("description", "A voice guide that tells a student which session fits them.");
  body.set("team_members", "Cristian Rotariu");
  body.set("elevenlabs_use", "ElevenLabs text to speech for the guide.");
  body.set("youth_impact", "Students can hear which session fits them.");
  body.set("how_heard", "A teacher");
  body.set("doing_well", "The brief is specific.");
  body.set("improve", "Put the timetable up sooner.");
  body.set("address1", "15 Market St");
  body.set("address2", "Flat 2");
  body.set("city", "Galway");
  body.set("country", "Ireland");
  body.set("zip", "H91 TCX3");
  return body;
}

test("admin review is private, and approval stays in Postgres unless the flag is on", async () => {
  const calls = [];
  setAirtableFetchForTests(async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return new Response(JSON.stringify({ records: [{ id: "recFromAdmin" }] }), { status: 200 });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    await withDbLock(async () => {
      delete process.env.SYNC_APPROVED_TO_AIRTABLE;
      await migrate();
      await getPool().query("TRUNCATE submissions RESTART IDENTITY");

      const stranger = await fetch(`${base}/admin`, {
        headers: { cookie: cookie(teen) },
      });
      assert.equal(stranger.status, 403);
      assert.match(await stranger.text(), /Organisers only/);

      const submitted = await fetch(`${base}/submit`, {
        method: "POST",
        headers: { cookie: cookie(teen) },
        body: form("Voice guide"),
        redirect: "manual",
      });
      assert.equal(submitted.status, 303);

      const hidden = await fetch(`${base}/admin`, { headers: { cookie: cookie(teen) } });
      assert.equal(hidden.status, 403);
      assert.doesNotMatch(await hidden.text(), /Voice guide|15 Market St|cristian@example.com/);

      const blocked = await fetch(`${base}/admin/submissions/1`, {
        method: "POST",
        headers: {
          cookie: cookie(teen),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "decision=approve&note=nope",
        redirect: "manual",
      });
      assert.equal(blocked.status, 403);
      assert.equal((await getSubmission(1)).status, "pending");

      const review = await fetch(`${base}/admin`, { headers: { cookie: cookie(organiser) } });
      assert.equal(review.status, 200);
      const html = await review.text();
      assert.match(html, /Voice guide/);
      assert.match(html, /Pending/);
      assert.match(html, /cristian@example.com/);
      assert.match(html, /2008-04-02/);
      assert.match(html, /15 Market St/);
      assert.match(html, /Flat 2/);
      assert.match(html, /Galway/);
      assert.match(html, /Ireland/);
      assert.match(html, /H91 TCX3/);
      assert.match(html, /ident!teen/);
      assert.match(html, /https:\/\/github.com\/cristian\/voice-guide/);
      assert.match(html, /Students can hear which session fits them/);
      assert.match(html, /name="decision" value="approve"/);
      assert.match(html, /name="decision" value="reject"/);
      assert.doesNotMatch(html, /name="approved_hours"/);

      const approved = await fetch(`${base}/admin/submissions/1`, {
        method: "POST",
        headers: {
          cookie: cookie(organiser),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "decision=approve&note=Looks+ready",
        redirect: "manual",
      });
      assert.equal(approved.status, 303);
      assert.equal(new URL(approved.headers.get("location"), base).pathname, "/admin");
      const saved = await getSubmission(1);
      assert.equal(saved.status, "approved");
      assert.equal(saved.reviewerFeedback, "Looks ready");
      assert.equal(saved.reviewerName, "Johnny McPhilbin");
      assert.equal(saved.airtableRecordId, null);
      assert.equal(calls.length, 0);

      await fetch(`${base}/submit`, {
        method: "POST",
        headers: { cookie: cookie(teen) },
        body: form("Second project"),
        redirect: "manual",
      });
      const rejected = await fetch(`${base}/admin/submissions/2`, {
        method: "POST",
        headers: {
          cookie: cookie(organiser),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "decision=reject&note=Needs+a+clearer+demo",
        redirect: "manual",
      });
      assert.equal(rejected.status, 303);
      const second = await getSubmission(2);
      assert.equal(second.status, "rejected");
      assert.equal(second.reviewerFeedback, "Needs a clearer demo");

      const list = await fetch(`${base}/admin`, { headers: { cookie: cookie(organiser) } });
      const listHtml = await list.text();
      assert.ok(listHtml.indexOf("Second project") < listHtml.indexOf("Voice guide"));
      assert.match(listHtml, /Rejected/);
      assert.match(listHtml, /Approved/);

      process.env.SYNC_APPROVED_TO_AIRTABLE = "true";
      await fetch(`${base}/submit`, {
        method: "POST",
        headers: { cookie: cookie(teen) },
        body: form("Third project"),
        redirect: "manual",
      });
      const missingHours = await fetch(`${base}/admin/submissions/3`, {
        method: "POST",
        headers: {
          cookie: cookie(organiser),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "decision=approve&note=Soon",
      });
      assert.equal(missingHours.status, 422);
      assert.match(await missingHours.text(), /approved hours/i);
      assert.equal((await getSubmission(3)).status, "pending");
      assert.equal(calls.length, 0);

      const synced = await fetch(`${base}/admin/submissions/3`, {
        method: "POST",
        headers: {
          cookie: cookie(organiser),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "decision=approve&note=Five+hours&approved_hours=5",
        redirect: "manual",
      });
      assert.equal(synced.status, 303);
      const third = await getSubmission(3);
      assert.equal(third.status, "approved");
      assert.equal(third.approvedHours, 5);
      assert.equal(third.airtableRecordId, "recFromAdmin");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, "POST");
      assert.match(calls[0].url, /api\.airtable\.com/);
    });
  } finally {
    delete process.env.SYNC_APPROVED_TO_AIRTABLE;
    setAirtableFetchForTests(null);
    server.close();
    await once(server, "close");
    await closePool();
  }
});
