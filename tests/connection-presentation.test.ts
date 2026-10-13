import {
  authorizationResultMessage,
  connectionStatusForDisplay,
  connectedStatusText,
  connectionLabel,
  profileFailureMessage,
} from '../src/scaffolding/connection-presentation'
import { SafeOAuthError } from '../src/oauth/errors'
import type { ConnectionStatus } from '../src/oauth'
import type { ConnectionSummary } from '../src/oauth/types'

const connection = (
  accountId: number,
  budgetName: string,
): ConnectionSummary => ({
  accountId,
  budgetName,
  lunchMoneyUserId: 7,
  lunchMoneyUserName: 'Demo User',
  active: accountId === 1,
  connected: true,
  refreshAvailable: false,
})

const status = (connections: ConnectionSummary[]): ConnectionStatus => ({
  activeAccountId: connections[0]?.accountId ?? null,
  activeLunchMoneyUserId: connections.length ? 7 : null,
  activeLunchMoneyUserName: connections.length ? 'Demo User' : null,
  connections,
  legacyCredentialDiscarded: false,
})

describe('connection presentation', () => {
  it('hides a stored identity without changing the stored connection status', () => {
    const stored = status([connection(1, 'Personal')])

    expect(connectionStatusForDisplay(stored, true)).toEqual({
      activeAccountId: null,
      activeLunchMoneyUserId: null,
      activeLunchMoneyUserName: null,
      connections: [],
      legacyCredentialDiscarded: false,
    })
    expect(connectionStatusForDisplay(stored, false)).toBe(stored)
    expect(stored.connections).toHaveLength(1)
  })

  it('uses the validated user name and singular/plural visible budget count', () => {
    expect(connectedStatusText(status([connection(1, 'Personal')]))).toBe(
      'Demo User is connected. 1 authorized budget.',
    )
    expect(
      connectedStatusText(
        status([connection(1, 'Personal'), connection(2, 'Shared')]),
      ),
    ).toBe('Demo User is connected. 2 authorized budgets.')
    expect(connectedStatusText(status([]))).toBeNull()
  })

  it('adds account IDs only when visible budget names collide', () => {
    const visible = [connection(1, 'Shared'), connection(2, 'Shared')]
    expect(connectionLabel(visible[0]!, visible)).toBe('Shared (#1)')
    expect(connectionLabel(visible[1]!, visible)).toBe('Shared (#2)')
    expect(connectionLabel(connection(3, 'Personal'), visible)).toBe('Personal')
  })

  it('suggests the explicit refresh action after /v2/me returns 401', () => {
    const error = new SafeOAuthError(
      'resource_failure',
      'Lunch Money rejected the /v2/me request.',
      undefined,
      { failureReason: 'http_error', httpStatus: 401 },
    )

    expect(profileFailureMessage(error, true)).toBe(
      'Lunch Money rejected /v2/me with HTTP 401. The access token may have expired. Use Refresh access token, then call /v2/me again.',
    )
    expect(profileFailureMessage(error, false)).toBe(
      'Lunch Money rejected /v2/me with HTTP 401. The access token may have expired. No refresh token is available for this connection. Authorize Lunch Money again.',
    )
  })

  it('keeps the existing safe message for /v2/me failures other than 401', () => {
    const error = new SafeOAuthError(
      'resource_failure',
      'Lunch Money /v2/me could not be reached.',
      undefined,
      { failureReason: 'network_error' },
    )

    expect(profileFailureMessage(error, true)).toBe(
      'Lunch Money /v2/me could not be reached.',
    )
  })

  it.each([
    [
      {
        outcome: 'connected_new_user' as const,
        budgetName: 'Personal',
        lunchMoneyUserName: 'Ada',
        visibleBudgetCount: 1,
      },
      'Connected Ada with Personal.',
    ],
    [
      {
        outcome: 'added_budget' as const,
        budgetName: 'Shared',
        lunchMoneyUserName: 'Ada',
        visibleBudgetCount: 2,
      },
      'Added Shared. Ada now has 2 authorized budgets.',
    ],
    [
      {
        outcome: 'reauthorized_budget' as const,
        budgetName: 'Personal',
        lunchMoneyUserName: 'Ada',
        visibleBudgetCount: 2,
      },
      'Updated the stored authorization for Personal.',
    ],
    [
      {
        outcome: 'switched_user' as const,
        budgetName: 'Business',
        lunchMoneyUserName: 'Grace',
        visibleBudgetCount: 1,
        previousLunchMoneyUserName: 'Ada',
      },
      'Switched to Grace. Ada’s budgets remain securely stored but hidden.',
    ],
    [
      {
        outcome: 'returned_user' as const,
        budgetName: 'Personal',
        lunchMoneyUserName: 'Ada',
        visibleBudgetCount: 2,
      },
      'Returned to Ada. Restored 2 previously authorized budgets from secure storage.',
    ],
  ])(
    'describes a validated authorization result without protocol details',
    (result, message) => {
      expect(authorizationResultMessage(result)).toBe(message)
    },
  )
})
