import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import { signupsToCsv } from "../src/csv.js";
import { poolConfig } from "../src/db.js";
import { app } from "../src/server.js";

test("remote postgres uses ssl and drops sslmode from the url", () => {
  const config = poolConfig("postgres://user:secret@db.internal:5432/app?sslmode=require");
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false);
  assert.equal(config.connectionString.includes("secret"), true);
});

test("csv guards spreadsheet formulas and quotes", () => {
  const csv = signupsToCsv([
    {
      id: 1,
      created_at: "2026-11-01T12:00:00.000Z",
      first_name: '=HYPERLINK("http://example.test")',
      last_name: 'O"Brien',
      email: "a@b.ie",
      date_of_birth: "2008-01-02",
      school: "School",
      dietary_needs: null,
      allergies: null,
      tshirt_size: "M",
      guardian_name: null,
      guardian_email: null,
      guardian_phone: null,
      photo_consent: false,
      how_heard: null,
    },
  ]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"O""Brien"/);
  assert.match(csv, /a@b.ie/);
});

test("local postgres does not force ssl", () => {
  const config = poolConfig("postgres://user:secret@localhost:5432/app");
  assert.equal(config.ssl, false);
});

test("the signup handler never calls Airtable", () => {
  const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const signup = source.slice(source.indexOf('app.post(\n  "/signup"'), source.indexOf('app.get("/submit"'));
  assert.ok(signup.includes("insertSignup"));
  assert.equal(signup.includes("submitToAirtable"), false);
  assert.equal(signup.includes("airtable.com"), false);
  assert.equal(signup.toLowerCase().includes("slack"), false);
});

test("public pages render the event and the forms", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const get = async (path) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      return { status: response.status, html: await response.text(), type: response.headers.get("content-type") };
    };

    const home = await get("/");
    assert.equal(home.status, 200);
    assert.match(home.html, /Innovation/);
    assert.match(home.html, /Galway/);
    assert.match(home.html, /ElevenLabs/);
    assert.match(home.html, /Building for the youth/);
    assert.match(home.html, /A hackathon for students, by students/);
    assert.match(home.html, /How can technology create better opportunities and experiences for young people/);
    assert.match(home.html, /Schedule TBA/);
    assert.match(home.html, /PorterShed/);
    assert.match(home.html, /H91 TCX3/);
    assert.match(home.html, /Eve Kennedy/);
    assert.match(home.html, /Cristian Rotariu/);
    assert.match(home.html, /IdeasLab/);
    assert.match(home.html, /free ElevenLabs credits/i);
    assert.doesNotMatch(home.html, /slack/i);

    const signup = await get("/signup");
    assert.equal(signup.status, 200);
    assert.match(signup.html, /action="\/signup"/);
    for (const name of [
      "first_name",
      "last_name",
      "email",
      "date_of_birth",
      "school",
      "dietary_needs",
      "allergies",
      "tshirt_size",
      "guardian_name",
      "guardian_email",
      "guardian_phone",
      "photo_consent",
      "how_heard",
    ]) {
      assert.match(signup.html, new RegExp(`name="${name}"`));
    }

    const submit = await get("/submit");
    assert.equal(submit.status, 200);
    assert.match(submit.html, /action="\/submit"/);
    for (const name of [
      "code_url",
      "playable_url",
      "screenshot_url",
      "description",
      "github_username",
      "team_members",
      "elevenlabs_use",
      "youth_impact",
    ]) {
      assert.match(submit.html, new RegExp(`name="${name}"`));
    }

    const rejected = await fetch(`http://127.0.0.1:${port}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "first_name=",
    });
    assert.equal(rejected.status, 422);
    const rejectedHtml = await rejected.text();
    assert.match(rejectedHtml, /Enter a name/);
    assert.doesNotMatch(rejectedHtml, /slack/i);

    const admin = await get("/admin");
    assert.equal(admin.status, 200);
    assert.match(admin.html, /name="password"/);
    assert.match(admin.html, /noindex/);

    const css = await get("/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.type, /css/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
