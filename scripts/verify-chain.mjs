#!/usr/bin/env node
// Read-only chain verifier. Uses the database in DATABASE_URL.
import { verifyChain } from "../apps/regulator/server/audit.ts";
import { verifySecurityChain } from "../apps/regulator/server/securitylog.ts";
import { closePool } from "../apps/regulator/server/db.ts";

const audit = await verifyChain();
const security = await verifySecurityChain();
console.log(JSON.stringify({ audit, security }));
await closePool();
if (!audit.ok || !security.ok) process.exit(1);
