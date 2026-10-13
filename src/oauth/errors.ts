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

export interface SafeErrorDiagnostic {
  readonly failureReason?:
    'http_error' | 'invalid_json' | 'invalid_response' | 'network_error'
  readonly httpStatus?: number
}

/**
 * Describes a failure without putting a token, API response body, or user data
 * in the message shown by the app. `diagnostic` contains only fields that are
 * safe to include in a local development log.
 */
export class SafeOAuthError extends Error {
  constructor(
    public readonly code: SafeErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly diagnostic?: SafeErrorDiagnostic,
  ) {
    super(message)
    this.name = 'SafeOAuthError'
  }
}

/**
 * Build the small diagnostic object used by the sample's error logs. Unknown
 * errors receive a generic category because their messages may contain private
 * request or response data.
 */
export function safeOAuthErrorDiagnostic(
  error: unknown,
): Record<string, unknown> {
  if (!(error instanceof SafeOAuthError))
    return { errorCode: 'unexpected_error' }
  return {
    errorCode: error.code,
    ...(error.diagnostic?.failureReason
      ? { failureReason: error.diagnostic.failureReason }
      : {}),
    ...(error.diagnostic?.httpStatus === undefined
      ? {}
      : { httpStatus: error.diagnostic.httpStatus }),
  }
}

/**
 * Tells the refresh workflow whether the user must authorize again or may
 * retry later. It deliberately carries no response body or token value.
 */
export class RefreshProtocolError extends Error {
  constructor(
    public readonly kind: 'invalid_grant' | 'malformed_response' | 'transient',
  ) {
    super(kind)
    this.name = 'RefreshProtocolError'
  }
}

/**
 * Turn a caught failure into text the screen may display. Unknown exception
 * messages are replaced because network libraries can include private request
 * or response details in them.
 */
export function safeErrorMessage(error: unknown): string {
  // Security invariant: unknown exception text may contain callback or Lunch Money response data and is never displayed.
  return error instanceof SafeOAuthError
    ? error.message
    : 'Lunch Money OAuth could not complete. Please try again.'
}
