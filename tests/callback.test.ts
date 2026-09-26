import {
  exchangeAuthorizationCode,
  validateCallback,
} from '../src/oauth/callback'
import { fakeAttempt } from './fakes'

const attempt = { ...fakeAttempt, createdAt: 1, expiresAt: 2 }

describe('native callback and public-client exchange', () => {
  it('accepts the exact redirect and matching state', () => {
    expect(
      validateCallback(
        `${fakeAttempt.redirectUri}?code=fake-code&state=${fakeAttempt.state}`,
        attempt,
      ),
    ).toBe('fake-code')
  })

  it.each([
    ['missing code', `${fakeAttempt.redirectUri}?state=${fakeAttempt.state}`],
    ['missing state', `${fakeAttempt.redirectUri}?code=fake-code`],
    [
      'mismatched state',
      `${fakeAttempt.redirectUri}?code=fake-code&state=wrong`,
    ],
    [
      'wrong scheme',
      `evil.example:/oauth/callback?code=fake-code&state=${fakeAttempt.state}`,
    ],
    [
      'wrong authority',
      `app.example.native://attacker/oauth/callback?code=fake-code&state=${fakeAttempt.state}`,
    ],
    [
      'wrong path',
      `app.example.native:/wrong?code=fake-code&state=${fakeAttempt.state}`,
    ],
    [
      'duplicate state',
      `${fakeAttempt.redirectUri}?code=fake-code&state=${fakeAttempt.state}&state=${fakeAttempt.state}`,
    ],
    [
      'code and error together',
      `${fakeAttempt.redirectUri}?code=fake-code&error=access_denied&state=${fakeAttempt.state}`,
    ],
  ])('rejects %s', (_name, url) => {
    expect(() => validateCallback(url, attempt)).toThrow(
      expect.objectContaining({ code: 'callback_invalid' }),
    )
  })

  it('treats denial as a safe user decision', () => {
    expect(() =>
      validateCallback(
        `${fakeAttempt.redirectUri}?error=access_denied&state=${fakeAttempt.state}`,
        attempt,
      ),
    ).toThrow(expect.objectContaining({ code: 'authorization_denied' }))
  })

  it('uses PKCE public-client exchange with no secret or Authorization header', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      Response.json({
        access_token: 'fake-access-token',
        expires_in: 3600,
        scope: 'me:read',
        token_type: 'Bearer',
      }),
    ) as jest.MockedFunction<typeof fetch>
    await expect(
      exchangeAuthorizationCode({
        clientId: 'fake-client',
        code: 'fake-code',
        codeVerifier: fakeAttempt.codeVerifier,
        redirectUri: fakeAttempt.redirectUri,
        tokenEndpoint: 'https://oauth.test/token',
        now: 1000,
        fetcher,
      }),
    ).resolves.toMatchObject({ expiresAt: 3_601_000, scope: 'me:read' })
    const init = fetcher.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
    expect(String(init?.body)).toContain('client_id=fake-client')
    expect(String(init?.body)).toContain('code_verifier=')
    expect(String(init?.body)).not.toMatch(/secret/i)
  })

  it('redacts malformed responses and network failures', async () => {
    for (const result of [
      Response.json({ access_token: 'fake-access-token' }),
      new Error('contains fake-access-token'),
    ]) {
      const fetcher = jest.fn()
      if (result instanceof Error) fetcher.mockRejectedValue(result)
      else fetcher.mockResolvedValue(result)
      await expect(
        exchangeAuthorizationCode({
          clientId: 'fake-client',
          code: 'fake-code',
          codeVerifier: fakeAttempt.codeVerifier,
          redirectUri: fakeAttempt.redirectUri,
          tokenEndpoint: 'https://oauth.test/token',
          now: 1,
          fetcher,
        }),
      ).rejects.toMatchObject({
        code: 'provider_failure',
        message: expect.not.stringContaining('fake-access-token'),
      })
    }
  })
})
