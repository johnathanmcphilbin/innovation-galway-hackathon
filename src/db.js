import pg from "pg";
import { imageBytes } from "./screenshot.js";

pg.types.setTypeParser(1082, (value) => value);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS signups (
    id BIGSERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    school TEXT NOT NULL,
    dietary_needs TEXT,
    allergies TEXT,
    tshirt_size TEXT NOT NULL,
    guardian_name TEXT,
    guardian_email TEXT,
    guardian_phone TEXT,
    photo_consent BOOLEAN NOT NULL DEFAULT FALSE,
    how_heard TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS signups_email_unique ON signups (email)`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id BIGSERIAL PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    project_name TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    birthday DATE NOT NULL,
    github_username TEXT NOT NULL,
    hackatime_id TEXT,
    code_url TEXT NOT NULL,
    playable_url TEXT NOT NULL,
    screenshot_url TEXT,
    screenshot_bytes BYTEA,
    screenshot_content_type TEXT,
    screenshot_filename TEXT,
    screenshot_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT NOT NULL,
    team_members TEXT NOT NULL,
    elevenlabs_use TEXT NOT NULL,
    youth_impact TEXT NOT NULL,
    how_heard TEXT NOT NULL,
    doing_well TEXT NOT NULL,
    improve TEXT NOT NULL,
    address1 TEXT,
    address2 TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    zip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewer_name TEXT,
    approved_hours NUMERIC,
    reviewer_feedback TEXT,
    just_hackatime_projects TEXT,
    just_hackatime_id TEXT,
    just_lapse_links TEXT,
    just_technical_features TEXT,
    just_deflation TEXT,
    just_alternate_tracking TEXT,
    just_additional TEXT,
    airtable_record_id TEXT,
    airtable_pushed_at TIMESTAMPTZ,
    airtable_error TEXT,
    CONSTRAINT submissions_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
  )`,
  `CREATE INDEX IF NOT EXISTS submissions_status_created_idx ON submissions (status, created_at DESC)`,
];

const DB_DOWN = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "57P01",
  "53300",
  "28P01",
  "3D000",
  "08000",
  "08003",
  "08006",
  "08001",
]);

let pool;

export function poolConfig(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a postgres connection string.");
  }
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  const ssl = local || sslmode === "disable" ? false : { rejectUnauthorized: false };
  return {
    connectionString: url.toString(),
    ssl,
    max: 5,
    idleTimeoutMillis: 10_000,
  };
}

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new pg.Pool(poolConfig(process.env.DATABASE_URL));
  return pool;
}

export function isDbUnavailable(error) {
  return Boolean(error && (error.code === "DB_CONFIG" || DB_DOWN.has(error.code)));
}

async function requirePool() {
  const active = getPool();
  if (!active) {
    const error = new Error("DATABASE_URL is not set.");
    error.code = "DB_CONFIG";
    throw error;
  }
  return active;
}

export async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set. The app runs without it.");
    return;
  }
  const delays = [0, 1000, 2000, 3000, 5000, 5000, 5000];
  let last;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const active = getPool();
      for (const statement of SCHEMA) await active.query(statement);
      console.log("Database schema is ready.");
      return;
    } catch (error) {
      last = error;
      console.error(`Migration attempt failed (${error.code || error.name}).`);
    }
  }
  throw last;
}

export async function insertSignup(signup) {
  const active = await requirePool();
  try {
    const result = await active.query(
      `INSERT INTO signups (
        first_name, last_name, email, date_of_birth, school,
        dietary_needs, allergies, tshirt_size,
        guardian_name, guardian_email, guardian_phone,
        photo_consent, how_heard
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`,
      [
        signup.firstName,
        signup.lastName,
        signup.email,
        signup.dateOfBirth,
        signup.school,
        signup.dietaryNeeds,
        signup.allergies,
        signup.tshirtSize,
        signup.guardianName,
        signup.guardianEmail,
        signup.guardianPhone,
        signup.photoConsent,
        signup.howHeard,
      ],
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const duplicate = new Error("That email is already signed up.");
      duplicate.code = "DUPLICATE_EMAIL";
      throw duplicate;
    }
    throw error;
  }
}

export async function findSignupByEmail(email) {
  const active = await requirePool();
  const result = await active.query(`SELECT id, email FROM signups WHERE email = $1`, [email]);
  return result.rows[0] || null;
}

export async function listSignups() {
  const active = await requirePool();
  const result = await active.query(
    `SELECT id, first_name, last_name, email, date_of_birth, school,
            dietary_needs, allergies, tshirt_size,
            guardian_name, guardian_email, guardian_phone,
            photo_consent, how_heard, created_at
     FROM signups
     ORDER BY created_at DESC, id DESC`,
  );
  return result.rows;
}

const SUBMISSION_COLUMNS = `
  id, status, project_name, first_name, last_name, email, birthday,
  github_username, hackatime_id, code_url, playable_url, screenshot_url,
  screenshot_content_type, screenshot_filename, screenshot_uploaded,
  description, team_members, elevenlabs_use, youth_impact,
  how_heard, doing_well, improve,
  address1, address2, city, state, country, zip,
  created_at, reviewed_at, reviewer_name, approved_hours, reviewer_feedback,
  just_hackatime_projects, just_hackatime_id, just_lapse_links,
  just_technical_features, just_deflation, just_alternate_tracking, just_additional,
  airtable_record_id, airtable_pushed_at, airtable_error
`;

function mapSubmission(row, { includeBytes = false } = {}) {
  if (!row) return null;
  return {
    id: Number(row.id),
    status: row.status,
    projectName: row.project_name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    birthday: row.birthday,
    githubUsername: row.github_username,
    hackatimeId: row.hackatime_id,
    codeUrl: row.code_url,
    playableUrl: row.playable_url,
    screenshotUrl: row.screenshot_url,
    screenshotContentType: row.screenshot_content_type,
    screenshotFilename: row.screenshot_filename,
    screenshotUploaded: row.screenshot_uploaded,
    screenshotBytes: includeBytes ? imageBytes(row.screenshot_bytes) : undefined,
    description: row.description,
    teamMembers: row.team_members,
    elevenLabsUse: row.elevenlabs_use,
    youthImpact: row.youth_impact,
    howHeard: row.how_heard,
    doingWell: row.doing_well,
    improve: row.improve,
    address1: row.address1,
    address2: row.address2,
    city: row.city,
    state: row.state,
    country: row.country,
    zip: row.zip,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewerName: row.reviewer_name,
    approvedHours: row.approved_hours == null ? null : Number(row.approved_hours),
    reviewerFeedback: row.reviewer_feedback,
    justHackatimeProjects: row.just_hackatime_projects,
    justHackatimeId: row.just_hackatime_id,
    justLapseLinks: row.just_lapse_links,
    justTechnicalFeatures: row.just_technical_features,
    justDeflation: row.just_deflation,
    justAlternateTracking: row.just_alternate_tracking,
    justAdditional: row.just_additional,
    airtableRecordId: row.airtable_record_id,
    airtablePushedAt: row.airtable_pushed_at,
    airtableError: row.airtable_error,
  };
}

export async function insertSubmission(submission, screenshot = null) {
  const active = await requirePool();
  const result = await active.query(
    `INSERT INTO submissions (
      project_name, first_name, last_name, email, birthday,
      github_username, hackatime_id, code_url, playable_url, screenshot_url,
      screenshot_bytes, screenshot_content_type, screenshot_filename,
      description, team_members, elevenlabs_use, youth_impact,
      how_heard, doing_well, improve,
      address1, address2, city, state, country, zip
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
    ) RETURNING id`,
    [
      submission.projectName,
      submission.firstName,
      submission.lastName,
      submission.email,
      submission.birthday,
      submission.githubUsername,
      submission.hackatimeId,
      submission.codeUrl,
      submission.playableUrl,
      submission.screenshotUrl,
      screenshot?.bytes || null,
      screenshot?.contentType || null,
      screenshot?.filename || null,
      submission.description,
      submission.teamMembers,
      submission.elevenLabsUse,
      submission.youthImpact,
      submission.howHeard,
      submission.doingWell,
      submission.improve,
      submission.address1,
      submission.address2,
      submission.city,
      submission.state,
      submission.country,
      submission.zip,
    ],
  );
  return Number(result.rows[0].id);
}

const STATUSES = new Set(["pending", "approved", "rejected"]);

export async function listSubmissions(status = "pending") {
  const active = await requirePool();
  const filter = status === "all" || !STATUSES.has(status) ? null : status;
  const result = await active.query(
    `SELECT ${SUBMISSION_COLUMNS}
     FROM submissions
     ${filter ? "WHERE status = $1" : ""}
     ORDER BY created_at DESC, id DESC`,
    filter ? [filter] : [],
  );
  return result.rows.map((row) => mapSubmission(row));
}

export async function submissionCounts() {
  const active = await requirePool();
  const result = await active.query(`SELECT status, COUNT(*)::int AS n FROM submissions GROUP BY status`);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of result.rows) {
    if (row.status in counts) counts[row.status] = row.n;
  }
  counts.all = counts.pending + counts.approved + counts.rejected;
  return counts;
}

export async function getSubmission(id, { includeBytes = false } = {}) {
  const active = await requirePool();
  const columns = includeBytes ? `${SUBMISSION_COLUMNS}, screenshot_bytes` : SUBMISSION_COLUMNS;
  const result = await active.query(`SELECT ${columns} FROM submissions WHERE id = $1`, [id]);
  return mapSubmission(result.rows[0], { includeBytes });
}

export async function getScreenshot(id) {
  const active = await requirePool();
  const result = await active.query(
    `SELECT screenshot_bytes, screenshot_content_type, screenshot_filename
     FROM submissions WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  const bytes = imageBytes(row?.screenshot_bytes);
  if (!bytes || bytes.length === 0) return null;
  return {
    bytes,
    contentType: row.screenshot_content_type,
    filename: row.screenshot_filename,
  };
}

export async function deleteSubmission(id) {
  const active = await requirePool();
  const result = await active.query(`DELETE FROM submissions WHERE id = $1`, [id]);
  return result.rowCount > 0;
}

export async function saveReview(id, review) {
  const active = await requirePool();
  const result = await active.query(
    `UPDATE submissions SET
      status = $2,
      project_name = $3,
      reviewer_name = $4,
      approved_hours = $5,
      reviewer_feedback = $6,
      just_hackatime_projects = $7,
      just_hackatime_id = $8,
      just_lapse_links = $9,
      just_technical_features = $10,
      just_deflation = $11,
      just_alternate_tracking = $12,
      just_additional = $13,
      reviewed_at = $14
     WHERE id = $1 AND airtable_pushed_at IS NULL
     RETURNING id`,
    [
      id,
      review.status,
      review.projectName,
      review.reviewerName,
      review.approvedHours,
      review.reviewerFeedback,
      review.justHackatimeProjects,
      review.justHackatimeId,
      review.justLapseLinks,
      review.justTechnicalFeatures,
      review.justDeflation,
      review.justAlternateTracking,
      review.justAdditional,
      review.reviewedAt,
    ],
  );
  return result.rowCount > 0;
}

export async function recordAirtablePush(id, { recordId, pushed, error, screenshotUploaded }) {
  const active = await requirePool();
  await active.query(
    `UPDATE submissions SET
      airtable_record_id = $2,
      airtable_pushed_at = CASE WHEN $3 THEN COALESCE(airtable_pushed_at, NOW()) ELSE NULL END,
      airtable_error = $4,
      screenshot_uploaded = $5
     WHERE id = $1`,
    [id, recordId, Boolean(pushed), error || null, Boolean(screenshotUploaded)],
  );
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
