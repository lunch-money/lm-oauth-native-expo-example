import {
  loadCredential,
  readConnectionSummary,
  removeActiveConnection,
  selectActiveConnection,
  upsertConnection,
} from '../src/oauth/credential-storage'
import type { LunchMoneyProfile, StoredCredential } from '../src/oauth/types'
import { MemoryStore, fakeClock } from './fakes'

const credential = (accessToken: string): StoredCredential => ({
  accessToken,
  expiresAt: 1_900_000_000_000,
  scope: 'me:read',
  tokenType: 'Bearer',
})
const profile = (
  accountId: number,
  budgetName: string,
  lunchMoneyUserId = 7,
  lunchMoneyUserName = 'Demo User',
): LunchMoneyProfile => ({
  name: lunchMoneyUserName,
  email: 'user@example.test',
  id: lunchMoneyUserId,
  account_id: accountId,
  budget_name: budgetName,
  primary_currency: 'usd',
  api_key_label: null,
})

describe('secure multi-budget connection storage', () => {
  it('retains two budgets, activates the newest, and selects without OAuth', async () => {
    const store = new MemoryStore()
    await upsertConnection(store, profile(2, 'Household'), credential('a'))
    await upsertConnection(store, profile(3, 'Business'), credential('b'))

    const summary = await readConnectionSummary(store)
    expect(summary).toMatchObject({
      activeAccountId: 3,
      connections: [
        { accountId: 2, active: false },
        { accountId: 3, active: true },
      ],
    })
    expect(JSON.stringify(summary)).not.toContain('accessToken')
    expect(JSON.stringify(summary)).not.toContain('credentialState')
    await selectActiveConnection(store, 2)
    await expect(loadCredential(store, fakeClock())).resolves.toMatchObject({
      accessToken: 'a',
    })
  })

  it('reauthorizes an account in place and permits duplicate budget names', async () => {
    const store = new MemoryStore()
    await upsertConnection(store, profile(2, 'Shared'), credential('old'))
    await upsertConnection(store, profile(3, 'Shared'), credential('other'))
    await upsertConnection(store, profile(2, 'Shared'), credential('new'))

    const summary = await readConnectionSummary(store)
    expect(summary.connections).toHaveLength(2)
    expect(summary.activeAccountId).toBe(2)
    await expect(loadCredential(store, fakeClock())).resolves.toMatchObject({
      accessToken: 'new',
    })
  })

  it('retains other users securely while exposing only the active user', async () => {
    const store = new MemoryStore()
    await upsertConnection(
      store,
      profile(2, 'Personal', 7, 'User A'),
      credential('a'),
    )
    await upsertConnection(
      store,
      profile(3, 'Shared', 8, 'User B'),
      credential('b'),
    )

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeAccountId: 3,
      activeLunchMoneyUserId: 8,
      activeLunchMoneyUserName: 'User B',
      connections: [{ accountId: 3, lunchMoneyUserId: 8 }],
    })
    await expect(selectActiveConnection(store, 2)).rejects.toMatchObject({
      code: 'credential_not_found',
    })

    await upsertConnection(
      store,
      profile(2, 'Personal', 7, 'User A'),
      credential('a-new'),
    )
    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeLunchMoneyUserId: 7,
      connections: [{ accountId: 2, lunchMoneyUserId: 7 }],
    })
  })

  it('isolates two users who authorize the same shared account', async () => {
    const store = new MemoryStore()
    await upsertConnection(
      store,
      profile(2, 'Shared', 7, 'User A'),
      credential('user-a'),
    )
    await upsertConnection(
      store,
      profile(2, 'Shared', 8, 'User B'),
      credential('user-b'),
    )

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      connections: [{ accountId: 2, lunchMoneyUserId: 8 }],
    })
    await expect(loadCredential(store, fakeClock())).resolves.toMatchObject({
      accessToken: 'user-b',
    })

    await upsertConnection(
      store,
      profile(2, 'Shared', 7, 'User A'),
      credential('user-a-replacement'),
    )
    await expect(loadCredential(store, fakeClock())).resolves.toMatchObject({
      accessToken: 'user-a-replacement',
    })

    const raw = store.values.get('lunch-money.native-oauth.connections.v3')
    expect(raw).toBeDefined()
    const saved = JSON.parse(raw!) as {
      connections: Array<{
        accountId: number
        lunchMoneyUserId: number
        credentialState: { credential: { accessToken: string } }
      }>
    }
    expect(
      saved.connections.map(({ accountId, lunchMoneyUserId }) => [
        lunchMoneyUserId,
        accountId,
      ]),
    ).toEqual([
      [8, 2],
      [7, 2],
    ])
    expect(saved.connections[0]?.credentialState.credential.accessToken).toBe(
      'user-b',
    )
  })

  it('requires reauthorization rather than inventing an ID for v1 storage', async () => {
    const store = new MemoryStore()
    store.values.set(
      'lunch-money.native-oauth.credential.v1',
      JSON.stringify({ status: 'active', credential: credential('legacy') }),
    )

    await expect(readConnectionSummary(store)).resolves.toEqual({
      activeAccountId: null,
      activeLunchMoneyUserId: null,
      activeLunchMoneyUserName: null,
      connections: [],
      legacyCredentialDiscarded: true,
    })
    expect(store.values.has('lunch-money.native-oauth.credential.v1')).toBe(
      false,
    )
  })

  it('fails legacy marker persistence without restoring unidentified credentials', async () => {
    class MarkerFailureStore extends MemoryStore {
      override async set() {
        throw new Error('simulated marker failure')
      }
    }
    const store = new MarkerFailureStore()
    store.values.set(
      'lunch-money.native-oauth.credential.v1',
      JSON.stringify({ status: 'active', credential: credential('legacy') }),
    )

    await expect(readConnectionSummary(store)).resolves.toEqual({
      activeAccountId: null,
      activeLunchMoneyUserId: null,
      activeLunchMoneyUserName: null,
      connections: [],
      legacyCredentialDiscarded: true,
    })
    expect(store.values.has('lunch-money.native-oauth.credential.v1')).toBe(
      false,
    )
  })

  it('removes only the active connection and picks the lowest account ID', async () => {
    const store = new MemoryStore()
    await upsertConnection(store, profile(9, 'Nine'), credential('nine'))
    await upsertConnection(store, profile(4, 'Four'), credential('four'))
    await removeActiveConnection(store)

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeAccountId: 9,
      connections: [{ accountId: 9, active: true }],
    })
  })

  it('does not fall back to a hidden user after removing the active user’s last budget', async () => {
    const store = new MemoryStore()
    await upsertConnection(
      store,
      profile(2, 'User A budget', 7, 'User A'),
      credential('a'),
    )
    await upsertConnection(
      store,
      profile(3, 'User B budget', 8, 'User B'),
      credential('b'),
    )
    await removeActiveConnection(store)

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeAccountId: null,
      activeLunchMoneyUserId: 8,
      activeLunchMoneyUserName: null,
      connections: [],
    })
    await expect(selectActiveConnection(store, 2)).rejects.toMatchObject({
      code: 'credential_not_found',
    })
  })

  it('discards the unreleased v2 format that lacks validated user names', async () => {
    const store = new MemoryStore()
    store.values.set(
      'lunch-money.native-oauth.connections.v2',
      JSON.stringify({ version: 2, connections: [] }),
    )

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeAccountId: null,
      connections: [],
      legacyCredentialDiscarded: true,
    })
    expect(store.values.has('lunch-money.native-oauth.connections.v2')).toBe(
      false,
    )
  })

  it('removes a malformed v3 document without exposing a connection', async () => {
    const store = new MemoryStore()
    store.values.set('lunch-money.native-oauth.connections.v3', '{bad json')

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeAccountId: null,
      connections: [],
    })
    expect(store.values.has('lunch-money.native-oauth.connections.v3')).toBe(
      false,
    )
  })

  it('rejects duplicate user-and-account pairs in stored data', async () => {
    const store = new MemoryStore()
    await upsertConnection(store, profile(2, 'Shared'), credential('a'))
    const key = 'lunch-money.native-oauth.connections.v3'
    const saved = JSON.parse(store.values.get(key)!) as {
      connections: unknown[]
    }
    saved.connections.push(saved.connections[0])
    store.values.set(key, JSON.stringify(saved))

    await expect(readConnectionSummary(store)).resolves.toMatchObject({
      activeAccountId: null,
      connections: [],
    })
  })

  it('refuses to select an account that is not stored on the device', async () => {
    const store = new MemoryStore()
    await upsertConnection(store, profile(2, 'Household'), credential('a'))
    await expect(selectActiveConnection(store, 99)).rejects.toMatchObject({
      code: 'credential_not_found',
    })
  })
})
