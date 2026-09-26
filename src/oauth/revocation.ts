import { SafeOAuthError } from './errors'

/** Called by Revoke and verify; revokes the access token as a public client, then requires the old token to fail. */
export async function revokeAndVerify(input: {
  accessToken: string
  clientId: string
  meEndpoint: URL
  revocationEndpoint: string
  refreshToken?: string
  fetcher?: typeof fetch
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch
  try {
    const response = await fetcher(input.revocationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: input.clientId,
        token: input.refreshToken ?? input.accessToken,
        token_type_hint: input.refreshToken ? 'refresh_token' : 'access_token',
      }).toString(),
    })
    if (!response.ok) throw new Error()
    const verification = await fetcher(input.meEndpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
    })
    // Security invariant: local deletion follows only after the old access token is demonstrably rejected.
    if (verification.status !== 401) throw new Error()
  } catch {
    throw new SafeOAuthError(
      'revocation_failed',
      'Revocation could not be verified; the local credential was retained.',
    )
  }
}
