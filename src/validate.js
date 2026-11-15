import { EVENT_DATE, TSHIRT_SIZES } from "./constants.js";

export { EVENT_DATE, TSHIRT_SIZES };

const EARLIEST_DOB = "2006-11-22";

function asString(value) {
  return typeof value === "string" ? value : "";
}

function cleanPersonName(raw) {
  const value = asString(raw).trim().replace(/\s+/g, " ").replace(/[’`]/g, "'");
  if (!value) return { error: "Enter a name." };
  if (value.length > 80) return { error: "Use 80 characters or fewer." };
  if (!/^[\p{L}][\p{L}\p{M}' -]*$/u.test(value)) {
    return { error: "Use letters, spaces, hyphens, or apostrophes." };
  }
  return { value };
}

export function cleanEmail(raw) {
  const value = asString(raw).trim().toLowerCase();
  if (!value) return { error: "Enter an email address." };
  if (value.length > 254) return { error: "That email address is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { error: "Enter a valid email address." };
  }
  return { value };
}

function cleanPhone(raw) {
  const value = asString(raw).trim().replace(/\s+/g, " ");
  if (!value) return { error: "Enter a phone number." };
  const digits = value.replace(/\D/g, "");
  if (!/^\+?[0-9][0-9().\-\s]{5,24}$/.test(value) || digits.length < 7 || digits.length > 15) {
    return { error: "Enter a phone number with 7 to 15 digits." };
  }
  return { value };
}

function cleanShortText(raw, { max, required, missing, label }) {
  const value = asString(raw).trim().replace(/[ \t]+/g, " ");
  if (!value) {
    if (required) return { error: missing || `Enter ${label}.` };
    return { value: null };
  }
  if (value.length > max) return { error: `Use ${max} characters or fewer.` };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    return { error: "Remove hidden control characters." };
  }
  return { value };
}

function cleanMultiline(raw, { min, max, label }) {
  const value = asString(raw).replace(/\r\n/g, "\n").trim();
  if (value.length < min) return { error: `${label} needs at least ${min} characters.` };
  if (value.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    return { error: "Remove hidden control characters." };
  }
  return { value };
}

export function parseISODate(raw) {
  const value = asString(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function ageOn(dob, on = EVENT_DATE) {
  const [y1, m1, d1] = dob.split("-").map(Number);
  const [y2, m2, d2] = on.split("-").map(Number);
  let age = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) age -= 1;
  return age;
}

export function parseHttpUrl(raw) {
  const value = asString(raw).trim();
  if (!value || value.length > 2000) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  return url.toString();
}

export function parseGithubUsername(raw) {
  let value = asString(raw).trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;
      const part = url.pathname.split("/").filter(Boolean)[0];
      if (!part) return null;
      value = part;
    } catch {
      return null;
    }
  }
  if (value.startsWith("@")) value = value.slice(1);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)) return null;
  return value;
}

function take(result, bucket, field) {
  if (result.error) bucket.push({ field, message: result.error });
  return result.value;
}

export function emptySignupValues() {
  return {
    first_name: "",
    last_name: "",
    email: "",
    date_of_birth: "",
    school: "",
    dietary_needs: "",
    allergies: "",
    tshirt_size: "",
    guardian_name: "",
    guardian_email: "",
    guardian_phone: "",
    photo_consent: false,
    how_heard: "",
  };
}

export function validateSignup(input) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const firstName = take(cleanPersonName(src.first_name), errors, "first_name");
  const lastName = take(cleanPersonName(src.last_name), errors, "last_name");
  const emailResult = cleanEmail(src.email);
  if (emailResult.error) errors.push({ field: "email", message: emailResult.error });
  const dob = parseISODate(src.date_of_birth);
  let age = null;
  if (!dob) {
    errors.push({ field: "date_of_birth", message: "Enter a real date of birth." });
  } else if (dob > EVENT_DATE) {
    errors.push({
      field: "date_of_birth",
      message: "Enter a date of birth on or before 21 November 2026.",
    });
  } else if (dob < EARLIEST_DOB) {
    errors.push({
      field: "date_of_birth",
      message: "This hackathon is for students aged 19 and under on 21 November 2026.",
    });
  } else {
    age = ageOn(dob);
  }

  const school = take(
    cleanShortText(src.school, {
      max: 160,
      required: true,
      missing: "Enter your school.",
    }),
    errors,
    "school",
  );
  if (school && !/\p{L}/u.test(school)) {
    errors.push({ field: "school", message: "Enter your school." });
  }

  const dietary = take(
    cleanShortText(src.dietary_needs, { max: 400, required: false }),
    errors,
    "dietary_needs",
  );
  const allergies = take(
    cleanShortText(src.allergies, { max: 400, required: false }),
    errors,
    "allergies",
  );

  const tshirt = asString(src.tshirt_size).trim();
  if (!TSHIRT_SIZES.includes(tshirt)) {
    errors.push({ field: "tshirt_size", message: "Choose a t-shirt size." });
  }

  const howHeard = take(
    cleanShortText(src.how_heard, { max: 300, required: false }),
    errors,
    "how_heard",
  );

  const guardianRaw = {
    name: asString(src.guardian_name).trim(),
    email: asString(src.guardian_email).trim(),
    phone: asString(src.guardian_phone).trim(),
  };
  const needsGuardian = age !== null && age < 18;
  const guardianStarted = Boolean(guardianRaw.name || guardianRaw.email || guardianRaw.phone);
  let guardianName = null;
  let guardianEmail = null;
  let guardianPhone = null;
  if (needsGuardian || guardianStarted) {
    const name = cleanPersonName(src.guardian_name);
    if (name.error) {
      errors.push({
        field: "guardian_name",
        message: needsGuardian
          ? "Add a parent or guardian. You will be under 18 on 21 November 2026."
          : name.error,
      });
    } else {
      guardianName = name.value;
    }
    const guardianEmailResult = cleanEmail(src.guardian_email);
    if (guardianEmailResult.error) {
      errors.push({
        field: "guardian_email",
        message: "Enter the parent or guardian's email.",
      });
    } else {
      guardianEmail = guardianEmailResult.value;
    }
    const phone = cleanPhone(src.guardian_phone);
    if (phone.error) {
      errors.push({
        field: "guardian_phone",
        message: "Enter the parent or guardian's phone number.",
      });
    } else {
      guardianPhone = phone.value;
    }
  }

  const values = {
    first_name: asString(src.first_name).trim().replace(/\s+/g, " "),
    last_name: asString(src.last_name).trim().replace(/\s+/g, " "),
    email: asString(src.email).trim(),
    date_of_birth: asString(src.date_of_birth).trim(),
    school: asString(src.school).trim(),
    dietary_needs: asString(src.dietary_needs).trim(),
    allergies: asString(src.allergies).trim(),
    tshirt_size: tshirt,
    guardian_name: asString(src.guardian_name).trim(),
    guardian_email: asString(src.guardian_email).trim(),
    guardian_phone: asString(src.guardian_phone).trim(),
    photo_consent: asString(src.photo_consent) === "yes",
    how_heard: asString(src.how_heard).trim(),
  };

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    values,
    value: ok
      ? {
          firstName,
          lastName,
          email: emailResult.value,
          dateOfBirth: dob,
          school,
          dietaryNeeds: dietary,
          allergies,
          tshirtSize: tshirt,
          guardianName,
          guardianEmail,
          guardianPhone,
          photoConsent: values.photo_consent,
          howHeard,
        }
      : null,
  };
}

export function emptySubmissionValues() {
  return {
    first_name: "",
    last_name: "",
    email: "",
    birthday: "",
    github_username: "",
    project_name: "",
    hackatime_id: "",
    code_url: "",
    playable_url: "",
    screenshot_url: "",
    description: "",
    team_members: "",
    elevenlabs_use: "",
    youth_impact: "",
    how_heard: "",
    doing_well: "",
    improve: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    country: "",
    zip: "",
  };
}

function derivedProjectName(codeUrl) {
  try {
    const url = new URL(codeUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const repo = parts.length >= 2 ? parts[1] : parts[0];
    if (!repo) return "Untitled project";
    const name = decodeURIComponent(repo).replace(/\.git$/i, "").replace(/[-_]+/g, " ").trim();
    if (!name || name.length > 120) return "Untitled project";
    return name;
  } catch {
    return "Untitled project";
  }
}

export function validateSubmission(input, { hasScreenshot = false } = {}) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const firstName = take(cleanPersonName(src.first_name), errors, "first_name");
  const lastName = take(cleanPersonName(src.last_name), errors, "last_name");
  const emailResult = cleanEmail(src.email);
  if (emailResult.error) errors.push({ field: "email", message: emailResult.error });

  const birthday = parseISODate(src.birthday);
  if (!birthday) {
    errors.push({ field: "birthday", message: "Enter a real birthday as YYYY-MM-DD." });
  }

  const github = parseGithubUsername(src.github_username);
  if (!github) {
    errors.push({
      field: "github_username",
      message: "Enter a GitHub username, like octocat.",
    });
  }

  const projectNameResult = cleanShortText(src.project_name, {
    max: 120,
    required: false,
    label: "the project name",
  });
  if (projectNameResult.error) errors.push({ field: "project_name", message: projectNameResult.error });

  const hackatimeResult = cleanShortText(src.hackatime_id, {
    max: 80,
    required: false,
    label: "the Hackatime ID",
  });
  if (hackatimeResult.error) errors.push({ field: "hackatime_id", message: hackatimeResult.error });

  const codeUrl = parseHttpUrl(src.code_url);
  if (!codeUrl) errors.push({ field: "code_url", message: "Enter an http(s) link to the code." });
  const playableUrl = parseHttpUrl(src.playable_url);
  if (!playableUrl) {
    errors.push({ field: "playable_url", message: "Enter an http(s) link where the project can be tried." });
  }
  const screenshotRaw = asString(src.screenshot_url).trim();
  let screenshotUrl = null;
  if (screenshotRaw) {
    screenshotUrl = parseHttpUrl(screenshotRaw);
    if (!screenshotUrl) {
      errors.push({
        field: "screenshot_url",
        message: "Enter a public http(s) link to a hosted screenshot.",
      });
    }
  } else if (!hasScreenshot) {
    errors.push({
      field: "screenshot",
      message: "Upload a screenshot, or paste a public image link.",
    });
  }

  const description = take(
    cleanMultiline(src.description, { min: 20, max: 8000, label: "Description" }),
    errors,
    "description",
  );
  const teamMembers = take(
    cleanMultiline(src.team_members, { min: 2, max: 2000, label: "Team members" }),
    errors,
    "team_members",
  );
  const elevenLabsUse = take(
    cleanMultiline(src.elevenlabs_use, { min: 2, max: 2000, label: "How you used ElevenLabs" }),
    errors,
    "elevenlabs_use",
  );
  const youthImpact = take(
    cleanMultiline(src.youth_impact, { min: 2, max: 2000, label: "How it helps young people" }),
    errors,
    "youth_impact",
  );
  const howHeard = take(
    cleanMultiline(src.how_heard, { min: 2, max: 2000, label: "How you heard about this" }),
    errors,
    "how_heard",
  );
  const doingWell = take(
    cleanMultiline(src.doing_well, { min: 2, max: 2000, label: "What we are doing well" }),
    errors,
    "doing_well",
  );
  const improve = take(
    cleanMultiline(src.improve, { min: 2, max: 2000, label: "How we can improve" }),
    errors,
    "improve",
  );

  const address = {};
  for (const [field, label] of [
    ["address1", "Address line 1"],
    ["address2", "Address line 2"],
    ["city", "City"],
    ["state", "State or province"],
    ["country", "Country"],
    ["zip", "Postcode"],
  ]) {
    address[field] = take(
      cleanShortText(src[field], { max: 120, required: false, label }),
      errors,
      field,
    );
  }

  const values = { ...emptySubmissionValues() };
  for (const key of Object.keys(values)) {
    values[key] = asString(src[key]).trim();
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    values,
    value: ok
      ? {
          firstName,
          lastName,
          email: emailResult.value,
          birthday,
          projectName: projectNameResult.value || derivedProjectName(codeUrl),
          hackatimeId: hackatimeResult.value,
          githubUsername: github,
          codeUrl,
          playableUrl,
          screenshotUrl,
          description,
          teamMembers,
          elevenLabsUse,
          youthImpact,
          howHeard,
          doingWell,
          improve,
          address1: address.address1,
          address2: address.address2,
          city: address.city,
          state: address.state,
          country: address.country,
          zip: address.zip,
        }
      : null,
  };
}

function cleanOptionalMultiline(raw, { max, label }) {
  const value = asString(raw).replace(/\r\n/g, "\n").trim();
  if (!value) return { value: "" };
  if (value.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    return { error: "Remove hidden control characters." };
  }
  return { value };
}

function parseHours(raw) {
  const value = asString(raw).trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) {
    return { error: "Enter approved hours as a number, like 5 or 4.5." };
  }
  const hours = Number(value);
  if (hours > 200) return { error: "Enter 200 hours or fewer." };
  return { value: hours };
}

export function emptyReviewValues(fallback = {}) {
  return {
    project_name: fallback.project_name || "",
    reviewer_name: fallback.reviewer_name || "",
    approved_hours: fallback.approved_hours || "",
    reviewer_feedback: fallback.reviewer_feedback || "",
    just_hackatime_projects: fallback.just_hackatime_projects || "",
    just_hackatime_id: fallback.just_hackatime_id || "",
    just_lapse_links: fallback.just_lapse_links || "",
    just_technical_features: fallback.just_technical_features || "",
    just_deflation: fallback.just_deflation || "",
    just_alternate_tracking: fallback.just_alternate_tracking || "",
    just_additional: fallback.just_additional || "",
  };
}

export function validateReview(input) {
  const src = input && typeof input === "object" ? input : {};
  const errors = [];
  const projectName = take(
    cleanShortText(src.project_name, {
      max: 120,
      required: true,
      missing: "Enter the project name.",
    }),
    errors,
    "project_name",
  );
  const reviewerName = take(cleanPersonName(src.reviewer_name), errors, "reviewer_name");
  const hoursResult = parseHours(src.approved_hours);
  if (hoursResult.error) errors.push({ field: "approved_hours", message: hoursResult.error });
  const feedback = take(
    cleanMultiline(src.reviewer_feedback, { min: 2, max: 8000, label: "Feedback" }),
    errors,
    "reviewer_feedback",
  );

  const optionalFields = [
    ["just_hackatime_projects", "Hackatime projects"],
    ["just_hackatime_id", "Hackatime ID"],
    ["just_lapse_links", "Lapse links"],
    ["just_technical_features", "Technical features"],
    ["just_deflation", "Deflation justification"],
    ["just_alternate_tracking", "Alternate tracking"],
    ["just_additional", "Additional justification"],
  ];
  const optional = {};
  for (const [field, label] of optionalFields) {
    const result = cleanOptionalMultiline(src[field], { max: 8000, label });
    if (result.error) errors.push({ field, message: result.error });
    optional[field] = result.value || "";
  }

  const values = emptyReviewValues();
  for (const key of Object.keys(values)) {
    values[key] = asString(src[key]).replace(/\r\n/g, "\n").trim();
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    values,
    value: ok
      ? {
          projectName,
          reviewerName,
          approvedHours: hoursResult.value,
          reviewerFeedback: feedback,
          justHackatimeProjects: optional.just_hackatime_projects,
          justHackatimeId: optional.just_hackatime_id,
          justLapseLinks: optional.just_lapse_links,
          justTechnicalFeatures: optional.just_technical_features,
          justDeflation: optional.just_deflation,
          justAlternateTracking: optional.just_alternate_tracking,
          justAdditional: optional.just_additional,
        }
      : null,
  };
}
