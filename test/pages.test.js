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

test("submissions do not look up a sign-up, and the table migration stays", () => {
  const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const db = readFileSync(new URL("../src/db.js", import.meta.url), "utf8");
  assert.equal(server.includes("findSignupByEmail"), false);
  assert.equal(server.includes("insertSignup"), false);
  assert.equal(server.toLowerCase().includes("slack"), false);
  assert.match(db, /CREATE TABLE IF NOT EXISTS signups/);
  assert.doesNotMatch(db, /DROP TABLE/i);
});

test("public pages render the event and the forms", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const get = async (path) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      return {
        status: response.status,
        html: await response.text(),
        type: response.headers.get("content-type"),
        cache: response.headers.get("cache-control") || "",
      };
    };

    const home = await get("/");
    assert.equal(home.status, 200);
    assert.match(home.html, /<h1>Innovation Galway × ElevenLabs<\/h1>/);
    assert.match(home.html, /action="\/submit"/);
    assert.match(home.html, /enctype="multipart\/form-data"/);
    assert.doesNotMatch(home.html, /<nav/);
    assert.doesNotMatch(home.html, /<footer/);
    assert.doesNotMatch(home.html, /flag-orpheus/);
    assert.doesNotMatch(home.html, /How to ship your project/);
    assert.doesNotMatch(home.html, /Made possible by/);
    assert.doesNotMatch(home.html, /Building for the youth/);
    assert.doesNotMatch(home.html, /href="\/signup"/);
    assert.doesNotMatch(home.html, /sign up/i);
    assert.doesNotMatch(home.html, /slack/i);
    assert.doesNotMatch(home.html, /\/admin/);
    assert.doesNotMatch(home.html, /type="password"/);

    const signup = await fetch(`http://127.0.0.1:${port}/signup`, { redirect: "manual" });
    assert.equal(signup.status, 302);
    assert.equal(new URL(signup.headers.get("location"), `http://127.0.0.1:${port}`).pathname, "/submit");

    const signupPost = await fetch(`http://127.0.0.1:${port}/signup`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "first_name=Niamh",
    });
    assert.equal(signupPost.status, 303);
    assert.equal(new URL(signupPost.headers.get("location"), `http://127.0.0.1:${port}`).pathname, "/submit");

    const elsewhere = await fetch(`http://127.0.0.1:${port}/guides`, { redirect: "manual" });
    assert.equal(elsewhere.status, 302);
    assert.equal(new URL(elsewhere.headers.get("location"), `http://127.0.0.1:${port}`).pathname, "/submit");

    const submit = await get("/submit");
    assert.equal(submit.status, 200);
    assert.match(submit.html, /<h1>Innovation Galway × ElevenLabs<\/h1>/);
    assert.match(submit.html, /action="\/submit"/);
    for (const name of [
      "project_name",
      "birthday",
      "hackatime_id",
      "code_url",
      "playable_url",
      "screenshot",
      "screenshot_url",
      "description",
      "github_username",
      "team_members",
      "elevenlabs_use",
      "youth_impact",
      "address1",
      "address2",
      "city",
      "state",
      "country",
      "zip",
    ]) {
      assert.match(submit.html, new RegExp(`name="${name}"`));
    }

    const rejected = await fetch(`http://127.0.0.1:${port}/submit`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "first_name=",
    });
    assert.equal(rejected.status, 422);
    const rejectedHtml = await rejected.text();
    assert.match(rejectedHtml, /Enter a name/);
    assert.match(rejectedHtml, /<h1>Innovation Galway × ElevenLabs<\/h1>/);
    assert.doesNotMatch(rejectedHtml, /sign up/i);
    assert.doesNotMatch(rejectedHtml, /slack/i);
    assert.doesNotMatch(rejectedHtml, /type="password"/);

    for (const [method, route] of [
      ["GET", "/admin"],
      ["GET", "/admin/submissions/1"],
      ["GET", "/admin/submissions/1/screenshot"],
      ["POST", "/admin/login"],
      ["POST", "/admin/logout"],
      ["POST", "/admin/submissions/1"],
      ["POST", "/admin/submissions/1/delete"],
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`, {
        method,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: method === "POST" ? "password=x&decision=approve" : undefined,
        redirect: "manual",
      });
      assert.equal(res.status, method === "GET" ? 302 : 303, `${method} ${route}`);
      assert.equal(new URL(res.headers.get("location"), `http://127.0.0.1:${port}`).pathname, "/submit");
    }

    assert.match(home.html, /styles\.css\?v=[0-9a-f]{12}/);
    assert.doesNotMatch(home.html, /\.png|\.svg|woff2/);
    const version = home.html.match(/styles\.css\?v=([0-9a-f]{12})/)[1];

    const css = await get("/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.type, /css/);
    assert.match(css.cache, /max-age=0/);
    assert.match(css.cache, /must-revalidate/);
    assert.doesNotMatch(css.cache, /immutable/);

    const versioned = await fetch(`http://127.0.0.1:${port}/styles.css?v=${version}`);
    assert.equal(versioned.status, 200);
    assert.match(versioned.headers.get("cache-control"), /immutable/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
