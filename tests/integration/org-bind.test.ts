import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { startOrganisation } from "../../apps/organisation/server/index.ts";

test("the organisation app listens on loopback by default", async () => {
  const server = startOrganisation(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  assert.equal(address.address, "127.0.0.1");
  server.close();
});
