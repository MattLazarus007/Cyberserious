# DAST report: ZAP baseline

Date: 22 October 2026
Target: `https://host.docker.internal:8443` (Caddy TLS edge to the regulator on 127.0.0.1:8100)
Tool: OWASP ZAP stable container, baseline scan, 2 minute spider
Artifacts: `docs/security/dast.html`, `docs/security/dast.json`

## Result

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 1 |
| Low | 0 |
| Informational | 4 |

The target certificate was trusted inside the scan container by importing the
Caddy local root into the Java trust store. The scan ran unauthenticated, as an
external reviewer would start.

## Triage

| Alert | Count | Decision |
|---|---|---|
| CSP: Failure to Define Directive with No Fallback | 2 | Accepted for 404 pages only. The application pages send explicit `script-src`, `style-src`, `img-src`, `connect-src`, `object-src`, `frame-src` and `form-action` directives. A 404 response sends `default-src 'none'` without naming each directive, and ZAP rates that as a missing fallback. The page renders no data |
| Authentication Request Identified | 4 | Informational. The login form was found and the spider filled it with `ZAP`. No credential was guessed |
| Information Disclosure - Sensitive Information in URL | 5 | False positive on ZAP's own injected query parameters. The app does not put secrets in URLs; session cookies are HttpOnly and SameSite |
| Re-examine Cache-control Directives | 5 | Accepted. Static HTML and CSS are cacheable by design and contain no personal data. API responses send `no-store` |
| User Controllable HTML Element Attribute (Potential XSS) | 4 | False positive from ZAP's reflected test parameters. The UI writes with `textContent`; CSP blocks inline script; the hostile-string test stores markup inertly |

The scan was re-run on 22 October 2026 at 14:54 after the CSP work. The
artifact in this directory is that run. The earlier draft of this page listed
zero medium and six low items, which did not match the artifact. The table
above is the corrected reading.

## What this does not prove

The scan was unauthenticated and shallow. Authenticated IDOR, workflow abuse
and business logic need the manual checklist in `docs/security/PENTEST.md`.
ZAP passing does not replace an external penetration test.
