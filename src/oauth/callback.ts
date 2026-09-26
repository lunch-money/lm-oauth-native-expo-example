import { z } from 'zod'
import { SafeOAuthError } from './errors'
import type { PendingAuthorization, StoredCredential } from './types'

const tokenSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().positive(),
    refresh_token: z.string().min(1).optional(),
    scope: z.string(),
    token_type: z.literal('Bearer'),
  })
  .strict()

function sameRedirect(actual: URL, expected: URL): boolean {
  return (
    actual.protocol === expected.protocol &&
    actual.host === expected.host &&
    actual.pathname === expected.pathname
  )
}

/**
 * Add this to the handler that receives the browser redirect. Before requesting
 * tokens, verify that the returned URL and random state value match what the
 * app saved when the user tapped Connect. Returns the short-lived code only
 * when both checks pass; otherwise it throws a UI-safe error.
 */
export function validateCallback(
  callbackUrl: string,
  attempt: PendingAuthorization,
): string {
  let callback: URL
  let expected: URL
  try {
    callback = new URL(callbackUrl)
    expected = new URL(attempt.redirectUri)
  } catch {
    throw new SafeOAuthError(
      'callback_invalid',
      'The authorization callback is malformed.',
    )
  }
  // Security invariant: a callback for another scheme, authority, or path is never accepted.
  if (!sameRedirect(callback, expected))
    throw new SafeOAuthError(
      'callback_invalid',
      'The authorization callback used the wrong redirect URI.',
    )
  const states = callback.searchParams.getAll('state')
  const codes = callback.searchParams.getAll('code')
  const errors = callback.searchParams.getAll('error')
  if (
    states.length !== 1 ||
    codes.length > 1 ||
    errors.length > 1 ||
    (codes.length && errors.length)
  )
    throw new SafeOAuthError(
      'callback_invalid',
      'The authorization callback is malformed.',
    )
  if (states[0] !== attempt.state)
    throw new SafeOAuthError(
      'callback_invalid',
      'The authorization callback could not be verified.',
    )
  const error = errors[0]
  if (error === 'access_denied')
    throw new SafeOAuthError(
      'authorization_denied',
      'Authorization was denied.',
    )
  if (error)
    throw new SafeOAuthError(
      'provider_failure',
      'Lunch Money could not complete authorization.',
    )
  const code = codes[0]
  if (!code)
    throw new SafeOAuthError(
      'callback_invalid',
      'The authorization callback did not include a code.',
    )
  return code
}

/**
 * After validating the browser return, send its short-lived code and the saved
 * PKCE verifier to Lunch Money. Returns the credential that the caller must put
 * in secure device storage; codes, verifiers, tokens, and provider responses
 * are never included in thrown errors.
 */
export async function exchangeAuthorizationCode(input: {
  clientId: string
  code: string
  codeVerifier: string
  redirectUri: string
  tokenEndpoint: string
  now: number
  fetcher?: typeof fetch
}): Promise<StoredCredential> {
  const fetcher = input.fetcher ?? fetch
  try {
    const response = await fetcher(input.tokenEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
      }).toString(),
    })
    if (!response.ok) throw new Error()
    const token = tokenSchema.parse(await response.json())
    return {
      accessToken: token.access_token,
      expiresAt: input.now + token.expires_in * 1000,
      ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      scope: token.scope,
      tokenType: token.token_type,
    }
  } catch {
    // Security invariant: provider bodies, codes, verifiers, and raw token responses never enter the error.
    throw new SafeOAuthError(
      'provider_failure',
      'The authorization code could not be exchanged.',
    )
  }
}
