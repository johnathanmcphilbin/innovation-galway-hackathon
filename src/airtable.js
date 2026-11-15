import { EVENT } from "./constants.js";

/** Fields this app is allowed to write. Nothing else, including formula fields. */
export const ALLOWED_AIRTABLE_FIELDS = [
  "Code URL",
  "Playable URL",
  "First Name",
  "Last Name",
  "Email",
  "Screenshot",
  "Description",
  "GitHub Username",
  "Birthday",
  "How did you hear about this?",
  "What are we doing well?",
  "How can we improve?",
  "Address (Line 1)",
  "Address (Line 2)",
  "City",
  "State / Province",
  "Country",
  "ZIP / Postal Code",
  "Justification - Additional Justification",
];

const ALLOWED = new Set(ALLOWED_AIRTABLE_FIELDS);

const BLOCKED_EXACT = new Set(["Automation - Last Updated At"]);

const BLOCKED_PATTERN = /^(Automation-|Loops-|Optional\s*-\s*Override|Geocoded\b|Formula\b)/i;

export function formatJustification({ teamMembers, elevenLabsUse, youthImpact }) {
  return [
    `Team members:\n${String(teamMembers).trim()}`,
    `How ElevenLabs was used:\n${String(elevenLabsUse).trim()}`,
    `How this helps young people:\n${String(youthImpact).trim()}`,
  ].join("\n\n");
}

function assertWritable(fields) {
  for (const key of Object.keys(fields)) {
    if (!ALLOWED.has(key) || BLOCKED_EXACT.has(key) || BLOCKED_PATTERN.test(key)) {
      throw new Error(`Refusing to write Airtable field: ${key}`);
    }
  }
}

export function buildAirtableFields(submission) {
  const fields = {
    "Code URL": submission.codeUrl,
    "Playable URL": submission.playableUrl,
    "First Name": submission.firstName,
    "Last Name": submission.lastName,
    Email: submission.email,
    Screenshot: [{ url: submission.screenshotUrl }],
    Description: submission.description,
    "GitHub Username": submission.githubUsername,
    Birthday: submission.birthday,
    "How did you hear about this?": submission.howHeard,
    "What are we doing well?": submission.doingWell,
    "How can we improve?": submission.improve,
    "Justification - Additional Justification": formatJustification(submission),
  };

  const address = {
    "Address (Line 1)": submission.address1,
    "Address (Line 2)": submission.address2,
    City: submission.city,
    "State / Province": submission.state,
    Country: submission.country,
    "ZIP / Postal Code": submission.zip,
  };
  for (const [key, value] of Object.entries(address)) {
    if (typeof value === "string" && value.trim()) fields[key] = value.trim();
  }

  assertWritable(fields);
  return fields;
}

export function airtableRecordUrl(env = process.env) {
  const base = String(env.AIRTABLE_BASE_ID || "").trim();
  const table = String(env.AIRTABLE_TABLE || EVENT.airtableTableName).trim() || EVENT.airtableTableName;
  return `https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`;
}

function publicAirtableMessage(bodyText) {
  let message = "Airtable rejected the project.";
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed?.error?.message) message = String(parsed.error.message);
  } catch {
    if (bodyText && bodyText.length < 240 && !bodyText.includes("<")) message = bodyText;
  }
  return message
    .replace(/pat[A-Za-z0-9.]{8,}/g, "[redacted]")
    .replace(/key[A-Za-z0-9]{8,}/g, "[redacted]")
    .slice(0, 280);
}

export async function submitToAirtable(submission, { fetchImpl = fetch, env = process.env } = {}) {
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  if (!apiKey || !baseId) {
    const error = new Error("Airtable is not configured.");
    error.code = "AIRTABLE_CONFIG";
    throw error;
  }

  const fields = buildAirtableFields(submission);
  const url = airtableRecordUrl({ ...env, AIRTABLE_BASE_ID: baseId });
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }] }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (cause) {
    if (cause?.name === "TimeoutError" || cause?.name === "AbortError") {
      const error = new Error("Airtable took too long to respond. Try again.");
      error.code = "AIRTABLE_TIMEOUT";
      throw error;
    }
    const error = new Error("Could not reach Airtable. Try again.");
    error.code = "AIRTABLE_NETWORK";
    throw error;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    const error = new Error(publicAirtableMessage(bodyText));
    error.code = "AIRTABLE_REJECTED";
    error.status = response.status;
    throw error;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    const error = new Error("Airtable returned an unreadable response.");
    error.code = "AIRTABLE_REJECTED";
    throw error;
  }
}
