import type { Clock, KeyValueStore } from '../src/oauth/types'

export class MemoryStore implements KeyValueStore {
  values = new Map<string, string>()
  fail = false
  async get(key: string) {
    if (this.fail) throw new Error('secret failure')
    return this.values.get(key) ?? null
  }
  async set(key: string, value: string) {
    if (this.fail) throw new Error('secret failure')
    this.values.set(key, value)
  }
  async remove(key: string) {
    if (this.fail) throw new Error('secret failure')
    this.values.delete(key)
  }
}

export function fakeClock(
  now = 1_800_000_000_000,
): Clock & { advance(ms: number): void } {
  let value = now
  return {
    now: () => value,
    advance: (ms) => {
      value += ms
    },
  }
}

export const fakeAttempt = {
  state: 's'.repeat(43),
  codeVerifier: 'v'.repeat(64),
  redirectUri: 'app.example.native:/oauth/callback',
}
