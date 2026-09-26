# Contributing

Run `npm run check` before proposing a change. Keep the OAuth teaching core
compact and presentation-free. Changes to behavior should update exported JSDoc,
the relevant `Security invariant:` comment, focused tests, the canonical
[`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md), and supporting security docs.

Never add client secrets, live tokens, personal data, callback URLs containing
codes, raw provider responses, private hostnames, plaintext credential logging,
embedded WebViews, AsyncStorage credentials, backend-assisted modes, or
unpublished protocol claims.

Refresh changes must preserve rotation, one-at-a-time use, the durable
pre-request marker, complete-set replacement, failed-persistence recovery,
terminal `invalid_grant`, restart safety, and reauthorization tests. License,
maintainer, support/security contact, public URL, and publication workflow remain
owner decisions.
