import { SafeOAuthError } from './errors'

/**
 * Call from Disconnect active budget. Ask Lunch Money to revoke the credential, then
 * prove the old access token no longer works. Returns only after that proof;
 * otherwise it throws so the app can retain its local credential and retry.
 */
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
