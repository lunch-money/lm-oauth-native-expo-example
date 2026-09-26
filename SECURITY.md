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
- Refresh is serialized, marks the old set unusable before the network request,
  requires a rotated refresh token, and replaces the complete set atomically.
- Tokens, codes, verifiers, callback URLs, raw responses, and exception text are
  absent from logs, analytics, screenshots, normal UI state, and safe errors.
- `/v2/me` is displayed only after strict documented-schema validation.
- Revocation and local reset are distinct. Reset cannot invalidate remote access.

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
