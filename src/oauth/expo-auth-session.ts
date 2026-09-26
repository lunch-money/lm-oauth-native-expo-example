import * as AuthSession from 'expo-auth-session'
import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import { RefreshProtocolError, SafeOAuthError } from './errors'
import type {
  OAuthBrowser,
  PreparedAuthorization,
  TokenRefresher,
} from './types'

WebBrowser.maybeCompleteAuthSession()

/** Expo adapter used when the Connect action prepares PKCE and opens the platform authentication browser. */
export const expoOAuthBrowser: OAuthBrowser = {
  async prepare(input): Promise<PreparedAuthorization> {
    const request = new AuthSession.AuthRequest({
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      responseType: AuthSession.ResponseType.Code,
      // Expo's default is only 10 characters. Supply a stronger value that also
      // satisfies the persisted-attempt validation used across app restarts.
      state: Crypto.randomUUID(),
      usePKCE: true,
      // Lunch Money applies the client's immutable registered scopes. Do not add `scopes`.
    })
    const authorizationUrl = await request.makeAuthUrlAsync({
      authorizationEndpoint: input.authorizationEndpoint,
    })
    if (!request.state || !request.codeVerifier) {
      throw new SafeOAuthError(
        'provider_failure',
        'A secure authorization request could not be prepared.',
      )
    }
    // Security invariant: expo-auth-session generates unpredictable state and an S256 PKCE verifier/challenge.
    return {
      authorizationUrl,
      state: request.state,
      codeVerifier: request.codeVerifier,
    }
  },
  async open(authorizationUrl, redirectUri): Promise<string> {
    const result = await WebBrowser.openAuthSessionAsync(
      authorizationUrl,
      redirectUri,
    )
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new SafeOAuthError(
        'authorization_cancelled',
        'Authorization was cancelled.',
      )
    }
    if (result.type !== 'success' || !result.url) {
      throw new SafeOAuthError(
        'provider_failure',
        'Authorization did not return to the application.',
      )
    }
    return result.url
  },
}

/** Expo adapter used by Refresh access; it requires Lunch Money to return a rotated refresh token. */
export const expoTokenRefresher: TokenRefresher = {
  async refresh(input) {
    try {
      const request = new AuthSession.RefreshTokenRequest({
        clientId: input.clientId,
        refreshToken: input.refreshToken,
      })
      const response = await request.performAsync({
        tokenEndpoint: input.tokenEndpoint,
      })
      if (
        !response.accessToken ||
        !response.refreshToken ||
        typeof response.expiresIn !== 'number' ||
        response.expiresIn <= 0 ||
        typeof response.scope !== 'string' ||
        response.tokenType.toLowerCase() !== 'bearer'
      ) {
        throw new RefreshProtocolError('malformed_response')
      }
      // Security invariant: never use TokenResponse.refreshAsync because it silently reuses a missing rotated token.
      return {
        accessToken: response.accessToken,
        expiresAt: input.now + response.expiresIn * 1000,
        refreshToken: response.refreshToken,
        scope: response.scope,
        tokenType: 'Bearer',
      }
    } catch (error) {
      if (error instanceof RefreshProtocolError) throw error
      if (
        error instanceof AuthSession.TokenError &&
        error.code === 'invalid_grant'
      )
        throw new RefreshProtocolError('invalid_grant')
      throw new RefreshProtocolError('transient')
    }
  },
}
