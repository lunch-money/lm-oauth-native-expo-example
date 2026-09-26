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

/**
 * After authorization or refresh succeeds, save the complete replacement
 * credential in secure device storage as one value. Do not update its access
 * token, refresh token, expiry, or scope separately.
 */
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

/**
 * Load a credential only inside the action that calls the API, refreshes, or
 * revokes access. Returns an active credential or throws a UI-safe error; do
 * not copy the returned tokens into React or other presentation state.
 */
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

/**
 * Use this when rendering the screen. It returns only whether the app is
 * connected and whether refresh is available, never the stored tokens.
 */
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

/**
 * Before refreshing, check whether an earlier refresh left the credential
 * unusable. Returns only the reason the user must reconnect, never token data.
 */
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

/**
 * Immediately before sending a refresh token, mark the saved credential as
 * unusable. If the app stops mid-request, it must ask the user to reconnect
 * instead of sending that potentially consumed refresh token again.
 */
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

/**
 * When refresh cannot safely continue, discard the unusable credential and
 * remember only why the app must ask the user to connect again.
 */
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

/**
 * Use for the Local reset action. Removes credentials from this device without
 * contacting Lunch Money, so it does not revoke access remotely.
 */
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
