import {
  DEFAULT_API_BASE_URL,
  discoverAuthorizationServer,
  parseConfiguration,
} from '../src/oauth/configuration'

describe('configuration and discovery', () => {
  it('loads metadata that supports S256 and public clients', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      Response.json({
        authorization_endpoint: 'https://oauth.test/authorize',
        token_endpoint: 'https://oauth.test/token',
        revocation_endpoint: 'https://oauth.test/revoke',
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      }),
    ) as jest.MockedFunction<typeof fetch>
    await expect(
      discoverAuthorizationServer(new URL('https://api.test'), fetcher),
    ).resolves.toEqual({
      authorizationEndpoint: 'https://oauth.test/authorize',
      tokenEndpoint: 'https://oauth.test/token',
      revocationEndpoint: 'https://oauth.test/revoke',
    })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://api.test/.well-known/oauth-authorization-server',
    )
  })

  it('accepts valid public configuration', () => {
    expect(
      parseConfiguration({
        apiBaseUrl: 'https://api.test',
        clientId: 'public-client',
        redirectUri: 'app.example.native:/oauth/callback',
      }).clientId,
    ).toBe('public-client')
  })

  it('defaults the API base URL to the Lunch Money production API', () => {
    expect(
      parseConfiguration({
        clientId: 'public-client',
        redirectUri: 'app.example.native:/oauth/callback',
      }).apiBaseUrl.toString(),
    ).toBe(`${DEFAULT_API_BASE_URL}/`)
  })

  it.each([
    [
      'client ID',
      { apiBaseUrl: 'https://api.test', redirectUri: 'app.example:/callback' },
      'The public OAuth client ID is missing.',
    ],
    [
      'malformed API base URL',
      {
        apiBaseUrl: '[https://api.test](https://api.test)',
        clientId: 'x',
        redirectUri: 'app.example:/callback',
      },
      'The Lunch Money API base URL must be an absolute HTTPS URL.',
    ],
    [
      'HTTP API base URL',
      {
        apiBaseUrl: 'http://api.test',
        clientId: 'x',
        redirectUri: 'app.example:/callback',
      },
      'The Lunch Money API base URL must use HTTPS.',
    ],
    [
      'redirect URI',
      { apiBaseUrl: 'https://api.test', clientId: 'x' },
      'The OAuth redirect URI is missing.',
    ],
    [
      'HTTPS redirect URI',
      {
        apiBaseUrl: 'https://api.test',
        clientId: 'x',
        redirectUri: 'https://example.test/callback',
      },
      'The OAuth redirect URI must use the registered native custom scheme, not HTTP or HTTPS.',
    ],
  ])(
    'reports the invalid %s without echoing its value',
    (_, input, message) => {
      expect(() => parseConfiguration(input)).toThrow(message)
    },
  )
})
