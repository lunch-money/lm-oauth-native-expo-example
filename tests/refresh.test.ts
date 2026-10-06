import {
  beginRefresh,
  loadCredential,
  readConnectionSummary,
  selectActiveConnection,
  upsertConnection,
} from '../src/oauth/credential-storage'
import { RefreshProtocolError } from '../src/oauth/errors'
import {
  createRefreshCoordinator,
  refreshCredential,
} from '../src/oauth/refresh'
import type { StoredCredential, TokenRefresher } from '../src/oauth/types'
import { MemoryStore, fakeClock } from './fakes'

const current: StoredCredential = {
  accessToken: 'old-access-token',
  expiresAt: 1_800_000_100_000,
  refreshToken: 'old-refresh-token',
  scope: 'me:read offline_access',
  tokenType: 'Bearer',
}
const replacement: StoredCredential = {
  accessToken: 'new-access-token',
  expiresAt: 1_800_003_600_000,
  refreshToken: 'new-refresh-token',
  scope: 'me:read offline_access',
  tokenType: 'Bearer',
}
const profile = {
  name: 'Demo User',
  email: 'user@example.test',
  id: 1,
  account_id: 2,
  budget_name: 'Demo',
  primary_currency: 'usd',
  api_key_label: null,
}
const saveCredential = (store: MemoryStore, credential: StoredCredential) =>
  upsertConnection(store, profile, credential)

function setup(refresher: TokenRefresher, store = new MemoryStore()) {
  const clock = fakeClock()
  const run = () =>
    refreshCredential({
      clientId: 'fake-public-client',
      clock,
      coordinator: createRefreshCoordinator(),
      store,
      tokenEndpoint: 'https://oauth.test/token',
      tokenRefresher: refresher,
    })
  return { clock, run, store }
}

describe('native refresh rotation', () => {
  it('atomically replaces the complete rotated credential set', async () => {
    const refresher = { refresh: jest.fn().mockResolvedValue(replacement) }
    const { clock, run, store } = setup(refresher)
    await saveCredential(store, current)
    await expect(run()).resolves.toEqual({ status: 'refreshed' })
    await expect(
      loadCredential(store, clock, { allowExpired: true }),
    ).resolves.toEqual(replacement)
    expect(refresher.refresh).toHaveBeenCalledWith({
      clientId: 'fake-public-client',
      refreshToken: 'old-refresh-token',
      tokenEndpoint: 'https://oauth.test/token',
      now: clock.now(),
    })
  })

  it('reports refresh unavailable for an access-only registration', async () => {
    const refresher = { refresh: jest.fn() }
    const { run, store } = setup(refresher)
    await saveCredential(store, { ...current, refreshToken: undefined })
    await expect(run()).resolves.toEqual({ status: 'refresh_not_available' })
    expect(refresher.refresh).not.toHaveBeenCalled()
  })

  it.each(['invalid_grant', 'malformed_response'] as const)(
    'requires reauthorization after %s and never retries the old token',
    async (kind) => {
      const refresher = {
        refresh: jest.fn().mockRejectedValue(new RefreshProtocolError(kind)),
      }
      const { run, store } = setup(refresher)
      await saveCredential(store, current)
      await expect(run()).resolves.toEqual({
        status: 'reauthorization_required',
        reason: 'invalid_grant',
      })
      await expect(run()).resolves.toEqual({
        status: 'reauthorization_required',
        reason: 'invalid_grant',
      })
      expect(refresher.refresh).toHaveBeenCalledTimes(1)
    },
  )

  it('restores the current set after a transient failure', async () => {
    const refresher = {
      refresh: jest
        .fn()
        .mockRejectedValue(new RefreshProtocolError('transient')),
    }
    const { clock, run, store } = setup(refresher)
    await saveCredential(store, current)
    await expect(run()).rejects.toMatchObject({
      code: 'refresh_temporarily_unavailable',
    })
    await expect(
      loadCredential(store, clock, { allowExpired: true }),
    ).resolves.toEqual(current)
  })

  it('persists a terminal marker before the request so restart cannot replay', async () => {
    const refresher = { refresh: jest.fn() }
    const { run, store } = setup(refresher)
    await saveCredential(store, current)
    await beginRefresh(store)
    await expect(run()).resolves.toEqual({
      status: 'reauthorization_required',
      reason: 'replacement_not_saved',
    })
    expect(refresher.refresh).not.toHaveBeenCalled()
  })

  it('requires reauthorization if rotated credentials cannot be saved', async () => {
    class ReplacementFailureStore extends MemoryStore {
      override async set(key: string, value: string) {
        if (value.includes('new-refresh-token'))
          throw new Error('simulated secure-store failure')
        await super.set(key, value)
      }
    }
    const refresher = { refresh: jest.fn().mockResolvedValue(replacement) }
    const { run, store } = setup(refresher, new ReplacementFailureStore())
    await saveCredential(store, current)
    await expect(run()).resolves.toEqual({
      status: 'reauthorization_required',
      reason: 'replacement_not_saved',
    })
    await expect(run()).resolves.toEqual({
      status: 'reauthorization_required',
      reason: 'replacement_not_saved',
    })
    expect(refresher.refresh).toHaveBeenCalledTimes(1)
  })

  it('rejects a concurrent refresh in the same app process', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const refresher = {
      refresh: jest.fn(async () => {
        await blocked
        return replacement
      }),
    }
    const store = new MemoryStore()
    const clock = fakeClock()
    const coordinator = createRefreshCoordinator()
    const input = {
      clientId: 'fake-public-client',
      clock,
      coordinator,
      store,
      tokenEndpoint: 'https://oauth.test/token',
      tokenRefresher: refresher,
    }
    await saveCredential(store, current)
    const first = refreshCredential(input)
    await Promise.resolve()
    await expect(refreshCredential(input)).resolves.toEqual({
      status: 'refresh_in_progress',
    })
    release()
    await expect(first).resolves.toEqual({ status: 'refreshed' })
  })

  it('isolates terminal refresh failure to the active account', async () => {
    const refresher = {
      refresh: jest
        .fn()
        .mockRejectedValue(new RefreshProtocolError('invalid_grant')),
    }
    const { run, store } = setup(refresher)
    await upsertConnection(
      store,
      { ...profile, account_id: 10, budget_name: 'First' },
      { ...current, accessToken: 'first-access-token' },
    )
    await upsertConnection(
      store,
      { ...profile, account_id: 20, budget_name: 'Second' },
      { ...current, accessToken: 'second-access-token' },
    )

    await expect(run()).resolves.toEqual({
      status: 'reauthorization_required',
      reason: 'invalid_grant',
    })
    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      connections: [
        { accountId: 10, connected: true },
        { accountId: 20, connected: false },
      ],
    })
    await selectActiveConnection(store, 10)
    await expect(loadCredential(store, fakeClock())).resolves.toMatchObject({
      accessToken: 'first-access-token',
    })
  })

  it('isolates an interrupted refresh marker to the active account', async () => {
    const store = new MemoryStore()
    await upsertConnection(
      store,
      { ...profile, account_id: 10, budget_name: 'First' },
      { ...current, accessToken: 'first-access-token' },
    )
    await upsertConnection(
      store,
      { ...profile, account_id: 20, budget_name: 'Second' },
      { ...current, accessToken: 'second-access-token' },
    )
    await beginRefresh(store)

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      connections: [
        { accountId: 10, connected: true },
        { accountId: 20, connected: false },
      ],
    })
    await selectActiveConnection(store, 10)
    await expect(loadCredential(store, fakeClock())).resolves.toMatchObject({
      accessToken: 'first-access-token',
    })
  })
})
