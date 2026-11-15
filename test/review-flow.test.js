import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { setAirtableFetchForTests } from "../src/airtable.js";
import { closePool, getPool, getSubmission, migrate } from "../src/db.js";
import { formatOverrideJustification } from "../src/review.js";
import { app } from "../src/server.js";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://ig:ig@127.0.0.1:5432/innovation_galway";
process.env.ADMIN_PASSWORD = "review-test-password";
process.env.AIRTABLE_API_KEY = "patSECRETVALUE";
process.env.AIRTABLE_BASE_ID = "appInkJZdtOT67t8l";
process.env.AIRTABLE_TABLE = "YSWS Project Submission";

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
  form.set("github_username", "cristian");
  form.set("hackatime_id", project === "Voice guide" ? "" : "hack_999");
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

test("submit stays local, review is authenticated, approve pushes once, reject never pushes", async () => {
  const calls = [];
  setAirtableFetchForTests(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("uploadAttachment")) {
      return new Response(JSON.stringify({ id: "att1" }), { status: 200 });
    }
    if (options.method === "POST") {
      return new Response(JSON.stringify({ records: [{ id: "recApproved1" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ records: [{ id: "recApproved1" }] }), { status: 200 });
  });

  await migrate();
  await getPool().query("TRUNCATE submissions RESTART IDENTITY");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const submitted = await fetch(`${base}/submit`, { method: "POST", body: submissionForm({ file: PNG }), redirect: "manual" });
    assert.equal(submitted.status, 303);
    assert.equal(new URL(submitted.headers.get("location"), base).pathname, "/submit/thanks");
    assert.equal(calls.length, 0);
    const saved = await getSubmission(1, { includeBytes: true });
    assert.equal(saved.status, "pending");
    assert.equal(saved.projectName, "Voice guide");
    assert.equal(saved.birthday, "2008-04-02");
    assert.equal(saved.address1, "15 Market St");
    assert.equal(saved.screenshotContentType, "image/png");
    assert.equal(saved.screenshotBytes.length, PNG.length);
    assert.equal(saved.airtableRecordId, null);

    const hidden = await fetch(`${base}/admin/submissions/1`);
    const hiddenHtml = await hidden.text();
    assert.match(hiddenHtml, /name="password"/);
    assert.doesNotMatch(hiddenHtml, /Voice guide/);
    const shot = await fetch(`${base}/admin/submissions/1/screenshot`);
    assert.equal(shot.status, 401);

    const unauthApprove = await fetch(`${base}/admin/submissions/1`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "decision=approve",
    });
    assert.equal(unauthApprove.status, 401);
    assert.equal((await getSubmission(1)).status, "pending");
    assert.equal(calls.length, 0);

    const login = await fetch(`${base}/admin/login`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "password=review-test-password",
    });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const authed = { cookie };

    const list = await fetch(`${base}/admin`, { headers: authed });
    assert.match(await list.text(), /Voice guide/);
    const detail = await fetch(`${base}/admin/submissions/1`, { headers: authed });
    const detailHtml = await detail.text();
    assert.match(detailHtml, /value="Johnathan Mc philbin"/);
    assert.match(detailHtml, /Voice guide, Innovation Galway hackathon, 21 November 2026/);
    assert.match(detailHtml, /ElevenLabs text to speech for the guide/);
    assert.match(detailHtml, /In-person attendance at the PorterShed hackathon, 21 November 2026/);
    assert.match(detailHtml, /name="approved_hours"/);
    assert.match(detailHtml, /name="just_deflation"/);
    assert.match(detailHtml, /2008-04-02/);
    assert.match(detailHtml, /15 Market St/);

    const image = await fetch(`${base}/admin/submissions/1/screenshot`, { headers: authed });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.match(image.headers.get("cache-control"), /no-store/);

    const other = await fetch(`${base}/submit`, {
      method: "POST",
      body: submissionForm({ file: "url", project: "Poster bot" }),
      redirect: "manual",
    });
    assert.equal(other.status, 303);
    assert.equal(calls.length, 0);

    const rejected = await fetch(`${base}/admin/submissions/2`, {
      method: "POST",
      redirect: "manual",
      headers: { ...authed, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        decision: "reject",
        reviewer_name: "Johnathan Mc philbin",
        reviewer_feedback: "The playable page did not load.",
      }),
    });
    assert.equal(rejected.status, 303);
    assert.equal((await getSubmission(2)).status, "rejected");
    assert.equal((await getSubmission(2)).airtableRecordId, null);
    assert.equal(calls.length, 0);

    const feedback = "Reduced from 8 hours to 5 hours because the demo was one afternoon.";
    const approved = await fetch(`${base}/admin/submissions/1`, {
      method: "POST",
      redirect: "manual",
      headers: { ...authed, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        decision: "approve",
        project_name: "Voice guide",
        reviewer_name: "Johnathan Mc philbin",
        approved_hours: "5.5",
        reviewer_feedback: feedback,
        just_hackatime_projects: "Voice guide, Innovation Galway hackathon, 21 November 2026",
        just_hackatime_id: "",
        just_lapse_links: "",
        just_technical_features: "Verified the ElevenLabs text-to-speech request in the repo.",
        just_deflation: "The claimed day included setup time before the hackathon.",
        just_alternate_tracking: "In-person attendance at the PorterShed hackathon, 21 November 2026.",
        just_additional: "Team members:\nCristian Rotariu\n\nExtra note: one youth tester in the room.",
      }),
    });
    assert.equal(approved.status, 303);
    assert.equal(calls.length, 2);
    const fields = JSON.parse(calls[0].options.body).records[0].fields;
    assert.equal(calls[0].options.method, "POST");
    assert.equal("Screenshot" in fields, false);
    assert.equal(fields["Code URL"], "https://github.com/cristian/voice-guide");
    assert.equal(fields["Playable URL"], "https://voice-guide.example.com/");
    assert.equal(fields["First Name"], "Cristian");
    assert.equal(fields["Last Name"], "Rotariu");
    assert.equal(fields.Email, "cristian@example.com");
    assert.equal(fields.Birthday, "2008-04-02");
    assert.equal(fields["Address (Line 1)"], "15 Market St");
    assert.equal(fields["Optional - Override Hours Spent"], 5.5);
    const row = await getSubmission(1);
    const expected = formatOverrideJustification({
      projectName: "Voice guide",
      reviewerName: "Johnathan Mc philbin",
      reviewedAt: row.reviewedAt,
      feedback,
    });
    assert.equal(fields["Optional - Override Hours Spent Justification"], expected);
    assert.equal(fields["Automation - Unified Justification"], expected);
    assert.equal(
      fields["Justification - Hackatime Project Name(s) + Date Range(s)"],
      "Voice guide, Innovation Galway hackathon, 21 November 2026",
    );
    assert.equal("Justification - Submitter Hackatime ID" in fields, false);
    assert.equal("Justification - Lapse Links, comma-separated" in fields, false);
    assert.equal(fields["Justification - Specific Technical Features"], "Verified the ElevenLabs text-to-speech request in the repo.");
    assert.equal(fields["Justification - Deflation Justification"], "The claimed day included setup time before the hackathon.");
    assert.equal(
      fields["Justification - Alternate Tracking Method"],
      "In-person attendance at the PorterShed hackathon, 21 November 2026.",
    );
    assert.match(fields["Justification - Additional Justification"], /one youth tester/);
    for (const blocked of [
      "Automation - Submit to Unified YSWS",
      "Automation - Error",
      "Automation - First Submitted At",
      "Automation - Last Updated At",
      "Automation - YSWS Record ID",
    ]) {
      assert.equal(blocked in fields, false);
    }
    assert.equal(calls[1].url.includes("/Screenshot/uploadAttachment"), true);
    assert.equal(row.airtableRecordId, "recApproved1");
    assert.ok(row.airtablePushedAt);

    const duplicate = await fetch(`${base}/admin/submissions/1`, {
      method: "POST",
      headers: { ...authed, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ decision: "approve", project_name: "Voice guide", approved_hours: "9" }),
    });
    assert.equal(duplicate.status, 200);
    assert.equal(calls.length, 2);
    assert.equal((await getSubmission(1)).airtableRecordId, "recApproved1");

    const wrongType = await fetch(`${base}/submit`, {
      method: "POST",
      body: submissionForm({ file: Buffer.from("<html>not an image</html>"), filename: "shot.png", type: "image/png" }),
    });
    assert.equal(wrongType.status, 422);
    assert.match(await wrongType.text(), /PNG, JPEG/);
    assert.equal(calls.length, 2);

    const huge = Buffer.alloc(5 * 1024 * 1024 + 1);
    PNG.copy(huge);
    const tooBig = await fetch(`${base}/submit`, {
      method: "POST",
      body: submissionForm({ file: huge, filename: "big.png", type: "image/png" }),
    });
    assert.equal(tooBig.status, 422);
    assert.match(await tooBig.text(), /5 MB/);
    assert.equal(calls.length, 2);
  } finally {
    setAirtableFetchForTests(null);
    server.close();
    await once(server, "close");
    await closePool();
  }
});
