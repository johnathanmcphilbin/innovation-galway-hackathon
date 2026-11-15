import assert from "node:assert/strict";
import test from "node:test";
import {
  UNTOUCHED_AIRTABLE_FIELDS,
  buildApprovedAirtableFields,
  pushApprovedSubmission,
} from "../src/airtable.js";
import { formatOverrideJustification } from "../src/review.js";

const reviewedAt = new Date("2026-11-21T15:04:05.000Z");
const feedback = "Reduced from 8 hours to 5 hours. The README overstated the audio work.";
const justification = [
  "Innovation Galway review: Approved (Voice guide)",
  "Reviewer: Johnathan Mc philbin",
  "Reviewed at: 11/21/2026, 3:04:05 PM",
  `Feedback to participant: ${feedback}`,
].join("\n");

function reviewedRow(overrides = {}) {
  return {
    projectName: "Voice guide",
    reviewerName: "Johnathan Mc philbin",
    reviewedAt,
    reviewerFeedback: feedback,
    approvedHours: 5.5,
    codeUrl: "https://github.com/cristian/voice-guide",
    playableUrl: "https://voice-guide.example.com/",
    firstName: "Cristian",
    lastName: "Rotariu",
    email: "cristian@example.com",
    description: "A voice guide for the day.",
    githubUsername: "cristian",
    birthday: "2008-04-02",
    howHeard: "A teacher",
    doingWell: "The brief is specific.",
    improve: "Put the timetable up sooner.",
    address1: "15 Market St",
    address2: "",
    city: "Galway",
    state: "",
    country: "Ireland",
    zip: "H91 TCX3",
    teamMembers: "Cristian Rotariu",
    elevenLabsUse: "ElevenLabs text to speech for the guide.",
    youthImpact: "Students can hear which session fits them.",
    screenshotUrl: "https://images.example.com/shot.png",
    justHackatimeProjects: "Voice guide, Innovation Galway hackathon, 21 November 2026",
    justHackatimeId: "hack_123",
    justLapseLinks: "https://lapse.example/a, https://lapse.example/b",
    justTechnicalFeatures: "Verified the ElevenLabs API call that speaks the next session.",
    justDeflation: "Counted the hackathon day, not the week of planning.",
    justAlternateTracking: "In-person attendance at the PorterShed hackathon, 21 November 2026.",
    justAdditional: "Team members:\nCristian Rotariu",
    ...overrides,
  };
}

const env = {
  AIRTABLE_API_KEY: "patSECRETVALUE",
  AIRTABLE_BASE_ID: "appInkJZdtOT67t8l",
  AIRTABLE_TABLE: "YSWS Project Submission",
};

test("formats the Expedition override justification exactly", () => {
  assert.equal(
    formatOverrideJustification({
      projectName: "Voice guide",
      reviewerName: "Johnathan Mc philbin",
      reviewedAt,
      feedback,
    }),
    justification,
  );
});

test("maps an approval onto the YSWS field names and nothing else", () => {
  const fields = buildApprovedAirtableFields(reviewedRow(), { includeScreenshotUrl: true });
  assert.deepEqual(Object.keys(fields).sort(), [
    "Address (Line 1)",
    "Automation - Unified Justification",
    "Birthday",
    "City",
    "Code URL",
    "Country",
    "Description",
    "Email",
    "First Name",
    "GitHub Username",
    "How can we improve?",
    "How did you hear about this?",
    "Justification - Additional Justification",
    "Justification - Alternate Tracking Method",
    "Justification - Deflation Justification",
    "Justification - Hackatime Project Name(s) + Date Range(s)",
    "Justification - Lapse Links, comma-separated",
    "Justification - Specific Technical Features",
    "Justification - Submitter Hackatime ID",
    "Last Name",
    "Optional - Override Hours Spent",
    "Optional - Override Hours Spent Justification",
    "Playable URL",
    "Screenshot",
    "What are we doing well?",
    "ZIP / Postal Code",
  ]);
  assert.equal(fields["Optional - Override Hours Spent"], 5.5);
  assert.equal(typeof fields["Optional - Override Hours Spent"], "number");
  assert.equal(fields["Optional - Override Hours Spent Justification"], justification);
  assert.equal(fields["Automation - Unified Justification"], justification);
  assert.equal(
    fields["Justification - Hackatime Project Name(s) + Date Range(s)"],
    "Voice guide, Innovation Galway hackathon, 21 November 2026",
  );
  assert.deepEqual(fields.Screenshot, [{ url: "https://images.example.com/shot.png" }]);
  for (const name of UNTOUCHED_AIRTABLE_FIELDS) assert.equal(name in fields, false);
  assert.equal(Object.keys(fields).some((key) => key.startsWith("Loops")), false);
});

test("omits a screenshot attachment when the file will be uploaded separately", () => {
  const fields = buildApprovedAirtableFields(reviewedRow({ justLapseLinks: "  ", justHackatimeId: "" }), {
    includeScreenshotUrl: false,
  });
  assert.equal("Screenshot" in fields, false);
  assert.equal("Justification - Lapse Links, comma-separated" in fields, false);
  assert.equal("Justification - Submitter Hackatime ID" in fields, false);
});

test("creates one Airtable row, uploads the screenshot, and does not create another on retry", async () => {
  const calls = [];
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("uploadAttachment")) {
      return new Response(JSON.stringify({ id: "att1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ records: [{ id: "recApproved1" }] }), { status: 200 });
  };
  const row = reviewedRow({
    screenshotBytes: png,
    screenshotContentType: "image/png",
    screenshotFilename: "shot.png",
    screenshotUploaded: false,
    airtableRecordId: null,
    airtablePushedAt: null,
  });

  const created = await pushApprovedSubmission(row, { fetchImpl, env });
  assert.equal(created.id, "recApproved1");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].url, "https://api.airtable.com/v0/appInkJZdtOT67t8l/YSWS%20Project%20Submission");
  const createdFields = JSON.parse(calls[0].options.body).records[0].fields;
  assert.equal("Screenshot" in createdFields, false);
  assert.equal(createdFields["Optional - Override Hours Spent Justification"], justification);
  assert.equal(createdFields["Automation - Unified Justification"], justification);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(
    calls[1].url,
    "https://content.airtable.com/v0/appInkJZdtOT67t8l/recApproved1/Screenshot/uploadAttachment",
  );
  const upload = JSON.parse(calls[1].options.body);
  assert.equal(upload.contentType, "image/png");
  assert.equal(upload.filename, "shot.png");
  assert.equal(upload.file, png.toString("base64"));

  const again = await pushApprovedSubmission(
    { ...row, airtableRecordId: "recApproved1", airtablePushedAt: reviewedAt, screenshotUploaded: true },
    { fetchImpl, env },
  );
  assert.equal(again.skipped, true);
  assert.equal(calls.length, 2);
});

test("retries an existing Airtable row with PATCH instead of creating a second one", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return new Response(JSON.stringify({ records: [{ id: "recKept" }] }), { status: 200 });
  };
  await pushApprovedSubmission(
    reviewedRow({
      airtableRecordId: "recKept",
      airtablePushedAt: null,
      screenshotBytes: null,
      screenshotUploaded: false,
    }),
    { fetchImpl, env },
  );
  assert.deepEqual(calls.map((call) => call.method), ["PATCH"]);
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("deletes a new Airtable row when the screenshot upload fails", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    if (String(url).includes("uploadAttachment")) return new Response("no", { status: 500 });
    if (options.method === "DELETE") return new Response("", { status: 200 });
    return new Response(JSON.stringify({ records: [{ id: "recTemp" }] }), { status: 200 });
  };
  await assert.rejects(
    () =>
      pushApprovedSubmission(
        reviewedRow({
          screenshotBytes: Buffer.from("0123456789ab"),
          screenshotContentType: "image/png",
          screenshotFilename: "shot.png",
          airtableRecordId: null,
        }),
        { fetchImpl, env },
      ),
    (error) => {
      assert.equal(error.code, "AIRTABLE_UPLOAD");
      assert.equal(error.airtableRecordId, null);
      assert.match(error.message, /removed/);
      return true;
    },
  );
  assert.deepEqual(calls.map((call) => call.method), ["POST", "POST", "DELETE"]);
});
