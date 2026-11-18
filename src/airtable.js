import { EVENT } from "./constants.js";
import { formatJustification, formatOverrideJustification } from "./review.js";

/** Participant fields. The direct mapper used before a review does not add hours. */
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

/** Written only when a reviewer approves. Screenshot bytes go through uploadAttachment. */
export const APPROVAL_AIRTABLE_FIELDS = [
  ...ALLOWED_AIRTABLE_FIELDS,
  "Optional - Override Hours Spent",
  "Optional - Override Hours Spent Justification",
  "Justification - Hackatime Project Name(s) + Date Range(s)",
  "Justification - Submitter Hackatime ID",
  "Justification - Lapse Links, comma-separated",
  "Justification - Specific Technical Features",
  "Justification - Deflation Justification",
  "Justification - Alternate Tracking Method",
];

/** Airtable automations and Loops fill these. This app never writes them. */
export const UNTOUCHED_AIRTABLE_FIELDS = [
  "Automation - Submit to Unified YSWS",
  "Automation - Unified Justification",
  "Automation - Error",
  "Automation - First Submitted At",
  "Automation - Last Updated At",
  "Automation - YSWS Record ID",
];

const ALLOWED = new Set(ALLOWED_AIRTABLE_FIELDS);
const APPROVAL_ALLOWED = new Set(APPROVAL_AIRTABLE_FIELDS);
const UNTOUCHED = new Set(UNTOUCHED_AIRTABLE_FIELDS);

const BLOCKED_EXACT = new Set(["Automation - Last Updated At"]);
const BLOCKED_PATTERN = /^(Automation-|Loops-|Optional\s*-\s*Override|Geocoded\b|Formula\b)/i;

export { formatJustification };

function assertWritable(fields) {
  for (const key of Object.keys(fields)) {
    if (!ALLOWED.has(key) || BLOCKED_EXACT.has(key) || BLOCKED_PATTERN.test(key)) {
      throw new Error(`Refusing to write Airtable field: ${key}`);
    }
  }
}

function assertApprovalWritable(fields) {
  for (const key of Object.keys(fields)) {
    if (UNTOUCHED.has(key) || /^Loops-/i.test(key) || !APPROVAL_ALLOWED.has(key)) {
      throw new Error(`Refusing to write Airtable field: ${key}`);
    }
  }
}

function addressFields(submission) {
  const address = {
    "Address (Line 1)": submission.address1,
    "Address (Line 2)": submission.address2,
    City: submission.city,
    "State / Province": submission.state,
    Country: submission.country,
    "ZIP / Postal Code": submission.zip,
  };
  const fields = {};
  for (const [key, value] of Object.entries(address)) {
    if (typeof value === "string" && value.trim()) fields[key] = value.trim();
  }
  return fields;
}

function participantFields(submission, { includeScreenshotUrl }) {
  const fields = {
    "Code URL": submission.codeUrl,
    "Playable URL": submission.playableUrl,
    "First Name": submission.firstName,
    "Last Name": submission.lastName,
    Email: submission.email,
    Description: submission.description,
    Birthday: submission.birthday,
    "How did you hear about this?": submission.howHeard,
    "What are we doing well?": submission.doingWell,
    "How can we improve?": submission.improve,
    "Justification - Additional Justification": formatJustification(submission),
    ...addressFields(submission),
  };
  putText(fields, "GitHub Username", submission.githubUsername);
  if (includeScreenshotUrl && submission.screenshotUrl) {
    fields.Screenshot = [{ url: submission.screenshotUrl }];
  }
  return fields;
}

export function buildAirtableFields(submission) {
  const fields = participantFields(submission, { includeScreenshotUrl: true });
  assertWritable(fields);
  return fields;
}

function putText(fields, key, value) {
  if (typeof value === "string" && value.trim()) fields[key] = value.trim();
}

export function airtableSyncEnabled(env = process.env) {
  return String(env.SYNC_APPROVED_TO_AIRTABLE || "").trim().toLowerCase() === "true";
}

export function buildApprovedAirtableFields(row, { includeScreenshotUrl = true } = {}) {
  const reviewedAt = row.reviewedAt instanceof Date ? row.reviewedAt : new Date(row.reviewedAt);
  const justification = formatOverrideJustification({
    projectName: row.projectName,
    reviewerName: row.reviewerName,
    reviewedAt,
    feedback: row.reviewerFeedback,
  });
  const hours = Number(row.approvedHours);
  if (!Number.isFinite(hours)) {
    throw new Error("Approved hours are missing.");
  }

  const fields = participantFields(row, { includeScreenshotUrl });
  fields["Optional - Override Hours Spent"] = hours;
  fields["Optional - Override Hours Spent Justification"] = justification;
  putText(fields, "Justification - Hackatime Project Name(s) + Date Range(s)", row.justHackatimeProjects);
  putText(fields, "Justification - Submitter Hackatime ID", row.justHackatimeId);
  putText(fields, "Justification - Lapse Links, comma-separated", row.justLapseLinks);
  putText(fields, "Justification - Specific Technical Features", row.justTechnicalFeatures);
  putText(fields, "Justification - Deflation Justification", row.justDeflation);
  putText(fields, "Justification - Alternate Tracking Method", row.justAlternateTracking);
  if (typeof row.justAdditional === "string") {
    if (row.justAdditional.trim()) fields["Justification - Additional Justification"] = row.justAdditional.trim();
    else delete fields["Justification - Additional Justification"];
  }

  assertApprovalWritable(fields);
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

let fetchOverride = null;

/** Test seam. Production leaves this unset and uses global fetch. */
export function setAirtableFetchForTests(fetchImpl) {
  fetchOverride = fetchImpl || null;
}

function resolveFetch(fetchImpl) {
  return fetchImpl || fetchOverride || fetch;
}

function airtableConfig(env) {
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  if (!apiKey || !baseId) {
    const error = new Error("Airtable is not configured.");
    error.code = "AIRTABLE_CONFIG";
    throw error;
  }
  return { apiKey, baseId };
}

async function airtableRequest(fetchImpl, url, { method, apiKey, body }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body == null ? undefined : JSON.stringify(body),
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
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    const error = new Error("Airtable returned an unreadable response.");
    error.code = "AIRTABLE_REJECTED";
    throw error;
  }
}

export async function submitToAirtable(submission, { fetchImpl = fetch, env = process.env } = {}) {
  const { apiKey, baseId } = airtableConfig(env);
  const fields = buildAirtableFields(submission);
  const url = airtableRecordUrl({ ...env, AIRTABLE_BASE_ID: baseId });
  return airtableRequest(fetchImpl, url, {
    method: "POST",
    apiKey,
    body: { records: [{ fields }] },
  });
}

async function deleteRecord(fetchImpl, url, apiKey) {
  try {
    await airtableRequest(fetchImpl, url, { method: "DELETE", apiKey });
    return true;
  } catch {
    return false;
  }
}

export async function pushApprovedSubmission(row, { fetchImpl, env = process.env } = {}) {
  const request = resolveFetch(fetchImpl);
  const { apiKey, baseId } = airtableConfig(env);
  if (row.airtablePushedAt && row.airtableRecordId) {
    return { id: row.airtableRecordId, skipped: true };
  }

  const includeScreenshotUrl = !row.screenshotBytes && Boolean(row.screenshotUrl);
  const fields = buildApprovedAirtableFields(row, { includeScreenshotUrl });
  const tableUrl = airtableRecordUrl({ ...env, AIRTABLE_BASE_ID: baseId });
  let recordId = row.airtableRecordId || null;
  let created = false;

  if (!recordId) {
    const createdBody = await airtableRequest(request, tableUrl, {
      method: "POST",
      apiKey,
      body: { records: [{ fields }] },
    });
    recordId = createdBody?.records?.[0]?.id;
    if (!recordId) {
      const error = new Error("Airtable did not return a record id.");
      error.code = "AIRTABLE_REJECTED";
      throw error;
    }
    created = true;
  } else {
    await airtableRequest(request, tableUrl, {
      method: "PATCH",
      apiKey,
      body: { records: [{ id: recordId, fields }] },
    });
  }

  if (row.screenshotBytes && !row.screenshotUploaded) {
    const uploadUrl = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent("Screenshot")}/uploadAttachment`;
    try {
      await airtableRequest(request, uploadUrl, {
        method: "POST",
        apiKey,
        body: {
          contentType: row.screenshotContentType,
          filename: row.screenshotFilename || "screenshot.png",
          file: Buffer.from(row.screenshotBytes).toString("base64"),
        },
      });
    } catch (cause) {
      let keptId = recordId;
      if (created) {
        const deleted = await deleteRecord(request, `${tableUrl}/${recordId}`, apiKey);
        keptId = deleted ? null : recordId;
      }
      const error = new Error(
        keptId
          ? "The screenshot did not upload. The Airtable row was kept so a retry will not create a duplicate."
          : "The screenshot did not upload, so the new Airtable row was removed. Nothing was left half-submitted.",
      );
      error.code = "AIRTABLE_UPLOAD";
      error.airtableRecordId = keptId;
      error.cause = cause;
      throw error;
    }
  }

  return { id: recordId, created };
}
