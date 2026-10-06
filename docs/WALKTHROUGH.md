# Native Expo OAuth walkthrough

This is the canonical first-run guide. You will register a real native/public
client, authorize it in the platform browser, store its access token with the
device security service, call `GET /v2/me`, optionally rotate refresh
credentials, revoke and verify the old token, authorize again, and see how local
reset differs from revocation.

[`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/) is
the recommended and supported Expo OAuth library. It creates the browser-based
authorization request and S256 PKCE values. The sample persists the pending
attempt before opening the browser so a callback can safely resume after app
suspension or process restart.

## 1. Install and verify prerequisites

You need the shared tools and **one** complete native development path. The iOS
Simulator is normally the simplest choice on a Mac. Expo Go is not supported:
this walkthrough needs a development build installed under the sample's own
application identifier so that it owns the registered callback scheme.

### Shared requirements

- Node.js 20 or newer;
- npm 11.6.2;
- Git;
- a Lunch Money account with access to OAuth client registration; and
- the public client ID supplied for that registration.

Check the command-line tools before continuing:

```sh
node --version
npm --version
git --version
```

### Option A: iOS Simulator on macOS

Install and configure:

- Xcode 26.6, the toolchain used by Expo SDK 57's supported iOS build image;
- Xcode command-line tools;
- at least one iOS Simulator runtime and simulator device in Xcode; and
- CocoaPods for installing the sample's native Expo modules.

Open Xcode once after installation so it can finish installing components and
you can accept its license. In Xcode, use **Settings → Locations** to select the
command-line tools and **Settings → Platforms** to install an iOS runtime. The
active developer directory must point to the full Xcode installation—not the
standalone Command Line Tools directory. Then verify the selection:

```sh
xcode-select --print-path          # normally /Applications/Xcode.app/Contents/Developer
xcodebuild -version                # should report Xcode 26.6
xcrun --find simctl                # should print the path to simctl
xcrun simctl list devices available # should list at least one available iOS Simulator
pod --version                      # should print the installed CocoaPods version
```

If any command does not return the expected result, see
[iOS prerequisite troubleshooting](#ios-prerequisite-troubleshooting).

For the shortest walkthrough, use a Simulator. Running on a physical iPhone
requires additional signing and device-trust setup.

Follow Expo's official [iOS Simulator environment setup](https://docs.expo.dev/get-started/set-up-your-environment/?platform=ios&device=simulated)
if any of these checks fail.

### Option B: Android emulator or physical device

On macOS, first follow Expo's
[Android Studio Emulator guide](https://docs.expo.dev/workflow/android-studio-emulator/)
to install Android Studio, JDK 17, and the Android SDK. Then use the checklist
below to configure and verify this sample's development path.

Install and configure:

- Android Studio;
- JDK 17—the Expo macOS guide uses Azul Zulu 17;
- the Android SDK Platform, Build-Tools, Emulator, and Platform-Tools selected
  by the Expo and Android Studio setup flow; and
- `ANDROID_HOME` pointing to the Android SDK, with the SDK's `platform-tools`
  and `emulator` directories available on `PATH`.

For an emulator, create an Android Virtual Device in Android Studio's Device
Manager and accept Android Studio's recommended API and system image. Choose an
ARM64 image on an Apple Silicon Mac or an x86_64 image on an Intel Mac. A
download arrow beside the recommended image means it is not installed: click
the arrow, accept the license, wait for the download, select the installed
image, and finish creating the device.

Start the virtual device with its **Play** button and wait for the Android home
screen before running the checks below. Alternatively, connect a physical
device with developer options and USB debugging enabled.

Verify the shell can find the SDK and a running emulator or attached device:

```sh
printf '%s\n' "$ANDROID_HOME"
adb version
adb devices
```

Confirm that `adb devices` lists the emulator or physical device as `device`,
not `offline` or `unauthorized`. The first `npm run android` generates the native
Android project, compiles it with Gradle, and installs the development build.

### Device and simulator networking

The app calls the configured public HTTPS API directly. If the approved API
environment requires a VPN or restricted network, the simulator, emulator, or
physical device must also be able to reach it. A phone does not automatically
share every host-only route or VPN configuration. Do not replace the supplied
public API URL with an undocumented private hostname.

## 2. Register the native client

In the Lunch Money Developer Portal, register a **Native or public client** with:

- scope `me:read`;
- optional `offline_access` if you want to exercise refresh rotation; and
- exact redirect URI `app.lunchmoney.nativeexpo:/oauth/callback`.

This sample uses a custom URL scheme so the operating system can return from the
browser to the installed app. Its reverse-domain-style name follows
[OAuth guidance for native apps](https://www.rfc-editor.org/rfc/rfc8252.html#section-7.1)
and is convenient for local development. Production apps should use verified
iOS Universal Links or Android App Links when possible because the operating
system verifies that the app controls the HTTPS domain. See Expo's
[linking guide](https://docs.expo.dev/linking/into-your-app/) and coordinate the
final redirect URI with Lunch Money registration.

## 3. Configure the development build

Install dependencies and export the public client ID and registered redirect
URI:

```sh
npm ci
export EXPO_PUBLIC_LUNCH_MONEY_CLIENT_ID=YOUR_PUBLIC_CLIENT_ID
export EXPO_PUBLIC_LUNCH_MONEY_REDIRECT_URI='app.lunchmoney.nativeexpo:/oauth/callback'
```

The API base URL defaults to the production API at
`https://api.lunchmoney.dev`. If you are testing a feature in a beta or alpha
environment, set `EXPO_PUBLIC_LUNCH_MONEY_API_BASE_URL` to the exact URL supplied
by Lunch Money support. The client registration and API base URL must belong to
the same environment.

As an equivalent local option, copy [`env.example`](../env.example) to `.env`,
replace the placeholders, and run the commands below. Expo loads the file
automatically. Git ignores `.env`.

Values with `EXPO_PUBLIC_` are compiled into the application. Never put a client
secret, token, code, or verifier in them. Native clients have no client secret.

## 4. Build and run

Choose the platform whose prerequisites you completed in step 1.

### Option A: iOS Simulator

For the first iOS setup, build and install the development app in iOS
Simulator. Simulator acts as a virtual iPhone on your Mac and runs the native
development build used throughout this walkthrough. The command generates and
compiles the native project, installs its dependencies, and launches the app.
This first build can take several minutes; later builds are usually faster:

```sh
npm run ios:build
```

This build intentionally does not start Metro. Until the next command runs, the
app may briefly report that it cannot connect to the development server or read
from its local port. That is expected during first setup.

macOS may ask the terminal app for permission to control System Events. Expo
uses this permission to open Simulator, so allow it for this walkthrough.

When that command finishes, start Metro in the same terminal. Metro is Expo's
local development server: it provides the JavaScript bundle to the native app
and reloads most JavaScript and TypeScript changes without rebuilding the
native project:

```sh
npm run ios
```

The command keeps Metro attached to the terminal, opens the installed app, and
leaves the Simulator running independently. **Ctrl+C** stops Metro without
closing Simulator. Start it again with `npm run ios` when you resume work.
macOS may also ask the terminal app for local-network access, which Metro uses
to connect the development build to its local server.

If you open `http://localhost:8081` in a browser, its JSON response is Expo's
development manifest. It is not the sample UI or an OAuth response.

The Simulator may remain open across development sessions, and the installed
development build only needs rebuilding after native dependencies or Expo
configuration change. Most JavaScript and TypeScript changes require only the
foreground `npm run ios` process. To stop every booted Simulator device, see
[Stop iOS Simulator completely](../TROUBLESHOOTING.md#stop-ios-simulator-completely).

The expected result is the **Native OAuth with Expo** screen in Simulator.

### Option B: Android emulator

Start the virtual device from Android Studio's Device Manager and wait for the
Android home screen. In the configured terminal, confirm that `adb devices`
lists the emulator as `device`, then run:

```sh
npm run android
```

On its first run, this command generates the native Android project, downloads
the required Gradle dependencies, compiles the app, installs it in the running
emulator, starts Metro, and opens the app. The first build may take several
minutes; later builds are usually faster. Metro may display **Idle** while the
native build continues elsewhere in the output. Wait until Expo prints
**Logs for your project will appear below. Press Ctrl+C to exit.** before
looking for the running app in the emulator.

Metro remains attached to the terminal. **Ctrl+C** stops Metro without shutting
down the Android emulator. The expected result is the **Native OAuth with Expo**
screen in the emulator.

If more than one emulator or physical Android device is connected, Expo may ask
which device to use.

## 5. Use the app

With the development build connected to Metro on either platform, choose
**Connect Lunch Money**.

The app discovers current OAuth endpoints, creates unpredictable state and S256
PKCE, saves the short-lived attempt in platform secure storage, and opens the
system authentication browser. It does not use an embedded WebView and does not
send a `scope` parameter; Lunch Money uses the client's immutable registered set.

After approval, Lunch Money returns to the exact registered URI. The app deletes
the pending attempt before checking the callback, rejects mismatch, expiry, or
replay, and exchanges the code with `client_id` and the PKCE verifier. Token
exchange alone is not a completed connection. The app then calls and strictly
validates `/v2/me`, treats its `id` and `name` as the active Lunch Money user,
uses the (`id`, `account_id`) pair to create or replace that budget's complete
secure connection,
and only then shows connected UI. There is no client secret or Authorization
header. The five-minute attempt expiry is this sample's policy, not a Lunch
Money token lifetime.

To connect another budget, choose **Authorize another budget** and approve it in
the system browser. The first connection remains stored. The **Active budget**
control switches among already-authorized connections for that validated user
without opening OAuth. Duplicate visible budget names remain separate and show
their numeric account IDs for local disambiguation. The newest authorization
becomes active; authorizing an existing (`id`, `account_id`) pair replaces that
connection in place rather than creating a duplicate.

The system browser may reuse login cookies, show a login page, or let the person
switch users. The client assumes none of those paths proves identity. If a new
authorization identifies a different Lunch Money user, that user's budget
becomes active and only that user's stored budgets are shown. Other users'
connections may remain securely stored but hidden and cannot be selected. A
later authorization for a previously stored user reveals only that user's
budgets again. This is not application-user or shared-device isolation.

Once connected, the screen reports `<User name> is connected. X authorized
budget(s).` The count includes only the visible active user's budgets. One
budget appears as non-interactive green text; multiple budgets use the same
green section as a compact control that opens a native modal selector. Choosing
an option immediately changes the active budget and dismisses the modal; there
is no separate Switch button.

Two Lunch Money users can separately authorize the same shared `account_id`.
Their credential records remain distinct because local identity uses the
validated (`id`, `account_id`) pair. Only the active validated user's record is
ever exposed or operated on.

To test restart behavior, begin authorization, suspend or terminate the app,
finish consent, and open the callback in the installed development build. The
attempt survives in secure storage. If more than five minutes passes, restart
authorization; the abandoned attempt is removed safely.

## 6. Call `/v2/me`

Choose **Call /v2/me**. The app loads only the active budget's access token
inside the action,
sends it in the bearer header, validates every field against Lunch Money's
documented `userObject`, and displays only the validated profile. A `403` means
the registered client is missing `me:read`; because scopes are immutable, use a
replacement registration rather than adding `scope` to the request.

## 7. Optionally refresh access

If you registered `offline_access`, choose **Refresh access token**, then choose
**Call /v2/me** again. The Refresh action appears only when Lunch Money returned
a refresh token.

Lunch Money rotates both credentials after a successful refresh. The sample
uses `expo-auth-session` to send the active connection's refresh request as a
public client, requires
a new refresh token in the response, and replaces the access token, refresh
token, expiry, and scope together in secure storage. It durably marks the old
credential unusable before the request so an app termination or failed
persistence cannot replay it after restart. Terminal `invalid_grant` or an
incomplete rotated response requires authorization again.

The sample allows immediate refresh for teaching. A production application
normally refreshes based on expiration or a rejected API request and must
coordinate every foreground, background, and extension execution context that
could use the same refresh token. Refresh failure and reauthorization state are
confined to the active connection.

If you registered only `me:read`, skip this step.

## 8. Revoke, verify, and authorize again

Choose **Disconnect active budget**. When a refresh token exists, the app revokes the
active connection's refresh token to end continuing access; otherwise it
revokes that connection's access token. It then calls
`/v2/me` with the old access token and removes the local credential only after
Lunch Money returns `401`. Other connected budgets are unchanged; the sample
selects the remaining connection with the lowest numeric account ID only when
it belongs to the same active Lunch Money user. Removing that user's final
budget shows a disconnected state rather than revealing another stored user.
An ambiguous failure retains the credential and displays a redacted error so you
can investigate without falsely reporting success.

Choose **Authorize another budget** or **Connect Lunch Money** and repeat the
flow. Reauthorization replaces the matching local account record. It does not,
by itself, assert that an older remote grant was revoked.

## 9. Demonstrate local reset

After authorizing again, choose **Forget local credential only** and confirm the
warning. This deletes only the active device connection but makes no revocation
request. Other same-user connections remain available, hidden users remain
hidden, and the remote authorization remains active. This distinction matters:
deleting local state is not logout from Lunch Money and cannot invalidate a
bearer token that was copied or retained elsewhere.
For a clean demonstration, revoke through Lunch Money Connected Apps afterward.

## Prerequisite troubleshooting

This section is not exhaustive. It records setup problems reported while running
this walkthrough and the recovery steps that resolved them. For issues not
covered here, use Expo's official [environment setup guide](https://docs.expo.dev/get-started/set-up-your-environment/).

### iOS prerequisite troubleshooting

#### `Public OAuth configuration is missing or invalid`

This error occurs before the app makes a network request. Confirm that all
the client ID and redirect URI from step 3 are available in the shell that runs
`npm run ios`, or in the local environment file described there. If you set an
API base URL override, confirm that it is available there as well.

An API base URL override must be the approved absolute **HTTPS** URL supplied
for the Lunch Money client. An HTTP URL such as `http://localhost:3002` is
rejected, so a server at that address will receive no request. The redirect URI
must be exactly `app.lunchmoney.nativeexpo:/oauth/callback`, and the client ID
must not be empty.

Stop Metro with **Ctrl+C**, correct or export the values, and restart it with
the same command used for that session. Expo substitutes `EXPO_PUBLIC_` values
into the JavaScript bundle, so a running Metro session must be restarted after
they change.

#### `xcrun` cannot find `simctl`

If `xcode-select --print-path` prints `/Library/Developer/CommandLineTools`, the
shell is using the standalone tools rather than the full Xcode toolchain. After
opening Xcode once, switch the active developer directory and finish its
first-run setup:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
```

Then retry:

```sh
xcode-select --print-path
xcrun --find simctl
xcrun simctl list devices available
```

If Xcode is installed under another name, use its actual application path. For
example, Xcode Beta commonly uses:

```sh
sudo xcode-select --switch /Applications/Xcode-beta.app/Contents/Developer
```

If `simctl` is found but no devices are available, open Xcode's
**Settings → Platforms** and install an iOS Simulator runtime.

#### The development build does not open in Simulator

Expo normally starts Simulator and boots an available device automatically.
If `npm run ios` does not open the installed development build, check whether a
simulator is booted:

```sh
xcrun simctl list devices booted
```

If the command lists no device, open Simulator and retry `npm run ios`:

```sh
open -a Simulator
```

If Simulator opens without a device, use **File → Open Simulator** to choose an
installed device or return to Xcode's **Settings → Platforms** to install a
runtime.

#### `pod` is not found

The local `npm run ios:build` workflow uses CocoaPods to install and link native
Expo modules before Xcode builds the app. Install CocoaPods, then open a new
shell and verify it is available:

```sh
brew install cocoapods
pod --version
```

If you do not use Homebrew, follow the official
[CocoaPods installation guide](https://guides.cocoapods.org/using/getting-started.html#installation).
Do not continue to `npm run ios:build` until `pod --version` succeeds.

#### Xcode is older than 26.6

This sample requires Xcode 26.6, matching Expo SDK 57's supported iOS build
image. Earlier Xcode 26 releases use Swift toolchains that cannot compile the
version of `expo-modules-jsi` used by this sample. The failure commonly appears
in the `[CP-User] Build ExpoModulesJSI xcframework` phase and ends with
`xcodebuild` error 65.

Update Xcode, select the updated installation, and finish its first-run setup:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
xcodebuild -version
```

Confirm the command reports Xcode 26.6 before reinstalling dependencies and
running `npm run ios:build` again. The separate warning that the Expo Dev Launcher
script has ambiguous dependencies does not cause this compiler failure.

Expo may also display **Installing CocoaPods...** while it runs `pod install`
with the CocoaPods command-line tool already on the machine. Output mentioning
Pods, Hermes, React Native dependencies, privacy bundles, and other native
targets is normal during the first build.

## What remains production work

The interactive refresh action demonstrates secure rotation and recovery, not a
complete production lifecycle. A production app must define refresh scheduling,
foreground/background coordination, retry limits, OS backup and device-migration
behavior, app reinstall and account-switch cleanup, operational redaction, and
recovery across every execution context that can access the credential.

Next read [`src/oauth/README.md`](../src/oauth/README.md), then review
[`SECURITY.md`](../SECURITY.md) and [`PRODUCTION_CHECKLIST.md`](../PRODUCTION_CHECKLIST.md).
