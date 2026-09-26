export type SafeErrorCode =
  | 'authorization_cancelled'
  | 'authorization_denied'
  | 'callback_invalid'
  | 'configuration_invalid'
  | 'credential_expired'
  | 'credential_not_found'
  | 'discovery_failed'
  | 'insufficient_scope'
  | 'provider_failure'
  | 'refresh_temporarily_unavailable'
  | 'reauthorization_required'
  | 'resource_failure'
  | 'revocation_failed'
  | 'storage_failed'

/** A stable UI-safe failure that never includes provider bodies or credentials. */
export class SafeOAuthError extends Error {
  constructor(
    public readonly code: SafeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SafeOAuthError'
  }
}

/** Internal refresh classification; provider details and token values remain private. */
export class RefreshProtocolError extends Error {
  constructor(
    public readonly kind: 'invalid_grant' | 'malformed_response' | 'transient',
  ) {
    super(kind)
    this.name = 'RefreshProtocolError'
  }
}

/** Called whenever scaffolding must display an unknown failure without leaking its contents. */
export function safeErrorMessage(error: unknown): string {
  // Security invariant: unknown exception text may contain callback or provider data and is never displayed.
  return error instanceof SafeOAuthError
    ? error.message
    : 'Lunch Money OAuth could not complete. Please try again.'
}
