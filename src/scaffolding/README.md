# Expo and React Native scaffolding

This directory is replaceable application glue rather than OAuth teaching code:

- [`configuration.ts`](configuration.ts) maps bundled public values.
- [`secure-store.ts`](secure-store.ts) adapts `expo-secure-store`.
- [`useOAuthDemo.ts`](useOAuthDemo.ts) owns React state, restart callback
  handling, and calls into the OAuth workflow.
- [`AppScreen.tsx`](AppScreen.tsx) composes the walkthrough UI from the small
  components in [`components/`](components/).

The controller keeps only status text, safe summaries for the active validated
Lunch Money user, and a validated `/v2/me` profile in React state. It never
stores tokens, codes, verifiers, hidden-user summaries, raw responses, or
callback URLs. Beginning or resuming authorization and selecting a visible
summary clear previously displayed profile data. The connected identity and
budget control remain absent until authorization has exchanged the code and
validated `/v2/me`. Multiple visible budgets use a compact accessible modal;
selection applies immediately.

On startup, the workflow derives a token-free availability summary from the
stored credential state and expiration time. The screen distinguishes a token
that is locally ready, one that must be refreshed, and one that requires a new
authorization. This check makes no network request: an unexpired token can
still have been revoked by the server. The UI therefore describes it as ready
to try, not as remotely validated, and keeps unavailable API actions hidden.

The components receive safe display values and event callbacks. They do not
import the workflow, credential store, or protocol adapters. This makes the
replaceable React Native presentation recognizable without moving framework
concerns into the OAuth teaching core.

Configuration defaults to the production HTTPS API. A separate public opt-in
permits a support-supplied loopback HTTP URL for local API testing; it never
permits remote cleartext traffic. Like every `EXPO_PUBLIC_` value, this flag is
bundled into the installed application and is not a secret.

While a new authorization is being checked, the screen hides any identity from
a previous connection. If `/v2/me` fails, the safe error remains visible and
the old identity stays hidden for the rest of that screen session. Its
credential remains in secure storage and is available after a successful retry
or app restart.
