# Security model

The installed app and device security services hold the credential. The app has
no client secret and no trusted backend. Lunch Money and the configured public
HTTPS API are trusted protocol peers; callback links and all returned data are
untrusted until validated.

- State binds the return to the saved authorization attempt.
- S256 PKCE binds the code to the verifier stored on this device.
- The exact redirect scheme, authority, and path must match.
- Every attempt is deleted before success or failure processing and expires
  after five minutes of sample application policy.
- Credentials and pending attempts use `expo-secure-store`, not AsyncStorage or
  ordinary preferences.
- Authorization is not complete after token exchange. The app calls and
  strictly validates `/v2/me`; only then do its user ID and name establish the
  active identity and the pair (`id`, `account_id`) identify the local
  connection. Two identities may therefore hold separate credentials for the
  same shared account. Browser
  cookies, tokens, and budget names are never identity keys.
- React state receives only connection summaries. Credential sets remain in
  secure storage, summaries for other Lunch Money users remain hidden, and
  credentials are loaded only for an active-budget operation.
- Refresh is serialized, marks the old set unusable before the network request,
  requires a rotated refresh token, and replaces the active account's complete
  set atomically without changing another account.
- Tokens, codes, verifiers, callback URLs, raw responses, and exception text are
  absent from logs, analytics, screenshots, normal UI state, and safe errors.
- Authorization actions return only typed, display-safe outcomes after
  `/v2/me` succeeds. No connected identity, budget count, or selector is shown
  before that validation completes.
- `/v2/me` is displayed only after strict documented-schema validation.
- Revocation and local reset apply only to the active connection and are
  distinct. Reset cannot invalidate remote access. Reauthorizing an existing
  account replaces its local credential record but does not claim the previous
  remote grant was revoked.

The sample is single-device-user software, not a multi-user security boundary.
Connections from different Lunch Money identities can coexist in secure
storage, but the UI and selection API expose only the identity established by
the latest successful `/v2/me`. Production software that has its own user
accounts must additionally bind every connection to a stable authenticated
application-user identifier and prevent cross-user listing, selection, refresh,
revocation, and deletion.

A private-use scheme can be intercepted by another installed app on some
platforms. It is acceptable for this local walkthrough, not the preferred
production redirect. Use verified Universal Links/App Links where supported and
review platform-specific redirect ownership, backup behavior, device compromise,
screen capture, crash reporting, and accessibility exposure.

`offline_access` is optional. The teaching flow covers rotation, same-process
concurrency, restart interruption, malformed success, failed persistence,
terminal `invalid_grant`, grant-aware revocation, and reauthorization. Production
must additionally coordinate every foreground/background execution context and
define backup, migration, reinstall, retry, scheduling, and operational policy.

No security-reporting contact is asserted until the repository owner confirms it.
