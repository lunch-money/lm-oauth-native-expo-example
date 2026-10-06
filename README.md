# Lunch Money native OAuth example for Expo

This is a focused reference for an iOS or Android application installed on a
user's device **without a trusted backend that can hold a client secret**. It
uses the system authentication browser, authorization code with state and S256
PKCE, OAuth discovery, and platform secure storage to authorize Lunch Money,
call `GET /v2/me`, retain multiple authorized budgets, switch the active budget,
optionally rotate refresh credentials, revoke access, and reauthorize.

[`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/) is
Lunch Money's recommended and supported third-party OAuth library for Expo. It
creates the authorization request and PKCE values; this sample adds secure
attempt persistence, exact callback checks, token exchange, lifecycle handling,
and API response validation.

> This is a native/public client. It has no client secret. If your trusted
> server performs the exchange and owns credentials, use the
> [confidential Node.js sample](https://github.com/lunch-money/lm-oauth-confidential-node-example).
> A responsive UI does not decide the client type—the credential boundary does.

## Run the sample

You need Node.js 20+, npm 11.6.2, and one configured native toolchain. On a Mac,
the iOS Simulator is normally the shortest path. Start with the walkthrough's
[prerequisite checklist](docs/WALKTHROUGH.md#1-install-and-verify-prerequisites)
and continue through client registration.

```sh
npm ci

export EXPO_PUBLIC_LUNCH_MONEY_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID
export EXPO_PUBLIC_LUNCH_MONEY_REDIRECT_URI='app.lunchmoney.nativeexpo:/oauth/callback'

# First iOS setup: build and install the native development app
npm run ios:build

# Start Metro in the foreground and open the installed app
npm run ios

# Android: start an emulator, then build, install, and start Metro
npm run android
```

During first iOS setup, the app may briefly report that it cannot reach the
development server after `ios:build`; this is expected until `npm run ios`
starts Metro. See [troubleshooting](TROUBLESHOOTING.md) for setup recovery and
definitive Simulator shutdown instructions.

The API base URL defaults to `https://api.lunchmoney.dev`. Beta and alpha
testers can set `EXPO_PUBLIC_LUNCH_MONEY_API_BASE_URL` to the exact environment
URL supplied by Lunch Money support.

As an alternative to shell exports, copy [`config.example`](config.example) to
`.env.local`, replace its placeholders, and run the same commands. Expo loads
that file automatically. All `EXPO_PUBLIC_` values are bundled into the app and
may contain only public configuration—never a secret or token. Git ignores the
local file; do not commit it.

Follow the canonical [native walkthrough](docs/WALKTHROUGH.md) to register the
client, authorize one or more budgets, switch the active budget, call `/v2/me`,
optionally refresh, revoke and verify access, reauthorize, and test local-only
reset.

Token exchange alone is not a completed connection. Each authorization calls
and strictly validates `/v2/me` before normal credential persistence or
connected UI appears. Its `id` and `name` establish the active Lunch Money user,
The pair (`id`, `account_id`) is the local connection key, so two Lunch Money
users can independently authorize the same shared account. `budget_name` is
display metadata.
The active-budget selector exposes only stored budgets belonging to that active
validated user. **Authorize another budget** starts a new authorization and may
return a different user because shared browser state never proves identity.
Until `/v2/me` succeeds, the app shows no connected identity or budget list.

## Code map

Start with the [`src/oauth` reading guide](src/oauth/README.md). The compact OAuth
teaching code is separate from the replaceable [Expo/React Native scaffolding](src/scaffolding/README.md).
Focused tests live in [`tests/`](tests/).

- [Architecture](ARCHITECTURE.md)
- [Security model](SECURITY.md)
- [Production checklist](PRODUCTION_CHECKLIST.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Contributing](CONTRIBUTING.md)

## Scope and status

This is a teaching build, not a production template. Optional refresh demonstrates
rotation, serialized use, atomic secure replacement, restart safety, and terminal
reauthorization; it does not define background scheduling or every production
device lifecycle. Production apps must also supply claimed links, final application
identifiers, release signing, device testing, redacted observability, and
accessibility review. See the [production checklist](PRODUCTION_CHECKLIST.md).

Connections authorized by different Lunch Money users may coexist securely on
the device, but only the active validated user's budgets are listed or
selectable. Reauthorizing a previously stored user makes that user's connections
visible again. The sample does not provide application login or isolation
between people sharing a device.

The code is derived conceptually from Lunch Money's internal Expo demonstration
at commit `100e6aaaa7130250c76891cfef86691f53971892` and the public confidential
sample at commit `145d4de86c40f9d65f6f9e21d3ff01aa0d505a0a`. Public behavior follows the
[Lunch Money native-app guidance](https://lunchmoney.dev/oauth/native-apps) and
[v2 API documentation](https://lunchmoney.dev/v2/).

Maintainer, support/security contact, license, public repository URL, and
publication policy remain owner decisions and are intentionally not invented.
