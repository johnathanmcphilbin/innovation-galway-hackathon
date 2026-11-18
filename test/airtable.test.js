import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_AIRTABLE_FIELDS,
  buildAirtableFields,
  submitToAirtable,
} from "../src/airtable.js";
import { validateSubmission } from "../src/validate.js";

const project = {
  first_name: "Cristian",
  last_name: "Rotariu",
  email: "cristian@example.com",
  birthday: "2008-04-02",
  github_username: "cristian",
  code_url: "https://github.com/cristian/project",
  playable_url: "https://project.example.com/demo",
  screenshot_url: "https://images.example.com/shot.png",
  description: "A voice guide for the day.\n\n**Workshops** are listed by age.",
  team_members: "Cristian Rotariu\nEve Kennedy",
  elevenlabs_use: "We generated the narration with ElevenLabs.",
  youth_impact: "Students can hear which session fits them.",
  how_heard: "A teacher",
  doing_well: "The brief is specific.",
  improve: "Put the timetable up sooner.",
  address1: "15 Market St",
  address2: "   ",
  city: "Galway",
  state: "",
  country: "Ireland",
  zip: "H91 TCX3",
};

function fieldsFrom(input) {
  const result = validateSubmission(input);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return buildAirtableFields(result.value);
}

test("maps a submission onto the YSWS fields and nothing else", () => {
  const fields = fieldsFrom(project);
  assert.deepEqual(Object.keys(fields).sort(), [
    "Address (Line 1)",
    "Birthday",
    "City",
    "Code URL",
    "Country",
    "Description",
    "Email",
    "First Name",
    "How can we improve?",
    "How did you hear about this?",
    "Justification - Additional Justification",
    "Last Name",
    "Playable URL",
    "Screenshot",
    "What are we doing well?",
    "ZIP / Postal Code",
  ]);

  for (const key of Object.keys(fields)) {
    assert.equal(ALLOWED_AIRTABLE_FIELDS.includes(key), true);
    assert.equal(/^(Automation-|Loops-|Optional\s*-\s*Override)/i.test(key), false);
  }
  assert.equal("Automation - Last Updated At" in fields, false);
  assert.equal(fields["Code URL"], "https://github.com/cristian/project");
  assert.equal(fields["Playable URL"], "https://project.example.com/demo");
  assert.deepEqual(fields.Screenshot, [{ url: "https://images.example.com/shot.png" }]);
  assert.deepEqual(Object.keys(fields.Screenshot[0]), ["url"]);
  assert.equal(fields.Description, project.description);
  assert.equal(fields.Birthday, "2008-04-02");
  assert.equal(fields["Address (Line 2)"] , undefined);
  assert.equal(fields["State / Province"], undefined);
  assert.equal(
    fields["Justification - Additional Justification"],
    [
      "Team members:\nCristian Rotariu\nEve Kennedy",
      "How ElevenLabs was used:\nWe generated the narration with ElevenLabs.",
      "How this helps young people:\nStudents can hear which session fits them.",
    ].join("\n\n"),
  );
});

test("omits blank optional address lines", () => {
  const fields = fieldsFrom({ ...project, address2: "   ", state: "" });
  assert.equal(fields["Address (Line 1)"], "15 Market St");
  assert.equal(fields["Address (Line 2)"], undefined);
  assert.equal(fields["State / Province"], undefined);
  assert.equal(fields.City, "Galway");
  assert.equal("GitHub Username" in fields, false);
});

test("posts only the allowed record to the named table", async () => {
  const calls = [];
  const result = validateSubmission(project);
  await submitToAirtable(result.value, {
    env: {
      AIRTABLE_API_KEY: "patSECRETVALUE",
      AIRTABLE_BASE_ID: "appInkJZdtOT67t8l",
      AIRTABLE_TABLE: "YSWS Project Submission",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ records: [{ id: "rec123" }] }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://api.airtable.com/v0/appInkJZdtOT67t8l/YSWS%20Project%20Submission",
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer patSECRETVALUE");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.typecast, undefined);
  assert.equal(body.records.length, 1);
  assert.equal("Automation - Last Updated At" in body.records[0].fields, false);
  assert.deepEqual(body.records[0].fields.Screenshot, [
    { url: "https://images.example.com/shot.png" },
  ]);
});

test("does not call Airtable or echo the token when configuration is missing", async () => {
  let called = false;
  await assert.rejects(
    () =>
      submitToAirtable(validateSubmission(project).value, {
        env: { AIRTABLE_API_KEY: "", AIRTABLE_BASE_ID: "" },
        fetchImpl: async () => {
          called = true;
          return new Response("no", { status: 500 });
        },
      }),
    (error) => {
      assert.equal(error.code, "AIRTABLE_CONFIG");
      assert.equal(String(error.message).includes("pat"), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("surfaces an Airtable field error without the access token", async () => {
  await assert.rejects(
    () =>
      submitToAirtable(validateSubmission(project).value, {
        env: {
          AIRTABLE_API_KEY: "patSECRETVALUE",
          AIRTABLE_BASE_ID: "appInkJZdtOT67t8l",
          AIRTABLE_TABLE: "YSWS Project Submission",
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: { message: "Unknown field name: Automation - Last Updated At" },
            }),
            { status: 422 },
          ),
      }),
    (error) => {
      assert.equal(error.code, "AIRTABLE_REJECTED");
      assert.equal(error.message.includes("patSECRETVALUE"), false);
      assert.match(error.message, /Unknown field name/);
      return true;
    },
  );
});
