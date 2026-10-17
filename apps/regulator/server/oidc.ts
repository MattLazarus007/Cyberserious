// OpenID Connect sign-in for the regulator app. The provider only says
// who the person is. Every role still comes from the local users and
// memberships rows, so the RBAC story never leaves this machine.
//
// Three environment values switch it on: OIDC_ISSUER, OIDC_CLIENT_ID
// and, when the app is not on localhost:8100, OIDC_REDIRECT_URI. With
// none of them set the two routes below answer 404 and the login page
// keeps its password form alone.
import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import type { Request, Response } from "express";
import { query } from "./db.ts";
import { recordAudit } from "./audit.ts";
import { createSession, readCookie, sessionCookieHeader } from "./session.ts";

export const STATE_COOKIE = "oidc_state";
const STATE_TTL_SECONDS = 10 * 60;
const SKEW_SECONDS = 60;
const DEFAULT_REDIRECT_URI = "http://localhost:8100/auth/oidc/callback";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface Jwk {
  kty?: string;
  kid?: string;
  [field: string]: unknown;
}

interface Claims {
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  sub: string;
  nonce?: unknown;
  preferred_username?: unknown;
}

// One discovery document and one key set per process. Both refresh on
// a miss, so a restarted provider is picked up without a reboot here.
const discoveryCache = new Map<string, Discovery>();
const jwksCache = new Map<string, Jwk[]>();

export function oidcEnabled(): boolean {
  return Boolean(process.env.OIDC_ISSUER);
}

function issuerBase(): string {
  return (process.env.OIDC_ISSUER ?? "").replace(/\/+$/, "");
}

function clientId(): string {
  return process.env.OIDC_CLIENT_ID ?? "";
}

function redirectUri(): string {
  return process.env.OIDC_REDIRECT_URI ?? DEFAULT_REDIRECT_URI;
}

async function discover(): Promise<Discovery> {
  const base = issuerBase();
  if (!base) throw new Error("no identity provider configured");
  const cached = discoveryCache.get(base);
  if (cached) return cached;
  const res = await fetch(`${base}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`discovery answered ${res.status}`);
  const doc = await res.json() as Partial<Discovery>;
  if (
    typeof doc.authorization_endpoint !== "string" ||
    typeof doc.token_endpoint !== "string" ||
    typeof doc.jwks_uri !== "string"
  ) {
    throw new Error("discovery document is missing an endpoint");
  }
  const found: Discovery = {
    issuer: typeof doc.issuer === "string" ? doc.issuer : base,
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    jwks_uri: doc.jwks_uri,
  };
  discoveryCache.set(base, found);
  return found;
}

async function fetchJwks(uri: string): Promise<Jwk[]> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`key set answered ${res.status}`);
  const body = await res.json() as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error("key set carries no list");
  return body.keys as Jwk[];
}

async function jwksFor(uri: string): Promise<Jwk[]> {
  const cached = jwksCache.get(uri);
  if (cached) return cached;
  const keys = await fetchJwks(uri);
  jwksCache.set(uri, keys);
  return keys;
}

async function keyFor(uri: string, kid: string): Promise<Jwk | null> {
  const pick = (keys: Jwk[]): Jwk | null => keys.find((entry) => entry.kty === "RSA" && entry.kid === kid) ?? null;
  const hit = pick(await jwksFor(uri));
  if (hit) return hit;
  // A rotated provider serves a key this process has never seen. One
  // refresh covers that case, then the request fails like any bad token.
  jwksCache.delete(uri);
  return pick(await jwksFor(uri));
}

async function verifyIdToken(token: string, doc: Discovery, expectedNonce: string): Promise<Claims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: unknown; kid?: unknown };
  let claims: Claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Claims;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const jwk = await keyFor(doc.jwks_uri, header.kid);
  if (!jwk) return null;
  let key;
  try {
    key = createPublicKey({ key: jwk as never, format: "jwk" });
  } catch {
    return null;
  }
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifySignature("RSA-SHA256", signed, key, signature)) return null;
  if (claims.iss !== doc.issuer) return null;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(clientId())) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) return null;
  if (typeof claims.iat !== "number" || claims.iat > now + SKEW_SECONDS) return null;
  if (claims.nonce !== expectedNonce) return null;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
  return claims;
}

async function exchange(tokenEndpoint: string, code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: clientId(),
    code_verifier: verifier,
  });
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`token exchange answered ${res.status}`);
  const payload = await res.json() as { id_token?: unknown };
  if (typeof payload.id_token !== "string") throw new Error("token response carries no id_token");
  return payload.id_token;
}

// The local table decides who exists and what they may do. An arriving
// name nobody knows gets one analyst row, a name the seed already has
// keeps every membership it came with.
async function findOrMake(name: string): Promise<string> {
  const made = await query(
    `insert into users (username, display_name, password_hash)
     values ($1, $1, 'oidc-sign-in')
     on conflict (username) do nothing
     returning id`,
    [name]
  );
  if (made.rows.length > 0) {
    const userId = made.rows[0].id as string;
    await query(
      `insert into memberships (user_id, org_id, role)
       values ($1, null, 'regulator_analyst')
       on conflict (user_id, org_id, role) do nothing`,
      [userId]
    );
    return userId;
  }
  const found = await query("select id from users where username = $1", [name]);
  if (found.rows.length === 0) throw new Error("user row disappeared mid sign-in");
  return found.rows[0].id as string;
}

function stateCookieHeader(blob: string): string {
  return `${STATE_COOKIE}=${blob}; Path=/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`;
}

function clearStateCookieHeader(): string {
  return `${STATE_COOKIE}=; Path=/auth/oidc; HttpOnly; SameSite=Lax; Max-Age=0`;
}

interface SavedState {
  state: string;
  nonce: string;
  verifier: string;
}

function readState(req: Request): SavedState | null {
  const raw = readCookie(req, STATE_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<SavedState>;
    if (typeof parsed.state !== "string" || typeof parsed.nonce !== "string" || typeof parsed.verifier !== "string") {
      return null;
    }
    return { state: parsed.state, nonce: parsed.nonce, verifier: parsed.verifier };
  } catch {
    return null;
  }
}

function sameValue(given: string, saved: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(saved, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Every refusal answers the same way, so a probe learns nothing about
// which step said no.
async function refuse(res: Response, actor: string): Promise<void> {
  await recordAudit({ actor, action: "auth.oidc", resource: actor, result: "denied" });
  res.append("Set-Cookie", clearStateCookieHeader());
  res.status(400).json({ error: "invalid sign-in" });
}

function missingProvider(res: Response): void {
  res.status(404).json({ error: "not found" });
}

export async function startOidc(req: Request, res: Response): Promise<void> {
  if (!oidcEnabled()) {
    missingProvider(res);
    return;
  }
  try {
    const doc = await discover();
    const state = randomBytes(32).toString("hex");
    const nonce = randomBytes(32).toString("hex");
    const verifier = randomBytes(64).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const blob = Buffer.from(JSON.stringify({ state, nonce, verifier }), "utf8").toString("base64url");
    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId());
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("scope", "openid profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    res.setHeader("Set-Cookie", stateCookieHeader(blob));
    res.redirect(302, url.toString());
  } catch (err) {
    console.error("[oidc] authorize step failed", err);
    await refuse(res, "oidc");
  }
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  if (!oidcEnabled()) {
    missingProvider(res);
    return;
  }
  const saved = readState(req);
  const given = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!saved || !code || !given || !sameValue(given, saved.state)) {
    await refuse(res, "oidc");
    return;
  }
  try {
    const doc = await discover();
    const idToken = await exchange(doc.token_endpoint, code, saved.verifier);
    const claims = await verifyIdToken(idToken, doc, saved.nonce);
    const name = claims && typeof claims.preferred_username === "string" ? claims.preferred_username : "";
    if (!claims || !name) {
      await refuse(res, "oidc");
      return;
    }
    const userId = await findOrMake(name);
    const sid = await createSession(userId);
    // The provider already carried the second factor, so the session
    // opens satisfied, the same way the group gate opens satisfied.
    await query("update sessions set mfa_ok = true where id = $1", [sid]);
    await recordAudit({ actor: name, action: "auth.oidc", resource: name, result: "ok" });
    console.log(`[oidc] ${name} signed in through ${issuerBase()}`);
    res.append("Set-Cookie", sessionCookieHeader(sid));
    res.append("Set-Cookie", clearStateCookieHeader());
    res.redirect(302, "/index.html");
  } catch (err) {
    console.error("[oidc] callback failed", err);
    await refuse(res, "oidc");
  }
}
