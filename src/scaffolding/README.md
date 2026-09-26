# Expo and React Native scaffolding

This directory is replaceable application glue rather than OAuth teaching code:

- [`configuration.ts`](configuration.ts) maps bundled public values.
- [`secure-store.ts`](secure-store.ts) adapts `expo-secure-store`.
- [`AppScreen.tsx`](AppScreen.tsx) provides the walkthrough UI and restart callback handling.

The screen keeps only status text and a validated `/v2/me` profile in React
state. It never stores tokens, codes, verifiers, raw responses, or callback URLs.
