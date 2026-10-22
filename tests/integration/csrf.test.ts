import test from "node:test";
import assert from "node:assert/strict";
import { resetDb, startApp } from "./help.ts";

const login = JSON.stringify({ username: "analyst1", password: "demo-analyst-pass" });

test("a cross-site browser mutation is refused before auth", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: login,
    });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /cross-site/);
  } finally {
    await srv.close();
  }
});

test("a mismatched origin is refused", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: login,
    });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /origin/);
  } finally {
    await srv.close();
  }
});

test("a same-origin mutation reaches the route", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: srv.base,
        "sec-fetch-site": "same-origin",
      },
      body: login,
    });
    assert.notEqual(res.status, 403, "the guard let it through");
  } finally {
    await srv.close();
  }
});

test("a non-browser request without fetch metadata still reaches the route", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: login,
    });
    assert.notEqual(res.status, 403);
  } finally {
    await srv.close();
  }
});

test("the new response headers are present", async () => {
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/health/live`);
    assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(res.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(res.headers.get("x-permitted-cross-domain-policies"), "none");
  } finally {
    await srv.close();
  }
});
