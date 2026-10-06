# OAuth teaching code

This directory contains the code developers should study. Start with
[`types.ts`](types.ts), then read:

1. [`configuration.ts`](configuration.ts) — public settings and OAuth metadata discovery.
2. [`expo-auth-session.ts`](expo-auth-session.ts) — maintained library and system-browser adapter.
3. [`authorization-attempt.ts`](authorization-attempt.ts) — finite, secure, one-time pending state.
4. [`callback.ts`](callback.ts) — exact callback validation and public code exchange.
5. [`lunch-money-api.ts`](lunch-money-api.ts) — strict `/v2/me` validation used to identify the selected account.
6. [`credential-storage.ts`](credential-storage.ts) — versioned, user-and-account-keyed secure connections with validated active-user filtering.
7. [`refresh.ts`](refresh.ts) — serialized rotation, atomic replacement, and terminal recovery.
8. [`revocation.ts`](revocation.ts) — grant-aware public-client revoke and old-token verification.
9. [`workflow.ts`](workflow.ts) — screen and lifecycle operations composed without UI code.
10. [`errors.ts`](errors.ts) — stable redacted failures.

`expo-auth-session` owns standards-sensitive authorization request and PKCE
construction. The application owns discovery policy, persistent attempts, exact
redirect checks, one-time consumption, `/v2/me` identification before
persistence, (`id`, `account_id`)-keyed secure credentials, active-user isolation,
revocation verification, and recovery. The core may import Expo's OAuth adapter
but cannot import React, styling, routing, or [`src/scaffolding`](../scaffolding/README.md).
