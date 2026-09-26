import {
  ATTEMPT_LIFETIME_MS,
  consumePendingAuthorization,
  discardAbandonedAuthorization,
  savePendingAuthorization,
} from '../src/oauth/authorization-attempt'
import { MemoryStore, fakeAttempt, fakeClock } from './fakes'

describe('secure pending authorization lifecycle', () => {
  it('survives a process-style restart through the storage boundary and consumes once', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    await savePendingAuthorization(store, clock, fakeAttempt)
    await expect(
      consumePendingAuthorization(store, clock),
    ).resolves.toMatchObject(fakeAttempt)
    await expect(
      consumePendingAuthorization(store, clock),
    ).rejects.toMatchObject({ code: 'callback_invalid' })
  })

  it('rejects and removes an expired attempt', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    await savePendingAuthorization(store, clock, fakeAttempt)
    clock.advance(ATTEMPT_LIFETIME_MS)
    await expect(
      consumePendingAuthorization(store, clock),
    ).rejects.toMatchObject({ code: 'callback_invalid' })
    expect(store.values.size).toBe(0)
  })

  it('cleans malformed or abandoned attempts and reports secure-storage failures safely', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    store.values.set(
      'lunch-money.native-oauth.pending-authorization.v1',
      '{bad',
    )
    await discardAbandonedAuthorization(store, clock)
    expect(store.values.size).toBe(0)
    store.fail = true
    await expect(
      savePendingAuthorization(store, clock, fakeAttempt),
    ).rejects.toMatchObject({ code: 'storage_failed' })
  })
})
