import {
  safeErrorMessage,
  safeOAuthErrorDiagnostic,
  type AuthorizationResult,
  type ConnectionStatus,
} from '../oauth'
import type { ConnectionSummary } from '../oauth/types'

/**
 * Hide a previously stored identity while a new authorization is being
 * checked. The credential stays in secure storage, but showing its user and
 * budget beside a failure from the new authorization would be misleading.
 */
export function connectionStatusForDisplay(
  status: ConnectionStatus,
  hideStoredConnections: boolean,
): ConnectionStatus {
  if (!hideStoredConnections) return status
  return {
    activeAccountId: null,
    activeLunchMoneyUserId: null,
    activeLunchMoneyUserName: null,
    connections: [],
    legacyCredentialDiscarded: false,
  }
}

/** Show a connected user only after `/v2/me` has identified that connection. */
export function connectedStatusText(status: ConnectionStatus): string | null {
  if (
    !status.activeLunchMoneyUserName ||
    !status.connections.some(({ active, connected }) => active && connected)
  )
    return null
  const count = status.connections.length
  return `${status.activeLunchMoneyUserName} is connected. ${count} authorized ${count === 1 ? 'budget' : 'budgets'}.`
}

/**
 * Explain the locally derived credential state without implying that the app
 * has contacted Lunch Money. An unexpired token is immediately usable, not
 * guaranteed valid; the server may still have revoked it.
 */
export function connectionAvailabilityText(
  connection: ConnectionSummary,
): string {
  switch (connection.availability) {
    case 'ready':
      return 'Ready to call the API based on the locally stored expiration time. Server validity has not been checked.'
    case 'refresh_required':
      return 'The access token is expired. Refresh it before calling the API.'
    case 'reauthorization_required':
      return 'This stored connection cannot be used. Authorize Lunch Money again or forget the local credential.'
  }
}

/** Add an account ID only when two visible budgets have the same name. */
export function connectionLabel(
  connection: ConnectionSummary,
  visibleConnections: ConnectionSummary[],
): string {
  const duplicate =
    visibleConnections.filter(
      ({ budgetName }) => budgetName === connection.budgetName,
    ).length > 1
  return duplicate
    ? `${connection.budgetName} (#${connection.accountId})`
    : connection.budgetName
}

/**
 * Explain how to recover when the profile request's access token is rejected.
 * A 401 does not prove that the token merely expired, so the message suggests
 * the next safe action without claiming a cause. Other failures keep their
 * existing safe message.
 */
export function profileFailureMessage(
  error: unknown,
  refreshAvailable: boolean,
): string {
  if (safeOAuthErrorDiagnostic(error).httpStatus !== 401)
    return safeErrorMessage(error)

  const rejected =
    'Lunch Money rejected /v2/me with HTTP 401. The access token may have expired.'
  return refreshAvailable
    ? `${rejected} Use Refresh access token, then call /v2/me again.`
    : `${rejected} No refresh token is available for this connection. Authorize Lunch Money again.`
}

/** Describe the authorization result using names and counts safe for the screen. */
export function authorizationResultMessage(
  result: AuthorizationResult,
): string {
  switch (result.outcome) {
    case 'connected_new_user':
      return `Connected ${result.lunchMoneyUserName} with ${result.budgetName}.`
    case 'added_budget':
      return `Added ${result.budgetName}. ${result.lunchMoneyUserName} now has ${result.visibleBudgetCount} authorized budgets.`
    case 'reauthorized_budget':
      return `Updated the stored authorization for ${result.budgetName}.`
    case 'switched_user': {
      const hidden = result.previousLunchMoneyUserName
        ? `${result.previousLunchMoneyUserName}’s budgets remain securely stored but hidden.`
        : 'The previous user’s budgets remain securely stored but hidden.'
      return `Switched to ${result.lunchMoneyUserName}. ${hidden}`
    }
    case 'returned_user':
      return `Returned to ${result.lunchMoneyUserName}. Restored ${result.visibleBudgetCount} previously authorized ${result.visibleBudgetCount === 1 ? 'budget' : 'budgets'} from secure storage.`
  }
}
