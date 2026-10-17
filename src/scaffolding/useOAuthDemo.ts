import { useEffect, useMemo, useState } from 'react'
import * as Linking from 'expo-linking'
import {
  createNativeOAuthWorkflow,
  discardAbandonedAuthorization,
  safeErrorMessage,
  safeOAuthErrorDiagnostic,
  type ConnectionStatus,
  type LunchMoneyProfile,
} from '../oauth'
import { SafeOAuthError } from '../oauth/errors'
import {
  expoOAuthBrowser,
  expoTokenRefresher,
} from '../oauth/expo-auth-session'
import type { ConnectionSummary } from '../oauth/types'
import { loadPublicConfiguration } from './configuration'
import {
  authorizationResultMessage,
  connectionAvailabilityText,
  connectionStatusForDisplay,
  connectedStatusText,
  profileFailureMessage,
} from './connection-presentation'
import { secureStore } from './secure-store'

const clock = { now: () => Date.now() }
const emptyConnectionStatus: ConnectionStatus = {
  activeAccountId: null,
  activeLunchMoneyUserId: null,
  activeLunchMoneyUserName: null,
  connections: [],
  legacyCredentialDiscarded: false,
}

export interface OAuthDemoState {
  readonly activeConnection?: ConnectionSummary
  readonly budgetSelectorVisible: boolean
  readonly busy: boolean
  readonly connectionAvailability: string | null
  readonly connectedStatus: string | null
  readonly connections: ConnectionSummary[]
  readonly message: string
  readonly profile: LunchMoneyProfile | null
  readonly refreshAvailable: boolean
}

export interface OAuthDemoActions {
  readonly authorize: () => Promise<void>
  readonly closeBudgetSelector: () => void
  readonly forgetLocalCredential: () => Promise<void>
  readonly openBudgetSelector: () => void
  readonly readProfile: () => Promise<void>
  readonly refresh: () => Promise<void>
  readonly revoke: () => Promise<void>
  readonly selectConnection: (connection: ConnectionSummary) => Promise<void>
}

export interface OAuthDemoController {
  readonly actions: OAuthDemoActions
  readonly state: OAuthDemoState
}

/**
 * Connect the replaceable React Native screen to the OAuth teaching workflow.
 * Only safe connection summaries and allowlisted profile fields enter React
 * state; credentials and pending authorization material stay in SecureStore.
 */
export function useOAuthDemo(): OAuthDemoController {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Ready to connect.')
  const [profile, setProfile] = useState<LunchMoneyProfile | null>(null)
  const [budgetSelectorVisible, setBudgetSelectorVisible] = useState(false)
  const [hideStoredConnections, setHideStoredConnections] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    emptyConnectionStatus,
  )
  const workflow = useMemo(
    () =>
      createNativeOAuthWorkflow({
        browser: expoOAuthBrowser,
        clock,
        configuration: loadPublicConfiguration(),
        credentialStore: secureStore,
        attemptStore: secureStore,
        tokenRefresher: expoTokenRefresher,
      }),
    [],
  )

  useEffect(() => {
    let active = true
    const complete = async (url: string | null) => {
      if (!url || !url.startsWith('app.lunchmoney.nativeexpo:/oauth/callback'))
        return
      setBusy(true)
      setProfile(null)
      setBudgetSelectorVisible(false)
      setHideStoredConnections(true)
      setConnectionStatus(emptyConnectionStatus)
      try {
        const result = await workflow.completeCallback(url)
        if (active) {
          const status = await workflow.connectionStatus()
          setConnectionStatus(status)
          setHideStoredConnections(false)
          setMessage(authorizationResultMessage(result))
        }
      } catch (error) {
        if (active) {
          console.error(
            JSON.stringify({
              event: 'oauth.callback.failed',
              ...safeOAuthErrorDiagnostic(error),
            }),
          )
          setMessage(safeErrorMessage(error))
        }
      } finally {
        if (active) setBusy(false)
      }
    }
    void Linking.getInitialURL().then(complete)
    void discardAbandonedAuthorization(secureStore, clock)
    void workflow
      .connectionStatus()
      .then((status) => {
        if (active) {
          setConnectionStatus(status)
          if (status.legacyCredentialDiscarded)
            setMessage(
              'A credential saved by an older sample version could not be identified safely. Authorize Lunch Money again.',
            )
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [workflow])

  async function act<T>(
    action: () => Promise<T>,
    success: string | ((result: T) => string),
    failureEvent?: string,
    failureMessage?: (error: unknown) => string,
  ): Promise<void> {
    setBusy(true)
    setProfile(null)
    try {
      const result = await action()
      setMessage(typeof success === 'function' ? success(result) : success)
    } catch (error) {
      if (failureEvent)
        console.error(
          JSON.stringify({
            event: failureEvent,
            ...safeOAuthErrorDiagnostic(error),
          }),
        )
      setMessage(failureMessage?.(error) ?? safeErrorMessage(error))
    } finally {
      const status = await workflow
        .connectionStatus()
        .catch(() => emptyConnectionStatus)
      setConnectionStatus(status)
      setBusy(false)
    }
  }

  const displayedConnectionStatus = connectionStatusForDisplay(
    connectionStatus,
    hideStoredConnections,
  )
  const connections = displayedConnectionStatus.connections
  const activeConnection = connections.find(({ active }) => active)
  const refreshAvailable = Boolean(activeConnection?.refreshAvailable)

  const actions: OAuthDemoActions = {
    authorize: () =>
      act(
        async () => {
          setBudgetSelectorVisible(false)
          setHideStoredConnections(true)
          setConnectionStatus(emptyConnectionStatus)
          const result = await workflow.authorize()
          setHideStoredConnections(false)
          return result
        },
        authorizationResultMessage,
        'oauth.authorization.failed',
      ),
    closeBudgetSelector: () => setBudgetSelectorVisible(false),
    forgetLocalCredential: () =>
      act(
        () => workflow.resetLocal(),
        'Local credential removed. Remote Lunch Money authorization remains active.',
      ),
    openBudgetSelector: () => setBudgetSelectorVisible(true),
    readProfile: () =>
      act(
        async () => {
          setProfile(await workflow.readProfile())
        },
        'The validated /v2/me profile is shown below.',
        'oauth.me.failed',
        (error) => profileFailureMessage(error, refreshAvailable),
      ),
    refresh: () =>
      act(async () => {
        const result = await workflow.refresh()
        if (result.status === 'refreshed') return
        if (result.status === 'refresh_in_progress')
          throw new SafeOAuthError(
            'refresh_temporarily_unavailable',
            'Refresh is already in progress.',
          )
        if (result.status === 'refresh_not_available')
          throw new SafeOAuthError(
            'reauthorization_required',
            'This client has no refresh token. Authorize with offline_access to test refresh.',
          )
        throw new SafeOAuthError(
          'reauthorization_required',
          'Authorize Lunch Money again before continuing.',
        )
      }, 'Access and refresh tokens were rotated and stored securely.'),
    revoke: () =>
      act(
        () => workflow.revoke(),
        'The active budget was disconnected and its old token was rejected.',
      ),
    selectConnection: async (connection) => {
      setBudgetSelectorVisible(false)
      await act(
        () => workflow.selectConnection(connection.accountId),
        `${connection.budgetName} is now active.`,
      )
    },
  }

  return {
    actions,
    state: {
      activeConnection,
      budgetSelectorVisible,
      busy,
      connectionAvailability: activeConnection
        ? connectionAvailabilityText(activeConnection)
        : null,
      connectedStatus: connectedStatusText(displayedConnectionStatus),
      connections,
      message,
      profile,
      refreshAvailable,
    },
  }
}
