# ADR-0003: Lab sign-in now, proper identity later

Date: 2026-10-16. Owner: Group 1. Needs Andile's sign-off.

For the academic build, sign-in is a local username and password
followed by a one-time code printed to the server console. The marker
reads the code from the terminal, same as the earlier Python demo.
Sessions live in the database with a fifteen minute idle limit and an
eight hour absolute limit.

Keycloak with OpenID Connect stays the intended path for anything
beyond the lab. It waits in Phase 12 as stretch work. The session
table already separates the password check from the second factor,
so swapping the code step for an identity provider touches one
module, not every route.

The console code is weaker than real multi-factor sign-in. Every
document that describes it says so plainly, including the limits
section of the main guide.

## Addendum, 17 October 2026

Phase 12 stretch item one built the swap-in this decision waited on.
The browser takes an authorization code with a PKCE challenge from a
local Keycloak 26.0 instance, and the provider identifies the person
while the local tables still decide the role. The two routes sit at
/auth/oidc and /auth/oidc/callback behind OIDC_ISSUER, so the
provider stays hidden until the switch carries a value. That keeps
the wait the paragraph above describes, and the session row that
opens is the same row a local sign-in opens, so lockout, idle limits
and the console code step all stand where they stood. The decision
itself is unchanged and still signed off as written.
