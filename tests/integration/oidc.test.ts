import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign as signWithKey, type KeyObject } from "node:crypto";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import pg from "pg";
import { resetDb, startApp, dbUrl, type TestApp } from "./help.ts";

// The provider in this file is a stub: a plain node http server on an
// ephemeral port. It serves discovery, a jwks with a decoy key first so
// the lookup has to match on kid, and a token endpoint that signs an
// id_token with a test RSA keypair.

const CLIENT_ID = "test-client";
const KID = "test-key-1";
const REAL_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 });
const DECOY_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwkOf(key: KeyObject, kid: string): Record<string, unknown> {
  return { ...(key.export({ format: "jwk" }) as Record<string, unknown>), kid, alg: "RS256", use: "sig" };
}

const REAL_JWK = jwkOf(REAL_KEY.publicKey, KID);
const DECOY_JWK = jwkOf(DECOY_KEY.publicKey, "decoy-key");

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

interface Stub {
  base: string;
  issuer: string;
  claims: Record<string, unknown>;
  tampered: boolean;
  lastToken: Record<string, string> | null;
  tokenHits: number;
  close: () => Promise<void>;
}

function issueToken(stub: Stub): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: stub.issuer,
    aud: CLIENT_ID,
    exp: now + 300,
    iat: now,
    sub: "stub-sub-1",
    preferred_username: "analyst1",
    ...stub.claims,
  };
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const signing = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = signWithKey("RSA-SHA256", Buffer.from(signing, "utf8"), REAL_KEY.privateKey);
  if (stub.tampered) signature[0] ^= 0xff;
  return `${signing}.${signature.toString("base64url")}`;
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function serve(stub: Stub, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", stub.base);
  if (url.pathname === "/.well-known/openid-configuration") {
    json(res, {
      issuer: stub.issuer,
      authorization_endpoint: `${stub.base}/authorize`,
      token_endpoint: `${stub.base}/token`,
      jwks_uri: `${stub.base}/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      id_token_signing_alg_values_supported: ["RS256"],
    });
    return;
  }
  if (url.pathname === "/jwks") {
    json(res, { keys: [DECOY_JWK, REAL_JWK] });
    return;
  }
  if (url.pathname === "/token" && req.method === "POST") {
    stub.tokenHits += 1;
    stub.lastToken = Object.fromEntries(new URLSearchParams(await readBody(req)));
    json(res, { access_token: "stub-access-token", token_type: "Bearer", expires_in: 300, id_token: issueToken(stub) });
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

async function startStub(): Promise<Stub> {
  const stub: Stub = {
    base: "",
    issuer: "",
    claims: {},
    tampered: false,
    lastToken: null,
    tokenHits: 0,
    close: async () => {},
  };
  const server = http.createServer((req, res) => {
    serve(stub, req, res).catch((err: unknown) => {
      console.error("stub provider failed", err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "stub failure" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  stub.base = `http://localhost:${port}`;
  stub.issuer = stub.base;
  stub.close = () => new Promise((resolve, reject) => server.close((err: unknown) => (err ? reject(err) : resolve())));
  return stub;
}

function oidcEnvOn(stub: Stub): void {
  process.env.OIDC_ISSUER = stub.base;
  process.env.OIDC_CLIENT_ID = CLIENT_ID;
}

function oidcEnvOff(): void {
  delete process.env.OIDC_ISSUER;
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_REDIRECT_URI;
}

async function authorize(base: string): Promise<{ location: URL; cookie: string; header: string }> {
  const res = await fetch(`${base}/auth/oidc`, { redirect: "manual" });
  assert.equal(res.status, 302);
  const location = new URL(res.headers.get("location") ?? "", base);
  const header = res.headers.get("set-cookie") ?? "";
  const cookie = header.split(";")[0];
  assert.match(cookie, /^oidc_state=/);
  return { location, cookie, header };
}

function stateOf(cookie: string): { state: string; nonce: string; verifier: string } {
  const value = cookie.slice(cookie.indexOf("=") + 1);
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { state: string; nonce: string; verifier: string };
}

function sessionCookie(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  const found = raw.match(/(?:^|, )cs_sid=([^;,]*)/);
  assert.ok(found, "the callback should open a session cookie");
  return `cs_sid=${found[1]}`;
}

function noSessionCookie(res: Response): void {
  const raw = res.headers.get("set-cookie") ?? "";
  assert.ok(!raw.includes("cs_sid="), `no session may open, saw ${raw}`);
}

async function callback(base: string, code: string, state: string, cookie: string): Promise<Response> {
  const url = `${base}/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  return fetch(url, { headers: { cookie }, redirect: "manual" });
}

test("authorize sends the browser to the provider with state, pkce and nonce", async () => {
  resetDb();
  const stub = await startStub();
  oidcEnvOn(stub);
  const srv = await startApp();
  process.env.OIDC_REDIRECT_URI = `${srv.base}/auth/oidc/callback`;
  try {
    const { location, cookie, header } = await authorize(srv.base);
    assert.equal(`${location.origin}${location.pathname}`, `${stub.base}/authorize`);
    assert.equal(location.searchParams.get("response_type"), "code");
    assert.equal(location.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(location.searchParams.get("redirect_uri"), `${srv.base}/auth/oidc/callback`);
    assert.match(location.searchParams.get("scope") ?? "", /openid/);
    const state = location.searchParams.get("state");
    assert.ok(state && state.length === 64, "state is 32 bytes of hex");
    assert.ok(location.searchParams.get("nonce"), "nonce rides along");
    assert.equal(location.searchParams.get("code_challenge_method"), "S256");
    const challenge = location.searchParams.get("code_challenge");
    assert.ok(challenge && challenge.length === 43, "challenge is a base64url sha256");
    const bound = stateOf(cookie);
    assert.equal(bound.state, state, "cookie carries the same state");
    const expected = createHash("sha256").update(bound.verifier).digest("base64url");
    assert.equal(challenge, expected, "challenge is the s256 of the stored verifier");
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);
    assert.match(header, /Max-Age=600/, "the state cookie lives ten minutes");
  } finally {
    oidcEnvOff();
    await srv.close();
    await stub.close();
  }
});

test("a callback with the wrong state is refused and opens nothing", async () => {
  resetDb();
  const stub = await startStub();
  oidcEnvOn(stub);
  const srv = await startApp();
  process.env.OIDC_REDIRECT_URI = `${srv.base}/auth/oidc/callback`;
  try {
    const { cookie } = await authorize(srv.base);
    const res = await callback(srv.base, "abc123", "f".repeat(64), cookie);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid sign-in" });
    noSessionCookie(res);
    assert.equal(stub.tokenHits, 0, "the token endpoint is never called");
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 401);
  } finally {
    oidcEnvOff();
    await srv.close();
    await stub.close();
  }
});

test("a matching callback exchanges the code and opens a local session", async () => {
  resetDb();
  const stub = await startStub();
  oidcEnvOn(stub);
  const srv = await startApp();
  process.env.OIDC_REDIRECT_URI = `${srv.base}/auth/oidc/callback`;
  const conn = new pg.Client({ connectionString: dbUrl });
  try {
    await conn.connect();
    const { location, cookie } = await authorize(srv.base);
    stub.claims = { preferred_username: "analyst1", nonce: location.searchParams.get("nonce") };
    const state = stateOf(cookie).state;
    const res = await callback(srv.base, "abc123", state, cookie);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/index.html");
    assert.ok(stub.lastToken, "the token endpoint was called");
    assert.equal(stub.lastToken.code, "abc123");
    assert.equal(stub.lastToken.grant_type, "authorization_code");
    assert.equal(stub.lastToken.client_id, CLIENT_ID);
    assert.equal(stub.lastToken.redirect_uri, `${srv.base}/auth/oidc/callback`);
    const verifier = stub.lastToken.code_verifier;
    assert.ok(verifier, "the pkce verifier travels with the exchange");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(challenge, location.searchParams.get("code_challenge"), "verifier matches the challenge sent");
    const sid = sessionCookie(res);
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie: sid } });
    assert.equal(me.status, 200);
    const body = await me.json() as { username: string; role: string; mfaOk: boolean };
    assert.equal(body.username, "analyst1");
    assert.equal(body.role, "regulator_analyst");
    assert.equal(body.mfaOk, true, "the provider sign-in counts as the full factor");
    const audit = await conn.query(
      "select count(*)::int as n from audit_events where action = 'auth.oidc' and result = 'ok'"
    );
    assert.equal(audit.rows[0].n, 1, "the sign-in writes one audit row");
  } finally {
    await conn.end().catch(() => {});
    oidcEnvOff();
    await srv.close();
    await stub.close();
  }
});

test("an unknown name gets one local role and an existing name keeps its rows", async () => {
  resetDb();
  const stub = await startStub();
  oidcEnvOn(stub);
  const srv = await startApp();
  process.env.OIDC_REDIRECT_URI = `${srv.base}/auth/oidc/callback`;
  const conn = new pg.Client({ connectionString: dbUrl });
  try {
    await conn.connect();
    await conn.query(
      `insert into memberships (user_id, org_id, role)
       select id, null, 'regulator_supervisor' from users where username = 'analyst1'
       on conflict (user_id, org_id, role) do nothing`
    );
    const first = await authorize(srv.base);
    stub.claims = { preferred_username: "newbie1", nonce: first.location.searchParams.get("nonce") };
    const made = await callback(srv.base, "code-new", stateOf(first.cookie).state, first.cookie);
    assert.equal(made.status, 302);
    const created = await conn.query(
      `select u.id, m.role, m.org_id from users u
        left join memberships m on m.user_id = u.id
       where u.username = 'newbie1'`
    );
    assert.equal(created.rows.length, 1, "the row is created once");
    assert.equal(created.rows[0].role, "regulator_analyst");
    assert.equal(created.rows[0].org_id, null, "a stranger lands with no organisation");
    const known = await authorize(srv.base);
    stub.claims = { preferred_username: "analyst1", nonce: known.location.searchParams.get("nonce") };
    const kept = await callback(srv.base, "code-known", stateOf(known.cookie).state, known.cookie);
    assert.equal(kept.status, 302);
    const existing = await conn.query(
      `select m.role from memberships m join users u on u.id = m.user_id
        where u.username = 'analyst1' order by m.role`
    );
    assert.deepEqual(
      existing.rows.map((row: { role: string }) => row.role),
      ["regulator_analyst", "regulator_supervisor"],
      "the local memberships the seed gave stay untouched"
    );
    const before = await conn.query("select count(*)::int as n from users where username = 'analyst1'");
    assert.equal(before.rows[0].n, 1, "an existing name never gets a second row");
  } finally {
    await conn.end().catch(() => {});
    oidcEnvOff();
    await srv.close();
    await stub.close();
  }
});

test("a tampered token or a foreign issuer is refused and logged", async () => {
  resetDb();
  const stub = await startStub();
  oidcEnvOn(stub);
  const srv = await startApp();
  process.env.OIDC_REDIRECT_URI = `${srv.base}/auth/oidc/callback`;
  const conn = new pg.Client({ connectionString: dbUrl });
  try {
    await conn.connect();
    stub.tampered = true;
    const first = await authorize(srv.base);
    stub.claims = { preferred_username: "analyst1", nonce: first.location.searchParams.get("nonce") };
    const bad = await callback(srv.base, "code-flipped", stateOf(first.cookie).state, first.cookie);
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { error: "invalid sign-in" });
    noSessionCookie(bad);
    stub.tampered = false;
    const second = await authorize(srv.base);
    stub.claims = {
      preferred_username: "analyst1",
      nonce: second.location.searchParams.get("nonce"),
      iss: "https://someone-else.example",
    };
    const foreign = await callback(srv.base, "code-foreign", stateOf(second.cookie).state, second.cookie);
    assert.equal(foreign.status, 400);
    assert.deepEqual(await foreign.json(), { error: "invalid sign-in" });
    noSessionCookie(foreign);
    const denied = await conn.query(
      "select count(*)::int as n from audit_events where action = 'auth.oidc' and result = 'denied'"
    );
    assert.equal(denied.rows[0].n, 2, "each refusal writes a denied audit row");
    const users = await conn.query("select count(*)::int as n from users where username = 'analyst1'");
    assert.equal(users.rows[0].n, 1, "no second user appears from a bad token");
  } finally {
    await conn.end().catch(() => {});
    oidcEnvOff();
    await srv.close();
    await stub.close();
  }
});

test("auth-mode carries the provider switch and hides the route when it is off", async () => {
  resetDb();
  const stub = await startStub();
  const srv = await startApp();
  try {
    oidcEnvOff();
    const off = await (await fetch(`${srv.base}/api/v1/auth-mode`)).json() as { oidcEnabled: boolean };
    assert.equal(off.oidcEnabled, false);
    const hidden = await fetch(`${srv.base}/auth/oidc`, { redirect: "manual" });
    assert.equal(hidden.status, 404);
    assert.deepEqual(await hidden.json(), { error: "not found" });
    oidcEnvOn(stub);
    const on = await (await fetch(`${srv.base}/api/v1/auth-mode`)).json() as { oidcEnabled: boolean };
    assert.equal(on.oidcEnabled, true);
  } finally {
    oidcEnvOff();
    await srv.close();
    await stub.close();
  }
});
