import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookieHeader, clearCookieHeader } from "../../apps/regulator/server/session.ts";

test("the session cookie carries Secure when the request arrives over TLS", () => {
  const secure = sessionCookieHeader("abc123", true);
  assert.match(secure, /; Secure/);
  assert.match(secure, /HttpOnly/);
  assert.match(secure, /SameSite=Lax/);
});

test("the session cookie stays usable on loopback plain http", () => {
  const plain = sessionCookieHeader("abc123", false);
  assert.doesNotMatch(plain, /Secure/);
  assert.match(plain, /HttpOnly/);
});

test("the clearing cookie carries the same scope as the cookie it removes", () => {
  assert.match(clearCookieHeader(true), /; Secure/);
  assert.doesNotMatch(clearCookieHeader(false), /Secure/);
});
