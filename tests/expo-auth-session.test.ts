const mockMakeAuthUrlAsync = jest.fn()
const mockAuthRequest = jest.fn()
const mockRefreshRequest = jest.fn()
const mockPerformRefresh = jest.fn()
const fakeGeneratedState = '12345678-1234-4234-8234-123456789abc'

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => fakeGeneratedState),
}))

jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn().mockImplementation((input: unknown) => {
    mockAuthRequest(input)
    return {
      codeVerifier: 'v'.repeat(64),
      state: 's'.repeat(43),
      makeAuthUrlAsync: mockMakeAuthUrlAsync,
    }
  }),
  RefreshTokenRequest: jest.fn().mockImplementation((input: unknown) => {
    mockRefreshRequest(input)
    return { performAsync: mockPerformRefresh }
  }),
  ResponseType: { Code: 'code' },
  TokenError: class TokenError extends Error {},
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}))

import {
  expoOAuthBrowser,
  expoTokenRefresher,
} from '../src/oauth/expo-auth-session'

describe('expo-auth-session adapter', () => {
  it('prepares code flow with S256 PKCE and no authorization scope', async () => {
    mockMakeAuthUrlAsync.mockResolvedValue(
      'https://oauth.test/authorize?response_type=code&code_challenge=fake&code_challenge_method=S256',
    )
    await expect(
      expoOAuthBrowser.prepare({
        clientId: 'fake-client',
        redirectUri: 'app.example.native:/oauth/callback',
        authorizationEndpoint: 'https://oauth.test/authorize',
      }),
    ).resolves.toMatchObject({
      state: 's'.repeat(43),
      codeVerifier: 'v'.repeat(64),
    })
    expect(mockAuthRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        responseType: 'code',
        state: fakeGeneratedState,
        usePKCE: true,
      }),
    )
    expect(mockAuthRequest.mock.calls[0]?.[0]).not.toHaveProperty('scopes')
    expect(mockMakeAuthUrlAsync).toHaveBeenCalledWith({
      authorizationEndpoint: 'https://oauth.test/authorize',
    })
  })

  it('refreshes as a public client and requires a complete rotated response', async () => {
    mockPerformRefresh.mockResolvedValue({
      accessToken: 'new-access-token',
      expiresIn: 3600,
      refreshToken: 'new-refresh-token',
      scope: 'me:read offline_access',
      tokenType: 'bearer',
    })
    await expect(
      expoTokenRefresher.refresh({
        clientId: 'fake-client',
        refreshToken: 'old-refresh-token',
        tokenEndpoint: 'https://oauth.test/token',
        now: 1000,
      }),
    ).resolves.toEqual({
      accessToken: 'new-access-token',
      expiresAt: 3_601_000,
      refreshToken: 'new-refresh-token',
      scope: 'me:read offline_access',
      tokenType: 'Bearer',
    })
    expect(mockRefreshRequest).toHaveBeenCalledWith({
      clientId: 'fake-client',
      refreshToken: 'old-refresh-token',
    })
    expect(mockRefreshRequest.mock.calls[0]?.[0]).not.toHaveProperty(
      'clientSecret',
    )
  })

  it('rejects a refresh response without a rotated refresh token', async () => {
    mockPerformRefresh.mockResolvedValue({
      accessToken: 'new-access-token',
      expiresIn: 3600,
      scope: 'me:read offline_access',
      tokenType: 'bearer',
    })
    await expect(
      expoTokenRefresher.refresh({
        clientId: 'fake-client',
        refreshToken: 'old-refresh-token',
        tokenEndpoint: 'https://oauth.test/token',
        now: 1000,
      }),
    ).rejects.toMatchObject({ kind: 'malformed_response' })
  })
})
