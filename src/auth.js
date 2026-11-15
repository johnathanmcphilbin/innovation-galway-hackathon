import crypto from "node:crypto";

export function passwordMatches(given, expected = process.env.ADMIN_PASSWORD) {
  if (!expected) return false;
  const provided = Buffer.from(String(given ?? ""));
  const actual = Buffer.from(expected);
  if (provided.length !== actual.length) {
    crypto.timingSafeEqual(actual, actual);
    return false;
  }
  return crypto.timingSafeEqual(provided, actual);
}

export function adminCookieValue(password = process.env.ADMIN_PASSWORD) {
  if (!password) return null;
  return crypto
    .createHmac("sha256", password)
    .update("innovation-galway-admin-v1")
    .digest("base64url");
}

export function readCookie(header, name) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return "";
}

export function isAdminRequest(req) {
  const expected = adminCookieValue();
  if (!expected) return false;
  const got = readCookie(req.headers.cookie, "ig_admin");
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
