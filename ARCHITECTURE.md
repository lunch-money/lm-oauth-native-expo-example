# Architecture

```text
React Native screen (no credentials in state)
  -> OAuth workflow
     -> discovery at configured API base URL
     -> expo-auth-session + system browser
     -> SecureStore pending attempt {state, verifier, redirect, timestamps}
     -> one-time callback validation + public code exchange
     -> SecureStore access credential
     -> validated GET /v2/me
     -> serialized refresh + atomic rotated replacement
     -> grant-aware revoke + verify
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
stores credentials securely, validates API responses, and decides recovery.

The application stores one pending attempt and one credential for one installed
sample instance. Starting another attempt replaces the abandoned one. A
production app should define deliberate multi-account and concurrent-attempt UX
if required.

Before refresh, the credential record changes atomically from `active` to
`refreshing`. A replacement write returns it to `active`; terminal failure stores
`reauthorization_required`. If the app stops between those writes, restart sees
the non-active state and cannot replay the old refresh token. An in-process
coordinator also prevents two UI actions from refreshing concurrently.
