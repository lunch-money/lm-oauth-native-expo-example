import type { AuthorizationResult, ConnectionStatus } from '../oauth'
import type { ConnectionSummary } from '../oauth/types'

/** Format the connected identity only after validated /v2/me data is stored. */
export function connectedStatusText(status: ConnectionStatus): string | null {
  if (
    !status.activeLunchMoneyUserName ||
    !status.connections.some(({ active, connected }) => active && connected)
  )
    return null
  const count = status.connections.length
  return `${status.activeLunchMoneyUserName} is connected. ${count} authorized ${count === 1 ? 'budget' : 'budgets'}.`
}

/** Disambiguate only duplicate visible budget names with the provider account ID. */
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

/** Explain authorization identity changes without exposing protocol material. */
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
