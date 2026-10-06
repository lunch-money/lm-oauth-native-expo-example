# Troubleshooting

## Configuration is missing

Set the public client ID and redirect URI shown in
[`env.example`](env.example). The API base URL is optional and defaults to
the Lunch Money production API. Inspect local configuration yourself; never
paste tokens or credential-file contents into logs or support requests. For
validation requirements and restart instructions, see
[`Public OAuth configuration is missing or invalid`](docs/WALKTHROUGH.md#public-oauth-configuration-is-missing-or-invalid)
in the walkthrough.

## Stop iOS Simulator completely

Quitting Simulator or Device Hub may close its windows without shutting down
every booted device. Stop all Simulator devices with:

```sh
xcrun simctl shutdown all
```

Then quit Simulator, Device Hub, and Xcode normally. Xcode does not need to
remain open for `npm run ios:build`; Expo invokes its command-line build tools.
Background CoreSimulator services may remain after shutdown and are normal.

## Expo Go does not return to the app

Use `npm run ios:build` or `npm run android` to install a development build.
Expo Go does not own the registered sample scheme.

## Xcode fails while building `ExpoModulesJSI`

This sample requires Xcode 26.6, matching Expo SDK 57's supported iOS build
image. Check the active toolchain:

```sh
xcodebuild -version
```

If it reports an earlier release, update Xcode before rebuilding. Errors about
`SWIFT_RETURNS_RETAINED`, regular-expression literals, actor isolation, or
values that risk data races are symptoms of an incompatible Swift toolchain,
not problems with the OAuth code. The Expo Dev Launcher warning about ambiguous
script dependencies is unrelated and does not cause Xcode error 65.

## Redirect or callback verification fails

The scheme, authority, path, and any registered query must match exactly. A
missing, changed, expired, or already consumed attempt must start again. Never
bypass state, PKCE, redirect, expiry, or one-time consumption checks.

## Authorization was cancelled or denied

This is a normal user decision. Choose Connect again when ready. No credential
is saved.

## An older saved credential requires authorization again

Earlier development storage formats did not retain the complete validated user
identity required by the connected UI. The current sample removes those local
credentials and asks you to authorize again rather than assigning a guessed
identity or displaying placeholders. This migration does not remotely revoke
an old grant; remove it through Lunch Money Connected Apps if it should no
longer remain authorized.

## Two-finger trackpad scrolling does not work in iOS Simulator

Xcode 26.6 may not translate ordinary macOS two-finger scrolling into an iPhone
touch gesture. Click and drag upward inside the simulated screen to perform a
touch-style swipe, or verify the interaction on a physical device. Browser
arrow-key behavior is not representative of a native React Native screen and
the sample does not add simulator-only keyboard scrolling.

## `/v2/me` reports missing scope

Register a replacement native client with `me:read`. Scopes are immutable and
the authorization request intentionally omits `scope`.

## The credential expired

If the client includes `offline_access`, choose **Refresh access token**. If no
Refresh action appears, authorize again using a registration that includes
`offline_access` or continue with interactive reauthorization.

## Refresh requires authorization again

The refresh token was rejected, the response did not include a rotated refresh
token, the rotated set could not be saved, or the app stopped during refresh.
Do not retry the old token. Choose **Connect Lunch Money** and authorize again.

## Refresh is temporarily unavailable or already running

A transient provider/network failure restores the current secure credential for
a later deliberate retry. If refresh is already running, wait rather than
starting another. Never log the request, response, or token values.

## Revocation cannot be verified

The sample keeps the local credential unless the old token receives `401` from
`/v2/me`. Check network access and official Lunch Money status/support guidance;
do not print or share the token while investigating.

## Android emulator reports `ENETUNREACH`

An error such as `Failed to connect` followed by `Network is unreachable` means
the emulator has no active network route to Metro. Open Android's Quick Settings
inside the emulator, turn off Airplane Mode, and confirm networking is enabled.
The emulator also needs internet access for Lunch Money authorization and API
requests.

After networking becomes available, reload the app from the Metro terminal or
rerun `npm run android`. If the emulator still has no network, stop it, use
Android Studio's **Cold Boot** action, and try again.

## Physical device cannot connect

Confirm the device can reach the same approved public HTTPS API as the host. A
host-only VPN or simulator route may not be available to a physical device.
