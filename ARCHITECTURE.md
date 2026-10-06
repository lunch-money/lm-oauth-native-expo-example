# Architecture

```text
React Native screen (no credentials in state)
  -> OAuth workflow
     -> discovery at configured API base URL
     -> expo-auth-session + system browser
     -> SecureStore pending attempt {state, verifier, redirect, timestamps}
     -> one-time callback validation + public code exchange
     -> validated GET /v2/me
     -> SecureStore connections[user_id, account_id] + active pair references
     -> per-connection refresh + atomic rotated replacement
     -> active-connection revoke + verify or local reset
```

The [`src/oauth/`](src/oauth/README.md) directory is the teaching core. It owns
the protocol-facing application decisions and narrow injected boundaries.
[`src/scaffolding/`](src/scaffolding/README.md) owns React Native presentation,
public environment adaptation, device SecureStore wiring, and lifecycle glue.
ESLint and [`tests/publication.test.ts`](tests/publication.test.ts) enforce that
the OAuth core cannot import React, Expo Router, styling, or scaffolding.

`expo-auth-session` prepares state, verifier, S256 challenge, and authorization
URL. The application still discovers endpoints, persists the attempt before
navigation, checks exact redirects, consumes once, exchanges without a secret,
identifies the selected budgeting account with a validated `/v2/me` response,
stores credentials securely, and decides recovery.

The application stores one pending attempt and a versioned collection of
connections for one installed sample instance. The validated `/v2/me` pair
(`id`, `account_id`) is the connection key; user name and `budget_name` are
retained with the record. This lets two Lunch Money users keep independent
credentials for the same shared account. Starting another attempt replaces only
the abandoned attempt. Completing authorization atomically creates or replaces the identified pair,
makes its Lunch Money user active, and exposes only that user's connections. An
existing visible connection can be selected without OAuth; a hidden connection
owned by another user cannot.

This native teaching sample assumes one local device user. It does not provide
application authentication or isolate connections between people sharing a
device. Shared browser cookies may influence which login screen appears, but
they never establish identity; only the validated `/v2/me` response does. A
production app must define its local-user boundary before synchronizing
connections across devices.

Before refresh, the credential record changes atomically from `active` to
`refreshing`. A replacement write returns it to `active`; terminal failure stores
`reauthorization_required`. If the app stops between those writes, restart sees
the non-active state and cannot replay the old refresh token. An in-process
coordinator also prevents two UI actions from refreshing concurrently. These
state transitions affect only the active connection; other connections remain
usable. Removing the active connection selects the remaining lowest numeric
account ID owned by the same Lunch Money user. If that user has none left, the
app shows a disconnected state and never reveals or selects another user's
stored connection.

Previous storage records lack the complete validated identity needed by the
connected UI. On first read, the sample removes them, records a safe migration
marker, and asks the user to authorize again rather than displaying placeholders
or inventing identity.
