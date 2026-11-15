import pg from "pg";

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
    console.warn("DATABASE_URL is not set. Pages will load; sign-up stays disabled until it is.");
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

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
