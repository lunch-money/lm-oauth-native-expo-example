import {
  clearLocalCredential,
  loadCredential,
  saveCredential,
} from '../src/oauth/credential-storage'
import { readLunchMoneyProfile } from '../src/oauth/lunch-money-api'
import { revokeAndVerify } from '../src/oauth/revocation'
import { MemoryStore, fakeClock } from './fakes'

const profile = {
  name: 'Demo User',
  email: 'user@example.test',
  id: 1,
  account_id: 2,
  budget_name: 'Demo',
  primary_currency: 'usd',
  api_key_label: null,
}

describe('credential, resource, revocation, and reset behavior', () => {
  it('validates the documented strict /v2/me schema and insufficient scope', async () => {
    await expect(
      readLunchMoneyProfile(
        new URL('https://api.test'),
        'fake-token',
        jest.fn().mockResolvedValue(Response.json(profile)),
      ),
    ).resolves.toEqual(profile)
    await expect(
      readLunchMoneyProfile(
        new URL('https://api.test'),
        'fake-token',
        jest.fn().mockResolvedValue(Response.json({ ...profile, extra: true })),
      ),
    ).rejects.toMatchObject({ code: 'resource_failure' })
    await expect(
      readLunchMoneyProfile(
        new URL('https://api.test'),
        'fake-token',
        jest.fn().mockResolvedValue(new Response(null, { status: 403 })),
      ),
    ).rejects.toMatchObject({ code: 'insufficient_scope' })
  })

  it('drops expired stored credentials', async () => {
    const store = new MemoryStore()
    const clock = fakeClock(2000)
    await saveCredential(store, {
      accessToken: 'fake-token',
      expiresAt: 1000,
      scope: 'me:read',
      tokenType: 'Bearer',
    })
    await expect(loadCredential(store, clock)).rejects.toMatchObject({
      code: 'credential_expired',
    })
    expect(store.values.size).toBe(0)
  })

  it('turns secure credential storage failures into redacted errors', async () => {
    const store = new MemoryStore()
    store.fail = true
    await expect(
      saveCredential(store, {
        accessToken: 'fake-token',
        expiresAt: 9999,
        scope: 'me:read',
        tokenType: 'Bearer',
      }),
    ).rejects.toMatchObject({
      code: 'storage_failed',
      message: expect.not.stringContaining('fake-token'),
    })
  })

  it('revokes as a public client and verifies 401', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 401 }),
      ) as jest.MockedFunction<typeof fetch>
    await revokeAndVerify({
      accessToken: 'fake-token',
      clientId: 'fake-client',
      meEndpoint: new URL('https://api.test/v2/me'),
      revocationEndpoint: 'https://oauth.test/revoke',
      fetcher,
    })
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('authorization'),
    ).toBe(false)
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain(
      'client_id=fake-client',
    )
  })

  it('revokes the refresh token when continuing access exists', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 401 }),
      ) as jest.MockedFunction<typeof fetch>
    await revokeAndVerify({
      accessToken: 'fake-access-token',
      clientId: 'fake-client',
      meEndpoint: new URL('https://api.test/v2/me'),
      refreshToken: 'fake-refresh-token',
      revocationEndpoint: 'https://oauth.test/revoke',
      fetcher,
    })
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain(
      'token=fake-refresh-token',
    )
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain(
      'token_type_hint=refresh_token',
    )
  })

  it('retains local credentials when revoke or verification is ambiguous', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, { status: 200 }),
      ) as jest.MockedFunction<typeof fetch>
    await expect(
      revokeAndVerify({
        accessToken: 'fake-token',
        clientId: 'fake-client',
        meEndpoint: new URL('https://api.test/v2/me'),
        revocationEndpoint: 'https://oauth.test/revoke',
        fetcher,
      }),
    ).rejects.toMatchObject({ code: 'revocation_failed' })
  })

  it('local reset performs no HTTP request', async () => {
    const store = new MemoryStore()
    const fetcher = jest.fn()
    await saveCredential(store, {
      accessToken: 'fake-token',
      expiresAt: 9999,
      scope: 'me:read',
      tokenType: 'Bearer',
    })
    await clearLocalCredential(store)
    expect(store.values.size).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
