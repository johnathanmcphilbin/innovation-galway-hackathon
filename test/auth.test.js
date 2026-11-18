import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import {
  HCA_SCOPES,
  authorizeUrl,
  createTxn,
  destinationAfterLogin,
  identityFromPayloads,
  isAdminEmail,
  readSession,
  redeemCode,
  setHcaFetchForTests,
  signPayload,
  signSession,
} from "../src/auth.js";
import { app } from "../src/server.js";

process.env.SESSION_SECRET = "test-session-secret";
process.env.HCA_CLIENT_ID = "client-test";
process.env.HCA_CLIENT_SECRET = "secret-test";
process.env.HCA_REDIRECT_URI = "https://galway.hackclub.com/auth/callback";

const address = {
  line_1: "1 High Street",
  line_2: "Flat 2",
  city: "Galway",
  state: "Galway",
  postal_code: "H91 ABC1",
  country: "IE",
  primary: true,
};

test("builds the Hack Club authorize URL with PKCE and the prefill scopes", () => {
  const txn = createTxn();
  const url = new URL(
    authorizeUrl({
      clientId: "client-test",
      redirectUri: "https://galway.hackclub.com/auth/callback",
      txn,
    }),
  );
  assert.equal(url.origin, "https://auth.hackclub.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), HCA_SCOPES);
  assert.match(url.searchParams.get("scope"), /birthdate/);
  assert.match(url.searchParams.get("scope"), /address/);
  assert.equal(url.searchParams.get("redirect_uri"), "https://galway.hackclub.com/auth/callback");
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.equal(url.toString().includes("secret-test"), false);
});

test("reads a name, birthday, and address from Hack Club identity payloads", () => {
  const identity = identityFromPayloads(
    {
      sub: "ident!ada",
      name: "Ada Lovelace",
      email: "Ada@Example.com",
      birthdate: "2009-01-02",
      address: { street_address: "Ignored Street\nIgnored Flat", locality: "Nowhere", postal_code: "00000", country: "US" },
    },
    {
      identity: {
        id: "ident!ada",
        first_name: "Ada",
        last_name: "Lovelace",
        primary_email: "Ada@Example.com",
        birthday: "2009-01-02",
        addresses: [address],
      },
    },
  );
  assert.equal(identity.sub, "ident!ada");
  assert.equal(identity.email, "ada@example.com");
  assert.equal(identity.givenName, "Ada");
  assert.equal(identity.familyName, "Lovelace");
  assert.equal(identity.birthdate, "2009-01-02");
  assert.equal(identity.address1, "1 High Street");
  assert.equal(identity.address2, "Flat 2");
  assert.equal(identity.city, "Galway");
  assert.equal(identity.zip, "H91 ABC1");
  assert.equal(identity.country, "IE");
});

test("falls back to the OIDC address when the API has no street", () => {
  const identity = identityFromPayloads(
    {
      sub: "ident!ada",
      given_name: "Ada",
      family_name: "Lovelace",
      email: "ada@example.com",
      address: {
        street_address: "1 High Street\nFlat 2",
        locality: "Galway",
        region: "Galway",
        postal_code: "H91 ABC1",
        country: "IE",
      },
    },
    { identity: { id: "ident!ada" } },
  );
  assert.equal(identity.address1, "1 High Street");
  assert.equal(identity.address2, "Flat 2");
  assert.equal(identity.city, "Galway");
});

test("johnny@hackclub.com is an admin, and ADMIN_EMAILS adds people", () => {
  assert.equal(isAdminEmail("Johnny@HackClub.com", {}), true);
  assert.equal(isAdminEmail("ada@example.com", { ADMIN_EMAILS: "ada@example.com" }), true);
  assert.equal(isAdminEmail("ada@example.com", {}), false);
  assert.equal(destinationAfterLogin({ email: "johnny@hackclub.com" }, "/submit"), "/admin");
  assert.equal(destinationAfterLogin({ email: "ada@example.com" }, "/admin"), "/submit");
  assert.equal(destinationAfterLogin({ email: "ada@example.com" }, "https://evil.test"), "/submit");
});

test("a session cookie round-trips and a bad signature does not", () => {
  const token = signSession(
    {
      sub: "ident!ada",
      email: "ada@example.com",
      givenName: "Ada",
      familyName: "Lovelace",
      birthdate: "2009-01-02",
      address1: "1 High Street",
      address2: "",
      city: "Galway",
      state: "",
      country: "IE",
      zip: "H91 ABC1",
    },
    "secret",
  );
  assert.equal(readSession(token, "secret").givenName, "Ada");
  assert.equal(readSession(token, "other"), null);
  assert.equal(readSession(signPayload({ sub: "ident!x" }, "secret", -10), "secret"), null);
});

test("a mismatched state never calls Hack Club", async () => {
  let called = false;
  await assert.rejects(
    () =>
      redeemCode({
        code: "abc",
        state: "one",
        expectedState: "two",
        verifier: "verifier",
        clientId: "client-test",
        clientSecret: "secret-test",
        redirectUri: "https://galway.hackclub.com/auth/callback",
        fetchImpl: async () => {
          called = true;
          return new Response("no", { status: 500 });
        },
      }),
    (error) => error.code === "HCA_STATE",
  );
  assert.equal(called, false);
});

test("sign-in lands teens on the form and admins on the review page", async () => {
  const calls = [];
  setHcaFetchForTests(async (url, options) => {
    calls.push(String(url));
    if (String(url).endsWith("/oauth/token")) {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("client_secret"), "secret-test");
      assert.ok(body.get("code_verifier"));
      return new Response(JSON.stringify({ access_token: "idntk.test", token_type: "Bearer" }), { status: 200 });
    }
    if (String(url).endsWith("/oauth/userinfo")) {
      assert.match(options.headers.authorization, /^Bearer idntk\.test$/);
      return new Response(
        JSON.stringify({
          sub: "ident!ada",
          given_name: "Ada",
          family_name: "Lovelace",
          email: "Ada@Example.com",
          birthdate: "2009-01-02",
        }),
        { status: 200 },
      );
    }
    if (String(url).endsWith("/api/v1/me")) {
      return new Response(
        JSON.stringify({
          identity: {
            id: "ident!ada",
            addresses: [address],
          },
        }),
        { status: 200 },
      );
    }
    return new Response("no", { status: 404 });
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/auth/login?next=/admin`, { redirect: "manual" });
    assert.equal(login.status, 302);
    const target = new URL(login.headers.get("location"));
    assert.equal(target.origin, "https://auth.hackclub.com");
    assert.equal(target.pathname, "/oauth/authorize");
    const txn = login.headers.getSetCookie().find((cookie) => cookie.startsWith("ig_hca="));
    assert.ok(txn);
    const callback = await fetch(
      `${base}/auth/callback?code=abc&state=${encodeURIComponent(target.searchParams.get("state"))}`,
      { headers: { cookie: txn.split(";")[0] }, redirect: "manual" },
    );
    assert.equal(callback.status, 303);
    assert.equal(new URL(callback.headers.get("location"), base).pathname, "/submit");
    const session = callback.headers.getSetCookie().find((cookie) => cookie.startsWith("ig_session="));
    const form = await fetch(`${base}/submit`, { headers: { cookie: session.split(";")[0] } });
    const html = await form.text();
    assert.match(html, /value="Ada"/);
    assert.match(html, /value="Lovelace"/);
    assert.match(html, /value="ada@example.com"/);
    assert.match(html, /value="2009-01-02"/);
    assert.match(html, /value="1 High Street"/);
    assert.match(html, /value="Flat 2"/);
    assert.match(html, /value="H91 ABC1"/);
    assert.match(html, /We filled these in from your Hack Club account/);
    assert.doesNotMatch(html, /github_username|hackatime_id/);

    const bad = await fetch(`${base}/auth/callback?code=abc&state=nope`, {
      headers: { cookie: txn.split(";")[0] },
      redirect: "manual",
    });
    assert.equal(new URL(bad.headers.get("location"), base).searchParams.get("auth"), "error");
    const retry = await fetch(`${base}/submit?auth=error`);
    assert.match(await retry.text(), /Hack Club sign-in didn(&#39;|')t finish/);

    setHcaFetchForTests(async (url) => {
      if (String(url).endsWith("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "idntk.admin" }), { status: 200 });
      }
      if (String(url).endsWith("/oauth/userinfo")) {
        return new Response(
          JSON.stringify({
            sub: "ident!johnny",
            given_name: "Johnny",
            family_name: "McPhilbin",
            email: "johnny@hackclub.com",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ identity: { id: "ident!johnny" } }), { status: 200 });
    });
    const adminLogin = await fetch(`${base}/auth/login?next=/submit`, { redirect: "manual" });
    const adminTarget = new URL(adminLogin.headers.get("location"));
    const adminTxn = adminLogin.headers.getSetCookie().find((cookie) => cookie.startsWith("ig_hca="));
    const adminBack = await fetch(
      `${base}/auth/callback?code=admin&state=${encodeURIComponent(adminTarget.searchParams.get("state"))}`,
      { headers: { cookie: adminTxn.split(";")[0] }, redirect: "manual" },
    );
    assert.equal(new URL(adminBack.headers.get("location"), base).pathname, "/admin");
    assert.ok(calls.length >= 2);
  } finally {
    setHcaFetchForTests(null);
    server.close();
    await once(server, "close");
  }
});
