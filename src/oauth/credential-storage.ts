import { z } from 'zod'
import { SafeOAuthError } from './errors'
import type {
  Clock,
  CredentialState,
  KeyValueStore,
  StoredCredential,
} from './types'

const CREDENTIAL_KEY = 'lunch-money.native-oauth.credential.v1'
const credentialSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresAt: z.number().positive(),
    refreshToken: z.string().min(1).optional(),
    scope: z.string(),
    tokenType: z.literal('Bearer'),
  })
  .strict()
const credentialStateSchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('active'), credential: credentialSchema })
    .strict(),
  z.object({ status: z.literal('refreshing') }).strict(),
  z
    .object({
      status: z.literal('reauthorization_required'),
      reason: z.enum([
        'invalid_grant',
        'replacement_not_saved',
        'refresh_interrupted',
      ]),
    })
    .strict(),
])

async function writeState(
  store: KeyValueStore,
  state: CredentialState,
): Promise<void> {
  await store.set(CREDENTIAL_KEY, JSON.stringify(state))
}

async function readState(
  store: KeyValueStore,
): Promise<CredentialState | null> {
  let raw: string | null
  try {
    raw = await store.get(CREDENTIAL_KEY)
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The Lunch Money credential could not be read securely.',
    )
  }
  if (!raw) return null
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    decoded = undefined
  }
  const state = credentialStateSchema.safeParse(decoded)
  if (state.success) return state.data
  await store.remove(CREDENTIAL_KEY).catch(() => undefined)
  return null
}

/** Atomically replaces the complete credential after authorization or refresh. */
export async function saveCredential(
  store: KeyValueStore,
  credential: StoredCredential,
): Promise<void> {
  try {
    // Security invariant: access, rotated refresh token, expiry, and scope cross secure storage as one value.
    await writeState(store, { status: 'active', credential })
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The Lunch Money credential could not be saved securely.',
    )
  }
}

/** Loads an active credential for API, refresh, or revoke without exposing it to presentation state. */
export async function loadCredential(
  store: KeyValueStore,
  clock: Clock,
  options: { allowExpired?: boolean } = {},
): Promise<StoredCredential> {
  const state = await readState(store)
  if (!state)
    throw new SafeOAuthError(
      'credential_not_found',
      'Connect Lunch Money first.',
    )
  if (state.status !== 'active')
    throw new SafeOAuthError(
      'reauthorization_required',
      'Authorize Lunch Money again before continuing.',
    )
  if (!options.allowExpired && state.credential.expiresAt <= clock.now()) {
    if (!state.credential.refreshToken)
      await store.remove(CREDENTIAL_KEY).catch(() => undefined)
    throw new SafeOAuthError(
      'credential_expired',
      state.credential.refreshToken
        ? 'The access token expired. Refresh access before retrying.'
        : 'The access token expired. Authorize again.',
    )
  }
  return state.credential
}

/** Returns only non-sensitive lifecycle flags needed to render available actions. */
export async function readCredentialSummary(
  store: KeyValueStore,
): Promise<{ connected: boolean; refreshAvailable: boolean }> {
  const state = await readState(store)
  return {
    connected: state?.status === 'active',
    refreshAvailable:
      state?.status === 'active' && Boolean(state.credential.refreshToken),
  }
}

/** Returns only a terminal refresh reason; credential values remain inside the storage module. */
export async function readReauthorizationReason(
  store: KeyValueStore,
): Promise<'invalid_grant' | 'replacement_not_saved' | undefined> {
  const state = await readState(store)
  if (state?.status === 'refreshing') return 'replacement_not_saved'
  if (state?.status !== 'reauthorization_required') return undefined
  return state.reason === 'invalid_grant'
    ? 'invalid_grant'
    : 'replacement_not_saved'
}

/** Marks the stored token unusable before refresh so restart cannot replay a consumed token. */
export async function beginRefresh(store: KeyValueStore): Promise<void> {
  try {
    await writeState(store, { status: 'refreshing' })
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'Refresh could not begin because secure storage is unavailable.',
    )
  }
}

/** Records a terminal refresh state without retaining the unusable credential. */
export async function requireReauthorization(
  store: KeyValueStore,
  reason: Extract<
    CredentialState,
    { status: 'reauthorization_required' }
  >['reason'],
): Promise<void> {
  try {
    await writeState(store, { status: 'reauthorization_required', reason })
  } catch {
    await store.remove(CREDENTIAL_KEY).catch(() => undefined)
  }
}

/** Implements Local reset only; it removes device credentials and lifecycle markers without a network request. */
export async function clearLocalCredential(
  store: KeyValueStore,
): Promise<void> {
  try {
    // Security invariant: local reset is not represented as remote revocation.
    await store.remove(CREDENTIAL_KEY)
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The local credential could not be removed.',
    )
  }
}
