# Threat model

Method: asset and actor review, then STRIDE per boundary. Scope is the lab on
one macOS host. Out of scope: physical theft of the unlocked machine, a
compromised Homebrew or Docker supply chain, and a malicious kernel extension.

## Assets

| Asset | Why it matters | Store |
|---|---|---|
| Case facts and narratives | Personal data about affected people | Postgres |
| Evidence files | May contain identifiers and incident detail | `data/evidence`, AES-GCM when key loaded |
| Contact details | Direct identifiers | Sealed columns with `RESEARCH_KEY` |
| Audit and security logs | Proof of what happened | Postgres hash chains |
| Session cookies and tokens | Impersonation | Memory and Postgres sessions |
| Keys and passphrases | Unlock everything above | macOS Keychain |

## Actors

External unauthenticated scanner, malicious organisation user, curious
regulator analyst, compromised laptop session, careless operator, and a
supply-chain attacker. The lab assumes the owner is trusted.

## STRIDE summary

| Threat | Path | Control | Residual |
|---|---|---|---|
| Spoofing | Stolen cookie | HttpOnly, SameSite, OTP step, trip revokes sessions | Unlocked browser session can act until revoked |
| Tampering | Edit audit rows | Hash chain and verifier | Database owner can rewrite the whole chain; external anchor is open |
| Repudiation | Deny a change | Audit actor, timestamp, resource and chain | Shared group login weakens attribution; it is demo only |
| Information disclosure | Direct file read | Encrypted evidence, encrypted vault, FileVault, file modes 600 | Unlocked user session can read keys |
| Denial of service | Request flood | Trip wire, IP limits, pf | Single host, no upstream scrubbing |
| Elevation of privilege | IDOR or role confusion | Role matrix, org and assignment scopes, mTLS intake | No external pentest |
| Malware | Upload | ClamAV, type allowlist, magic bytes, quarantine | Fail-open default; production must set `CLAMAV_REQUIRED=1` |
| Injection | Query and form input | Parameterised SQL, zod schemas, WAF, text rendering | WAF is signature based |
| Supply chain | Dependency compromise | OSV, Trivy, lockfile, SBOM script | No signed builds or provenance |

## Assumptions

The host is patched, FileVault is on, the owner does not approve unknown admin
prompts, and the vault is unmounted when not in use. The lab is not exposed to
the internet. If any assumption fails, the risk rating changes.
