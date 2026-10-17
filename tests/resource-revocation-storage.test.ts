import {
  loadCredential,
  readConnectionSummary,
  removeActiveConnection,
  upsertConnection,
} from '../src/oauth/credential-storage'
import { safeOAuthErrorDiagnostic } from '../src/oauth/errors'
import { readLunchMoneyProfile } from '../src/oauth/lunch-money-api'
import { revokeAndVerify } from '../src/oauth/revocation'
import type { LunchMoneyProfile } from '../src/oauth/types'
import { MemoryStore, fakeClock } from './fakes'

const profile: LunchMoneyProfile = {
  name: 'Demo User',
  email: 'user@example.test',
  id: 1,
  account_id: 2,
  budget_name: 'Demo',
  primary_currency: 'usd',
  api_key_label: null,
}

describe('credential, resource, revocation, and reset behavior', () => {
  it('uses the SDK to call /v2/me and returns additive response properties', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(Response.json({ ...profile, added_later: true }))

    await expect(
      readLunchMoneyProfile(new URL('https://api.test'), 'fake-token', fetcher),
    ).resolves.toEqual({ ...profile, added_later: true })

    const request = fetcher.mock.lastCall?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) throw new Error('Expected SDK request.')
    expect(request.url).toBe('https://api.test/v2/me')
    expect(request.headers.get('authorization')).toBe('Bearer fake-token')
  })

  it.each(Object.keys(profile))(
    'rejects a /v2/me response missing required property %s',
    async (missingField) => {
      const incomplete = Object.fromEntries(
        Object.entries(profile).filter(([field]) => field !== missingField),
      )
      await expect(
        readLunchMoneyProfile(
          new URL('https://api.test'),
          'fake-token',
          jest.fn().mockResolvedValue(Response.json(incomplete)),
        ),
      ).rejects.toMatchObject({
        code: 'resource_failure',
        diagnostic: {
          failureReason: 'invalid_response',
          httpStatus: 200,
        },
      })
    },
  )

  it('classifies HTTP failures without exposing the response body or token', async () => {
    const response = new Response('private upstream details', { status: 401 })
    let failure: unknown
    try {
      await readLunchMoneyProfile(
        new URL('https://api.test'),
        'private-token',
        jest.fn().mockResolvedValue(response),
      )
    } catch (error) {
      failure = error
    }

    expect(failure).toMatchObject({
      code: 'resource_failure',
      diagnostic: { failureReason: 'http_error', httpStatus: 401 },
    })
    const diagnostic = JSON.stringify(safeOAuthErrorDiagnostic(failure))
    expect(diagnostic).toBe(
      JSON.stringify({
        errorCode: 'resource_failure',
        failureReason: 'http_error',
        httpStatus: 401,
      }),
    )
    expect(diagnostic).not.toContain('private-token')
    expect(diagnostic).not.toContain('private upstream details')
  })

  it('reports missing me:read as a safe HTTP failure', async () => {
    await expect(
      readLunchMoneyProfile(
        new URL('https://api.test'),
        'fake-token',
        jest.fn().mockResolvedValue(new Response(null, { status: 403 })),
      ),
    ).rejects.toMatchObject({
      code: 'insufficient_scope',
      diagnostic: { failureReason: 'http_error', httpStatus: 403 },
    })
  })

  it('distinguishes invalid JSON from a request that never received a response', async () => {
    await expect(
      readLunchMoneyProfile(
        new URL('https://api.test'),
        'fake-token',
        jest.fn().mockResolvedValue(new Response('not json')),
      ),
    ).rejects.toMatchObject({
      diagnostic: { failureReason: 'invalid_json', httpStatus: 200 },
    })
    await expect(
      readLunchMoneyProfile(
        new URL('https://api.test'),
        'fake-token',
        jest.fn().mockRejectedValue(new Error('private network detail')),
      ),
    ).rejects.toMatchObject({
      diagnostic: { failureReason: 'network_error' },
    })
  })

  it('drops expired stored credentials', async () => {
    const store = new MemoryStore()
    const clock = fakeClock(2000)
    await upsertConnection(store, profile, {
      accessToken: 'fake-token',
      expiresAt: 1000,
      scope: 'me:read',
      tokenType: 'Bearer',
    })
    await expect(loadCredential(store, clock)).rejects.toMatchObject({
      code: 'credential_expired',
    })
    await expect(
      readConnectionSummary(store, fakeClock()),
    ).resolves.toMatchObject({
      activeAccountId: null,
      connections: [],
    })
  })

  it('turns secure credential storage failures into redacted errors', async () => {
    const store = new MemoryStore()
    store.fail = true
    await expect(
      upsertConnection(store, profile, {
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
    await upsertConnection(store, profile, {
      accessToken: 'fake-token',
      expiresAt: 9999,
      scope: 'me:read',
      tokenType: 'Bearer',
    })
    await removeActiveConnection(store)
    await expect(
      readConnectionSummary(store, fakeClock()),
    ).resolves.toMatchObject({
      activeAccountId: null,
      connections: [],
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
