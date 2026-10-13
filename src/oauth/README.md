# OAuth teaching code

This directory contains the code developers should study. Start with
[`types.ts`](types.ts), then read:

1. [`configuration.ts`](configuration.ts) — public settings and how the app asks Lunch Money for its current OAuth URLs.
2. [`expo-auth-session.ts`](expo-auth-session.ts) — how Expo creates the authorization request and opens the system browser.
3. [`authorization-attempt.ts`](authorization-attempt.ts) — values saved securely to check one browser return, then deleted.
4. [`callback.ts`](callback.ts) — exact callback validation and public code exchange.
5. [`lunch-money-api.ts`](lunch-money-api.ts) — the official SDK call to `/v2/me` and the required-property check used to identify the selected account.
6. [`credential-storage.ts`](credential-storage.ts) — credentials stored by Lunch Money user and budget, with only that user's budgets shown together.
7. [`refresh.ts`](refresh.ts) — one refresh at a time, complete credential replacement, and safe recovery when refresh cannot continue.
8. [`revocation.ts`](revocation.ts) — which token the app revokes and how it checks that the old access token no longer works.
9. [`workflow.ts`](workflow.ts) — screen and lifecycle operations composed without UI code.
10. [`errors.ts`](errors.ts) — errors that are safe to display or log because they contain no credentials or response data.

`expo-auth-session` creates the authorization request, including the PKCE values
that let a native app exchange a code without a client secret. The application
still decides which discovered URLs it trusts, saves the values needed to check
the browser return, accepts each saved attempt only once, and verifies the exact
redirect URI. It calls `/v2/me` before saving credentials, stores each connection
by Lunch Money user and budget, shows only budgets for the active user, and
verifies revocation before deleting a credential. This directory may import
Expo's OAuth adapter, but it cannot import React, styling, routing, or
[`src/scaffolding`](../scaffolding/README.md).

The official `@lunch-money/lunch-money-js-v2` SDK creates the authenticated API
request, parses successful JSON, and reports API failures. Generated TypeScript
types do not check a response while the app is running, so
[`lunch-money-api.ts`](lunch-money-api.ts) also verifies that every user property
needed by this sample is present. It returns the SDK's `User` object, accepts
additional response properties, and never copies response data into an error or
diagnostic log.
