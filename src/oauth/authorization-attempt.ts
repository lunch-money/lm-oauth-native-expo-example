import { z } from 'zod'
import { SafeOAuthError } from './errors'
import type { Clock, KeyValueStore, PendingAuthorization } from './types'

const ATTEMPT_KEY = 'lunch-money.native-oauth.pending-authorization.v1'
export const ATTEMPT_LIFETIME_MS = 5 * 60 * 1000
const attemptSchema = z.object({
  state: z.string().min(32),
  codeVerifier: z.string().min(43),
  redirectUri: z.string().url(),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
})

/**
 * Before opening the browser, save the random state value, PKCE verifier, and
 * redirect URI in secure device storage. The app needs them when Lunch Money
 * sends the user back, including after the app is suspended or restarted.
 */
export async function savePendingAuthorization(
  store: KeyValueStore,
  clock: Clock,
  input: Pick<PendingAuthorization, 'state' | 'codeVerifier' | 'redirectUri'>,
): Promise<PendingAuthorization> {
  const attempt = {
    ...input,
    createdAt: clock.now(),
    expiresAt: clock.now() + ATTEMPT_LIFETIME_MS,
  }
  try {
    await store.set(ATTEMPT_KEY, JSON.stringify(attempt))
    return attempt
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The authorization attempt could not be saved securely.',
    )
  }
}

/**
 * When the browser sends the user back, load and immediately delete the saved
 * authorization details. Deleting first ensures the same browser return cannot
 * be submitted twice, even when validation fails.
 */
export async function consumePendingAuthorization(
  store: KeyValueStore,
  clock: Clock,
): Promise<PendingAuthorization> {
  let raw: string | null
  try {
    raw = await store.get(ATTEMPT_KEY)
    // Security invariant: one-time consumption happens before any callback success or failure branch.
    await store.remove(ATTEMPT_KEY)
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The authorization attempt could not be read securely.',
    )
  }
  let decoded: unknown
  try {
    decoded = raw ? JSON.parse(raw) : undefined
  } catch {
    decoded = undefined
  }
  if (!raw) {
    throw new SafeOAuthError(
      'callback_invalid',
      'No pending authorization attempt was found. Start a new authorization from the app.',
    )
  }
  const result = attemptSchema.safeParse(decoded)
  if (!result.success) {
    throw new SafeOAuthError(
      'callback_invalid',
      'The saved authorization attempt is invalid. Start a new authorization from the app.',
    )
  }
  if (result.data.expiresAt <= clock.now()) {
    throw new SafeOAuthError(
      'callback_invalid',
      'The authorization attempt expired. Start a new authorization and complete it within five minutes.',
    )
  }
  return result.data
}

/**
 * Call during app startup to discard saved authorization details that are
 * malformed or more than five minutes old. Their values are never returned.
 */
export async function discardAbandonedAuthorization(
  store: KeyValueStore,
  clock: Clock,
): Promise<void> {
  try {
    const raw = await store.get(ATTEMPT_KEY)
    if (!raw) return
    const parsed = attemptSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.expiresAt <= clock.now())
      await store.remove(ATTEMPT_KEY)
  } catch {
    await store.remove(ATTEMPT_KEY).catch(() => undefined)
  }
}
