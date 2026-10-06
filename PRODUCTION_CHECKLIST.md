# Production adaptation checklist

This is a review aid, not a certification.

- Replace the teaching scheme and sample bundle/application identifiers.
- Prefer claimed HTTPS Universal Links/App Links and verify association files,
  domain control, exact Lunch Money registration, and fallback behavior.
- Define device support, OS minimums, release signing, store distribution, and
  secure backup/migration behavior.
- Threat-model rooted/jailbroken devices, device sharing, screen capture,
  accessibility services, keyboards, crash reporters, analytics, and support
  tooling; use explicit redaction allowlists.
- Decide whether local reset, application sign-out, account switching, device
  loss, and app deletion require remote revocation or user instructions.
- Define the local application-user boundary. Scope every connection operation
  by a stable authenticated application-user ID if multiple people can use one
  installation; do not treat this sample's device-wide collection as tenant
  isolation.
- Keep provider account identity from validated `/v2/me`, preserve duplicate
  budget names, derive active identity only from that response, hide stored
  connections belonging to other provider users, isolate cached resource data
  per account, and decide how many secure records one installation may retain.
- Define access-token expiry UX, refresh scheduling, and reliable reauthorization.
- Extend the demonstrated refresh coordination across every foreground,
  background-task, widget, extension, and process context that can access the
  same secure credential.
- Revalidate rotation, replay, atomic secure persistence, provider success
  followed by local failure, expiry, revocation, restart, terminal failure, OS
  backup/restore, legacy-format migration, reinstall, duplicate names,
  reauthorization-in-place, removal fallback, and account switching.
- Test cancellation, denial, bad/missing state, wrong redirect, replay, expiry,
  malformed metadata/token/profile responses, network loss, SecureStore errors,
  revoked access, insufficient scope, and device/process restarts.
- Add timeouts, bounded retries where safe, rate-limit handling, offline UX,
  localization, accessibility, and a supported device matrix.
- Pin and update dependencies; run formatting, lint, typecheck, tests, audit,
  iOS/Android production builds, secret scanning, and a real smoke test.
- Confirm license, maintainers, support/security contact, vulnerability process,
  CI, release owner, public URL, and publication policy.
