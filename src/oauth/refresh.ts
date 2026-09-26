import {
  beginRefresh,
  loadCredential,
  readReauthorizationReason,
  requireReauthorization,
  saveCredential,
} from './credential-storage'
import { RefreshProtocolError, SafeOAuthError } from './errors'
import type {
  Clock,
  KeyValueStore,
  StoredCredential,
  TokenRefresher,
} from './types'

export type RefreshResult =
  | { status: 'refreshed' }
  | { status: 'refresh_not_available' }
  | { status: 'refresh_in_progress' }
  | {
      status: 'reauthorization_required'
      reason: 'invalid_grant' | 'replacement_not_saved'
    }

export interface RefreshCoordinator {
  runExclusive<T>(
    operation: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }>
}

/** Coordinates refresh actions within this installed app process. */
export function createRefreshCoordinator(): RefreshCoordinator {
  let active = false
  return {
    async runExclusive<T>(operation: () => Promise<T>) {
      if (active) return { acquired: false }
      active = true
      try {
        return { acquired: true, value: await operation() }
      } finally {
        active = false
      }
    },
  }
}

async function restoreAfterTransientFailure(
  store: KeyValueStore,
  current: StoredCredential,
): Promise<never> {
  try {
    await saveCredential(store, current)
  } catch {
    await requireReauthorization(store, 'replacement_not_saved')
    throw new SafeOAuthError(
      'reauthorization_required',
      'Authorize Lunch Money again before continuing.',
    )
  }
  throw new SafeOAuthError(
    'refresh_temporarily_unavailable',
    'Lunch Money access could not be refreshed. Please try again later.',
  )
}

/**
 * Called by **Refresh access token**. Serializes refresh, durably blocks replay
 * before the request, and atomically stores the complete rotated credential.
 * Tokens remain inside the secure workflow; failures expose only stable results.
 */
export async function refreshCredential(input: {
  clientId: string
  clock: Clock
  coordinator: RefreshCoordinator
  store: KeyValueStore
  tokenEndpoint: string
  tokenRefresher: TokenRefresher
}): Promise<RefreshResult> {
  const coordinated = await input.coordinator.runExclusive(async () => {
    const terminalReason = await readReauthorizationReason(input.store)
    if (terminalReason)
      return {
        status: 'reauthorization_required',
        reason: terminalReason,
      } as const
    const current = await loadCredential(input.store, input.clock, {
      allowExpired: true,
    })
    if (!current.refreshToken)
      return { status: 'refresh_not_available' } as const

    // Security invariant: a restart after this write cannot replay the refresh token.
    await beginRefresh(input.store)
    let replacement: StoredCredential
    try {
      replacement = await input.tokenRefresher.refresh({
        clientId: input.clientId,
        refreshToken: current.refreshToken,
        tokenEndpoint: input.tokenEndpoint,
        now: input.clock.now(),
      })
    } catch (error) {
      if (
        error instanceof RefreshProtocolError &&
        (error.kind === 'invalid_grant' || error.kind === 'malformed_response')
      ) {
        await requireReauthorization(input.store, 'invalid_grant')
        return {
          status: 'reauthorization_required',
          reason: 'invalid_grant',
        } as const
      }
      return restoreAfterTransientFailure(input.store, current)
    }

    try {
      // Security invariant: SecureStore replaces access, rotated refresh, expiry, and scope together.
      await saveCredential(input.store, replacement)
      return { status: 'refreshed' } as const
    } catch {
      await requireReauthorization(input.store, 'replacement_not_saved')
      return {
        status: 'reauthorization_required',
        reason: 'replacement_not_saved',
      } as const
    }
  })
  return coordinated.acquired
    ? coordinated.value
    : { status: 'refresh_in_progress' }
}
