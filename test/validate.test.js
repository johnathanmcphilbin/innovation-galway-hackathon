import assert from "node:assert/strict";
import test from "node:test";
import { ageOn, validateSignup, validateSubmission } from "../src/validate.js";

const adult = {
  first_name: "Niamh",
  last_name: "O'Brien",
  email: " Niamh@School.ie ",
  date_of_birth: "2007-11-21",
  school: "Coláiste Iognáid",
  dietary_needs: "",
  allergies: "Nuts",
  tshirt_size: "M",
  how_heard: "A poster in school",
  photo_consent: "yes",
};

test("age boundaries on 21 November 2026", () => {
  assert.equal(ageOn("2007-11-21"), 19);
  assert.equal(ageOn("2006-11-22"), 19);
  assert.equal(ageOn("2006-11-21"), 20);
  assert.equal(ageOn("2008-11-21"), 18);
  assert.equal(ageOn("2008-11-22"), 17);
});

test("accepts a 19-year-old and normalises the email", () => {
  const result = validateSignup(adult);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.email, "niamh@school.ie");
  assert.equal(result.value.firstName, "Niamh");
  assert.equal(result.value.lastName, "O'Brien");
  assert.equal(result.value.photoConsent, true);
  assert.equal(result.value.allergies, "Nuts");
  assert.equal(result.value.dietaryNeeds, null);
  assert.equal(result.value.guardianName, null);
  assert.equal(result.value.tshirtSize, "M");
});

test("requires a guardian for students under 18 on the day", () => {
  const under = validateSignup({ ...adult, date_of_birth: "2008-11-22", photo_consent: "" });
  assert.equal(under.ok, false);
  assert.ok(under.errors.some((error) => error.field === "guardian_name"));
  assert.equal(under.values.photo_consent, false);

  const withGuardian = validateSignup({
    ...adult,
    date_of_birth: "2008-11-22",
    guardian_name: "Aoife O'Brien",
    guardian_email: "Aoife@Example.com",
    guardian_phone: "+353 87 123 4567",
  });
  assert.equal(withGuardian.ok, true, JSON.stringify(withGuardian.errors));
  assert.equal(withGuardian.value.guardianEmail, "aoife@example.com");
  assert.equal(withGuardian.value.guardianPhone, "+353 87 123 4567");
});

test("does not require a guardian at 18", () => {
  const result = validateSignup({ ...adult, date_of_birth: "2008-11-21" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.guardianName, null);
});

test("rejects students who are already 20 on the day", () => {
  const result = validateSignup({ ...adult, date_of_birth: "2006-11-21" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, "date_of_birth");
});

test("rejects a bad email, a fake date, and an unknown shirt size", () => {
  const result = validateSignup({
    ...adult,
    email: "not-an-email",
    date_of_birth: "2026-02-31",
    tshirt_size: "tiny",
    first_name: "",
  });
  const fields = result.errors.map((error) => error.field);
  assert.ok(fields.includes("email"));
  assert.ok(fields.includes("date_of_birth"));
  assert.ok(fields.includes("tshirt_size"));
  assert.ok(fields.includes("first_name"));
});

const project = {
  first_name: "Cristian",
  last_name: "Rotariu",
  email: "Cristian@Example.com",
  birthday: "2008-04-02",
  github_username: "@cristian",
  code_url: "https://github.com/cristian/project",
  playable_url: "https://project.example.com/demo",
  screenshot_url: "https://images.example.com/shot.png",
  description: "A short voice guide that helps students pick a workshop.",
  team_members: "Cristian Rotariu",
  elevenlabs_use: "Narration for the workshop guide.",
  youth_impact: "It helps a student find a session that fits them.",
  how_heard: "A teacher",
  doing_well: "The brief is clear.",
  improve: "Publish the schedule sooner.",
  address1: "",
  city: "Galway",
};

test("accepts a project submission and keeps optional address empty", () => {
  const result = validateSubmission(project);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.email, "cristian@example.com");
  assert.equal(result.value.githubUsername, "cristian");
  assert.equal(result.value.projectName, "project");
  assert.equal(result.value.hackatimeId, null);
  assert.equal(result.value.address1, null);
  assert.equal(result.value.city, "Galway");
  assert.equal(result.value.birthday, "2008-04-02");
});

test("accepts an uploaded screenshot without a screenshot URL", () => {
  const result = validateSubmission({ ...project, screenshot_url: "" }, { hasScreenshot: true });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.screenshotUrl, null);
});

test("requires a screenshot file or a public screenshot URL", () => {
  const result = validateSubmission({ ...project, screenshot_url: "" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.field === "screenshot"));
});

test("reads a GitHub profile URL as a username", () => {
  const result = validateSubmission({
    ...project,
    github_username: "https://github.com/EveKen/",
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.githubUsername, "EveKen");
});

test("rejects submission links that are not public http(s) urls", () => {
  const result = validateSubmission({
    ...project,
    code_url: "javascript:alert(1)",
    playable_url: "localhost/demo",
    screenshot_url: "https://user:pass@images.example.com/a.png",
    description: "too short",
  });
  const fields = result.errors.map((error) => error.field);
  assert.ok(fields.includes("code_url"));
  assert.ok(fields.includes("playable_url"));
  assert.ok(fields.includes("screenshot_url"));
  assert.ok(fields.includes("description"));
});
