import { z } from 'zod'
import { SafeOAuthError } from './errors'
import type { AuthorizationServerMetadata, OAuthConfiguration } from './types'

export const DEFAULT_API_BASE_URL = 'https://api.lunchmoney.dev'

const metadataSchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  revocation_endpoint: z.string().url(),
  code_challenge_methods_supported: z
    .array(z.string())
    .refine((v) => v.includes('S256')),
  token_endpoint_auth_methods_supported: z
    .array(z.string())
    .refine((v) => v.includes('none')),
})

/**
 * Call at startup with the registered client ID and redirect URI. Returns the
 * public settings used by the OAuth workflow and rejects missing or unsafe
 * values. A native app must never add a client secret here.
 */
export function parseConfiguration(input: {
  apiBaseUrl?: string
  clientId?: string
  redirectUri?: string
}): OAuthConfiguration {
  if (!input.clientId?.trim())
    throw configurationError('The public OAuth client ID is missing.')
  if (!input.redirectUri)
    throw configurationError('The OAuth redirect URI is missing.')

  let apiBaseUrl: URL
  try {
    apiBaseUrl = new URL(input.apiBaseUrl?.trim() || DEFAULT_API_BASE_URL)
  } catch {
    throw configurationError(
      'The Lunch Money API base URL must be an absolute HTTPS URL.',
    )
  }
  if (apiBaseUrl.protocol !== 'https:')
    throw configurationError('The Lunch Money API base URL must use HTTPS.')

  let redirect: URL
  try {
    redirect = new URL(input.redirectUri)
  } catch {
    throw configurationError('The OAuth redirect URI is not a valid URL.')
  }
  if (redirect.protocol === 'http:' || redirect.protocol === 'https:')
    throw configurationError(
      'The OAuth redirect URI must use the registered native custom scheme, not HTTP or HTTPS.',
    )

  return {
    apiBaseUrl,
    clientId: input.clientId,
    redirectUri: redirect.toString(),
  }
}

function configurationError(message: string): SafeOAuthError {
  return new SafeOAuthError('configuration_invalid', message)
}

/**
 * Ask Lunch Money which URLs the app should use for sign-in, token requests,
 * and revocation. Call this before opening the browser instead of hard-coding
 * those URLs. Returns only validated HTTPS endpoints and throws a UI-safe error.
 */
export async function discoverAuthorizationServer(
  apiBaseUrl: URL,
  fetcher: typeof fetch = fetch,
): Promise<AuthorizationServerMetadata> {
  try {
    const url = new URL('/.well-known/oauth-authorization-server', apiBaseUrl)
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error()
    const parsed = metadataSchema.parse(await response.json())
    for (const endpoint of [
      parsed.authorization_endpoint,
      parsed.token_endpoint,
      parsed.revocation_endpoint,
    ]) {
      if (new URL(endpoint).protocol !== 'https:') throw new Error()
    }
    return {
      authorizationEndpoint: parsed.authorization_endpoint,
      tokenEndpoint: parsed.token_endpoint,
      revocationEndpoint: parsed.revocation_endpoint,
    }
  } catch {
    throw new SafeOAuthError(
      'discovery_failed',
      'Lunch Money OAuth configuration could not be loaded.',
    )
  }
}
