# Initial native OAuth sample plan

## Public-client security boundary

Build one Expo development-build application for iOS and Android. The installed
application is the OAuth client: it has no trusted backend and no client secret.
It opens the platform authentication browser, uses authorization code with
unpredictable state and S256 PKCE, exchanges the code with `client_id` only,
stores OAuth material with `expo-secure-store`, and calls Lunch Money directly.
No token, code, verifier, raw response, or callback URL is logged or placed in
ordinary presentation state.

The public contract is the Lunch Money developer documentation and v2 OpenAPI
schema. OAuth endpoints come from `/.well-known/oauth-authorization-server` at
the configured public API base URL. Authorization requests omit `scope`; the
registered immutable scope set supplies `me:read`.

## Source material and provenance

- `lunch-money-oauth-demo` at
  `100e6aaaa7130250c76891cfef86691f53971892`: reuse the Expo dependency choices,
  system-browser concept, public token exchange shape, and SecureStore direction.
  Do not copy its combined modes, constructed endpoint paths, memory-only PKCE,
  raw token logging option, private setup, or backend-assisted flow.
- `lm-oauth-confidential-node-example` at
  `145d4de86c40f9d65f6f9e21d3ff01aa0d505a0a`: reuse its teaching/scaffolding
  separation, strict `/v2/me` validation, safe-error pattern, focused security
  comments, tests, documentation hierarchy, and publication checks. Do not
  reuse secrets, Basic authentication, server sessions/cookies, Hono, server
  credential ownership, or refresh implementation.
- `developer-docs` at
  `20634c7b5e464a2eb21b2f6e18152c96a8fc155f`: use the native-client, discovery,
  redirect, token lifecycle, revocation, and `/v2/me` public contract.

## Module layout

Keep the teaching path in `src/oauth/`: types and safe errors; configuration and
metadata discovery; `expo-auth-session` protocol adapter; pending authorization
attempt lifecycle; callback completion and public code exchange; credential
storage; validated `/v2/me` access; revocation and verification; workflow
composition. Keep React Native components, application state, styles, config
loading, and SecureStore wiring in `src/scaffolding/`. Enforce that the teaching
core cannot import React, UI, routing, or presentation modules with ESLint and a
source-boundary test. Expo-specific protocol and secure-storage adapters are
explicit exceptions inside the teaching directory.

## Secure state

Define narrow injected storage, clock, random, HTTP, and OAuth-browser
boundaries. Save state, PKCE verifier, exact redirect URI, creation time, expiry,
and authorization URL metadata in SecureStore before opening the browser. Use a
five-minute sample lifetime, described as application policy rather than a Lunch
Money token lifetime. On callback, load and delete the attempt before validation
or exchange, so success, denial, malformed data, mismatch, expiry, and replay all
consume it. Startup removes malformed or expired abandoned attempts. Credentials
are separately validated, expiry-checked, and kept only in SecureStore.

## Redirect and deep-link behavior

Use the sample-specific private scheme `app.lunchmoney.nativeexpo` and callback
`app.lunchmoney.nativeexpo:/oauth/callback` for the local walkthrough. Compare
scheme, authority, path, and query structure against the exact configured URI
before processing parameters. Require an Expo development build; Expo Go is not
supported. Explain that production should prefer properly claimed Universal
Links/App Links where Lunch Money registration and deployment support them.

## Initial walkthrough

Register a native/public client with `me:read` only; configure public client ID,
API base URL, and exact redirect; authorize in the system browser; validate and
exchange; persist; call `/v2/me`; revoke; require the old token to receive `401`;
delete locally; reauthorize; and separately demonstrate local reset without
remote revocation.

## Testing and validation

Use dependency-injected fakes to cover URL construction, discovery, state,
S256 PKCE, exact redirect, omitted scope, public exchange, denial/cancellation,
malformed or mismatched callback, expiry, replay, restart, token/profile parsing,
network and SecureStore failures, missing scope, expired credentials, revocation,
post-revocation verification, local reset, and redaction. Add publication tests
for preview hosts, secret-like tracked values, backend/confidential concepts, and
dependency boundaries. Run format check, lint, TypeScript, Jest, Expo config,
and iOS/Android production exports when dependencies and platform tooling allow.

## Documentation integration

Make `docs/WALKTHROUGH.md` canonical. Add the requested architecture, security,
production, troubleshooting, OAuth/scaffolding guides, and contribution docs.
Prepare a concise native entry in `../developer-docs/docs/oauth/sample-applications.md`
but do not invent or publish a repository link before the public URL is confirmed.
Preserve unrelated developer-docs work.

## Refresh amendment and deferred production work

Refresh was added after owner review, following the confidential sample's
optional `offline_access` pattern. The native implementation uses
`expo-auth-session`, requires rotation, serializes calls, writes a durable
pre-request marker, atomically replaces the complete set, and tests replay,
failed persistence, restart, revocation, and terminal reauthorization. Production
refresh scheduling, multi-context coordination, backup/migration/reinstall
behavior, and operational recovery remain deferred, along with claimed HTTPS
links, final identifiers, release signing, attestation, observability,
accessibility review, device-matrix testing, and store distribution.

## Owner decisions and constraints

Do not add a license, maintainer claim, support/security contact, remote, public
repository URL, or publication policy without owner confirmation. Repository
policy prevents creating or editing `.env`-pattern files, so document exported
public variables and provide a non-secret `config.example` placeholder template
instead of `.env.example`; report this deviation explicitly.
