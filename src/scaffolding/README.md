# Expo and React Native scaffolding

This directory is replaceable application glue rather than OAuth teaching code:

- [`configuration.ts`](configuration.ts) maps bundled public values.
- [`secure-store.ts`](secure-store.ts) adapts `expo-secure-store`.
- [`AppScreen.tsx`](AppScreen.tsx) provides the walkthrough UI and restart callback handling.

The screen keeps only status text, safe summaries for the active validated
Lunch Money user, and a validated `/v2/me` profile in React state. It never
stores tokens, codes, verifiers, hidden-user summaries, raw responses, or
callback URLs. Beginning or resuming authorization and selecting a visible
summary clear previously displayed profile data. The connected identity and
budget control remain absent until authorization has exchanged the code and
validated `/v2/me`. Multiple visible budgets use a compact accessible modal;
selection applies immediately.
