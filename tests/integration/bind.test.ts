import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { startRegulator } from "../../apps/regulator/server/index.ts";
import { hostFromEnv, hardenServer } from "../../apps/regulator/server/http.ts";

test("the regulator listens on loopback by default", async () => {
  const server = startRegulator(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  assert.equal(address.address, "127.0.0.1");
  assert.ok(address.port > 0);
  server.close();
});

test("HOST overrides the bind address when set on purpose", () => {
  const before = process.env.HOST;
  process.env.HOST = "0.0.0.0";
  assert.equal(hostFromEnv(), "0.0.0.0");
  delete process.env.HOST;
  assert.equal(hostFromEnv(), "127.0.0.1");
  if (before === undefined) delete process.env.HOST;
  else process.env.HOST = before;
});

test("the hardened server carries finite header and request timeouts", () => {
  const fake = {
    requestTimeout: 0,
    headersTimeout: 0,
    keepAliveTimeout: 0,
    maxHeadersCount: 2000,
  };
  hardenServer(fake as unknown as import("node:http").Server);
  assert.equal(fake.requestTimeout, 30_000);
  assert.equal(fake.headersTimeout, 20_000);
  assert.equal(fake.keepAliveTimeout, 5_000);
  assert.equal(fake.maxHeadersCount, 100);
});
