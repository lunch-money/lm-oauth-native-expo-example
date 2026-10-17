import type { User } from '@lunch-money/lunch-money-js-v2'

export interface Clock {
  now(): number
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface OAuthConfiguration {
  allowLoopbackHttp?: boolean
  apiBaseUrl: URL
  clientId: string
  redirectUri: string
}

export interface AuthorizationServerMetadata {
  authorizationEndpoint: string
  tokenEndpoint: string
  revocationEndpoint: string
}

export interface PendingAuthorization {
  state: string
  codeVerifier: string
  redirectUri: string
  createdAt: number
  expiresAt: number
}

export interface PreparedAuthorization {
  authorizationUrl: string
  state: string
  codeVerifier: string
}

export interface StoredCredential {
  accessToken: string
  expiresAt: number
  refreshToken?: string
  scope: string
  tokenType: 'Bearer'
}

export interface LunchMoneyConnection {
  accountId: number
  lunchMoneyUserId: number
  lunchMoneyUserName: string
  budgetName: string
  credentialState: CredentialState
}

export interface ConnectionSummary {
  accountId: number
  lunchMoneyUserId: number
  lunchMoneyUserName: string
  budgetName: string
  active: boolean
  availability: ConnectionAvailability
  connected: boolean
  refreshAvailable: boolean
}

/**
 * A local assessment of whether a stored connection can make an API call.
 * This does not contact Lunch Money, so `ready` cannot prove that an
 * otherwise-unexpired token has not been revoked by the authorization server.
 */
export type ConnectionAvailability =
  'ready' | 'refresh_required' | 'reauthorization_required'

interface AuthorizationResultBase {
  budgetName: string
  lunchMoneyUserName: string
  visibleBudgetCount: number
}

export type AuthorizationResult =
  | (AuthorizationResultBase & { outcome: 'connected_new_user' })
  | (AuthorizationResultBase & { outcome: 'added_budget' })
  | (AuthorizationResultBase & { outcome: 'reauthorized_budget' })
  | (AuthorizationResultBase & {
      outcome: 'switched_user'
      previousLunchMoneyUserName: string | null
    })
  | (AuthorizationResultBase & { outcome: 'returned_user' })

export type CredentialState =
  | { status: 'active'; credential: StoredCredential }
  | { status: 'refreshing' }
  | {
      status: 'reauthorization_required'
      reason: 'invalid_grant' | 'replacement_not_saved' | 'refresh_interrupted'
    }

export interface TokenRefresher {
  refresh(input: {
    clientId: string
    refreshToken: string
    tokenEndpoint: string
    now: number
  }): Promise<StoredCredential>
}

export interface OAuthBrowser {
  prepare(input: {
    clientId: string
    redirectUri: string
    authorizationEndpoint: string
  }): Promise<PreparedAuthorization>
  open(authorizationUrl: string, redirectUri: string): Promise<string>
}

/** The documented user returned by the Lunch Money SDK for `GET /v2/me`. */
export type LunchMoneyProfile = User
