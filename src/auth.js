import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HCA_AUTHORIZE = "https://auth.hackclub.com/oauth/authorize";
export const HCA_TOKEN = "https://auth.hackclub.com/oauth/token";
export const HCA_USERINFO = "https://auth.hackclub.com/oauth/userinfo";
export const HCA_ME = "https://auth.hackclub.com/api/v1/me";

/**
 * Name and email come from profile + email on every app.
 * birthdate and address are HQ scopes. They are what let us prefill the form.
 * An optional HCA_SCOPES override exists so a community app can drop them
 * without a code change if Hack Club Auth rejects the request.
 */
export const HCA_SCOPES = "openid profile email name birthdate address";

export const SESSION_COOKIE = "ig_session";
export const TXN_COOKIE = "ig_hca";
export const DEFAULT_ADMIN_EMAIL = "johnny@hackclub.com";

const SESSION_TTL = 60 * 60 * 24 * 30;
const TXN_TTL = 10 * 60;

let fetchOverride = null;

/** Test seam. Production leaves this unset and uses global fetch. */
export function setHcaFetchForTests(fetchImpl) {
  fetchOverride = fetchImpl || null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function same(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function mac(body, secret) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signPayload(payload, secret, ttlSeconds) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

export function readPayload(token, secret) {
  if (!token || !secret) return null;
  const split = String(token).lastIndexOf(".");
  if (split <= 0) return null;
  const body = String(token).slice(0, split);
  const signature = String(token).slice(split + 1);
  if (!same(signature, mac(body, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload || typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionSecret(env = process.env) {
  const dedicated = text(env.SESSION_SECRET);
  if (dedicated) return dedicated;
  return text(env.HCA_CLIENT_SECRET);
}

export function hcaConfig(env = process.env) {
  const clientId = text(env.HCA_CLIENT_ID);
  const clientSecret = text(env.HCA_CLIENT_SECRET);
  const redirectUri = text(env.HCA_REDIRECT_URI);
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

export function authReady(env = process.env) {
  return Boolean(hcaConfig(env) && sessionSecret(env));
}

export function requestedScopes(env = process.env) {
  return text(env.HCA_SCOPES) || HCA_SCOPES;
}

export function adminEmailSet(env = process.env) {
  const raw = env.ADMIN_EMAILS;
  const extras = typeof raw === "string" ? raw.split(",") : [];
  return new Set(
    [DEFAULT_ADMIN_EMAIL, ...extras].map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
}

export function isAdminEmail(email, env = process.env) {
  const value = text(email).toLowerCase();
  return Boolean(value) && adminEmailSet(env).has(value);
}

export function safeNext(value) {
  if (value === "/submit" || value === "/admin" || value === "/") return value;
  return "/submit";
}

export function destinationAfterLogin(identity, requested) {
  if (isAdminEmail(identity?.email)) return "/admin";
  const next = safeNext(requested);
  return next === "/" || next === "/admin" ? "/submit" : next;
}

export function displayName(identity) {
  const name = [text(identity?.givenName), text(identity?.familyName)].filter(Boolean).join(" ");
  return name || text(identity?.email) || "there";
}

function bytes(size) {
  return randomBytes(size).toString("base64url");
}

export function createTxn() {
  const verifier = bytes(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state: bytes(24), nonce: bytes(24), verifier, challenge };
}

export function signTxn(txn, secret) {
  return signPayload(
    {
      state: txn.state,
      nonce: txn.nonce,
      verifier: txn.verifier,
      next: safeNext(txn.next),
    },
    secret,
    TXN_TTL,
  );
}

export function readTxn(token, secret) {
  const payload = readPayload(token, secret);
  if (!payload || typeof payload.state !== "string" || typeof payload.verifier !== "string") return null;
  return {
    state: payload.state,
    nonce: typeof payload.nonce === "string" ? payload.nonce : "",
    verifier: payload.verifier,
    next: safeNext(payload.next),
  };
}

export function signSession(identity, secret) {
  return signPayload(
    {
      sub: identity.sub,
      email: identity.email,
      givenName: identity.givenName,
      familyName: identity.familyName,
      birthdate: identity.birthdate,
      address1: identity.address1,
      address2: identity.address2,
      city: identity.city,
      state: identity.state,
      country: identity.country,
      zip: identity.zip,
    },
    secret,
    SESSION_TTL,
  );
}

export function readSession(token, secret) {
  const payload = readPayload(token, secret);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  return blankIdentity(payload);
}

export function readCookie(header, name) {
  if (!header) return "";
  for (const part of String(header).split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}

/**
 * Hack Club Auth sends someone who is not signed in from /oauth/authorize to
 * /oauth/welcome. A new email continues into /signup and then back here.
 * That is the sign-up flow, so the button does not need a separate signup URL.
 */
export function authorizeUrl({ clientId, redirectUri, txn, scopes = requestedScopes() }) {
  const url = new URL(HCA_AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", txn.state);
  url.searchParams.set("nonce", txn.nonce);
  url.searchParams.set("code_challenge", txn.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function splitStreet(street) {
  const lines = text(street)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return { line1: lines[0] || "", line2: lines.slice(1).join(", ") };
}

function addressFromOidc(address) {
  if (!address) return null;
  if (typeof address === "string") {
    const street = splitStreet(address);
    if (!street.line1) return null;
    return { ...street, city: "", state: "", country: "", zip: "" };
  }
  if (typeof address !== "object") return null;
  const street = splitStreet(address.street_address);
  const line1 = street.line1 || text(address.line1) || text(address.line_1);
  const city = text(address.locality) || text(address.city);
  const zip = text(address.postal_code) || text(address.postalCode) || text(address.zip);
  if (!line1 && !city && !zip) return null;
  return {
    line1,
    line2: street.line2 || text(address.line2) || text(address.line_2),
    city,
    state: text(address.region) || text(address.state),
    zip,
    country: text(address.country),
  };
}

function addressFromApi(identity) {
  const list = Array.isArray(identity?.addresses) ? identity.addresses : [];
  const addr = list.find((item) => item && item.primary) || list[0];
  if (!addr || typeof addr !== "object") return null;
  const line1 = text(addr.line_1) || text(addr.line1);
  const city = text(addr.city);
  if (!line1 && !city) return null;
  return {
    line1,
    line2: text(addr.line_2) || text(addr.line2),
    city,
    state: text(addr.state),
    zip: text(addr.postal_code) || text(addr.zip),
    country: text(addr.country),
  };
}

function splitName(name) {
  const value = text(name);
  if (!value) return { givenName: "", familyName: "" };
  const space = value.indexOf(" ");
  if (space === -1) return { givenName: value, familyName: "" };
  return { givenName: value.slice(0, space), familyName: value.slice(space + 1).trim() };
}

function birthdate(value) {
  const raw = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function blankIdentity(source) {
  return {
    sub: text(source.sub).slice(0, 200),
    email: text(source.email).toLowerCase().slice(0, 254),
    givenName: text(source.givenName).slice(0, 80),
    familyName: text(source.familyName).slice(0, 80),
    birthdate: birthdate(source.birthdate),
    address1: text(source.address1).slice(0, 120),
    address2: text(source.address2).slice(0, 120),
    city: text(source.city).slice(0, 120),
    state: text(source.state).slice(0, 120),
    country: text(source.country).slice(0, 120),
    zip: text(source.zip).slice(0, 120),
  };
}

export function identityFromPayloads(userinfo, me) {
  const info = userinfo && typeof userinfo === "object" ? userinfo : {};
  const identity = me && typeof me === "object" && me.identity && typeof me.identity === "object" ? me.identity : {};
  const names = splitName(info.name || identity.name);
  const givenName = text(info.given_name) || text(identity.first_name) || names.givenName;
  const familyName = text(info.family_name) || text(identity.last_name) || names.familyName;
  const apiAddress = addressFromApi(identity);
  const oidcAddress = addressFromOidc(info.address);
  const address = apiAddress?.line1 ? apiAddress : oidcAddress || apiAddress || {};
  return blankIdentity({
    sub: text(info.sub) || text(identity.id),
    email: text(info.email) || text(identity.primary_email),
    givenName,
    familyName,
    birthdate: text(info.birthdate) || text(identity.birthday),
    address1: address.line1,
    address2: address.line2,
    city: address.city,
    state: address.state,
    country: address.country,
    zip: address.zip,
  });
}

function hcaError(code) {
  const error = new Error("Hack Club Auth could not finish sign-in.");
  error.code = code;
  return error;
}

async function readJson(response) {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw hcaError("HCA_RESPONSE");
  }
}

async function getBearer(fetchImpl, url, access) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${access}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw hcaError("HCA_NETWORK");
  }
  if (!response.ok) throw hcaError("HCA_USERINFO");
  return readJson(response);
}

export async function redeemCode({
  code,
  state,
  expectedState,
  verifier,
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl,
}) {
  if (!same(state, expectedState)) throw hcaError("HCA_STATE");
  const request = fetchImpl || fetchOverride || fetch;
  let tokenResponse;
  try {
    tokenResponse = await request(HCA_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    if (cause?.code?.startsWith?.("HCA_")) throw cause;
    throw hcaError("HCA_NETWORK");
  }
  if (!tokenResponse.ok) throw hcaError("HCA_TOKEN");
  const token = await readJson(tokenResponse);
  const access = token.access_token;
  if (typeof access !== "string" || !access) throw hcaError("HCA_TOKEN");

  const userinfo = await getBearer(request, HCA_USERINFO, access);
  let me = null;
  try {
    me = await getBearer(request, HCA_ME, access);
  } catch {
    me = null;
  }
  const identity = identityFromPayloads(userinfo, me);
  if (!identity.sub) throw hcaError("HCA_IDENTITY");
  return identity;
}
