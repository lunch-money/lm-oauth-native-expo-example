import {
  consumePendingAuthorization,
  savePendingAuthorization,
} from './authorization-attempt'
import { exchangeAuthorizationCode, validateCallback } from './callback'
import {
  clearLocalCredential,
  loadCredential,
  readCredentialSummary,
  saveCredential,
} from './credential-storage'
import { discoverAuthorizationServer } from './configuration'
import { SafeOAuthError } from './errors'
import { readLunchMoneyProfile } from './lunch-money-api'
import {
  createRefreshCoordinator,
  refreshCredential,
  type RefreshResult,
} from './refresh'
import { revokeAndVerify } from './revocation'
import type {
  Clock,
  KeyValueStore,
  LunchMoneyProfile,
  OAuthBrowser,
  OAuthConfiguration,
  TokenRefresher,
} from './types'

let activeCallback:
  { callbackUrl: string; completion: Promise<void> } | undefined

function completeCallbackOnce(
  callbackUrl: string,
  complete: () => Promise<void>,
): Promise<void> {
  if (activeCallback) {
    if (activeCallback.callbackUrl === callbackUrl)
      return activeCallback.completion
    return Promise.reject(
      new SafeOAuthError(
        'callback_invalid',
        'Another authorization callback is already being handled.',
      ),
    )
  }

  const completion = complete().finally(() => {
    if (activeCallback?.completion === completion) activeCallback = undefined
  })
  activeCallback = { callbackUrl, completion }
  return completion
}

/** Coordinates screen actions while keeping credentials and pending authorization data out of React state. */
export function createNativeOAuthWorkflow(dependencies: {
  browser: OAuthBrowser
  clock: Clock
  configuration: OAuthConfiguration
  credentialStore: KeyValueStore
  attemptStore: KeyValueStore
  tokenRefresher: TokenRefresher
  fetcher?: typeof fetch
}) {
  const { browser, clock, configuration, credentialStore, attemptStore } =
    dependencies
  const fetcher = dependencies.fetcher ?? fetch
  const refreshCoordinator = createRefreshCoordinator()

  return {
    /** Called by Connect; discovers endpoints, saves state/PKCE, opens the system browser, and completes its callback. */
    async authorize(): Promise<void> {
      const metadata = await discoverAuthorizationServer(
        configuration.apiBaseUrl,
        fetcher,
      )
      const prepared = await browser.prepare({
        clientId: configuration.clientId,
        redirectUri: configuration.redirectUri,
        authorizationEndpoint: metadata.authorizationEndpoint,
      })
      await savePendingAuthorization(attemptStore, clock, {
        state: prepared.state,
        codeVerifier: prepared.codeVerifier,
        redirectUri: configuration.redirectUri,
      })
      let callbackUrl: string
      try {
        callbackUrl = await browser.open(
          prepared.authorizationUrl,
          configuration.redirectUri,
        )
      } catch (error) {
        await consumePendingAuthorization(attemptStore, clock).catch(
          () => undefined,
        )
        throw error
      }
      await this.completeCallback(callbackUrl, metadata.tokenEndpoint)
    },

    /** Called by the browser return or app deep-link lifecycle; consumes the attempt even when validation fails. */
    async completeCallback(
      callbackUrl: string,
      knownTokenEndpoint?: string,
    ): Promise<void> {
      return completeCallbackOnce(callbackUrl, async () => {
        const attempt = await consumePendingAuthorization(attemptStore, clock)
        const code = validateCallback(callbackUrl, attempt)
        const tokenEndpoint =
          knownTokenEndpoint ??
          (await discoverAuthorizationServer(configuration.apiBaseUrl, fetcher))
            .tokenEndpoint
        const credential = await exchangeAuthorizationCode({
          clientId: configuration.clientId,
          code,
          codeVerifier: attempt.codeVerifier,
          redirectUri: attempt.redirectUri,
          tokenEndpoint,
          now: clock.now(),
          fetcher,
        })
        await saveCredential(credentialStore, credential)
      })
    },

    /** Called by Call /v2/me; the token is loaded inside the action and only the validated profile is returned. */
    async readProfile(): Promise<LunchMoneyProfile> {
      const credential = await loadCredential(credentialStore, clock)
      return readLunchMoneyProfile(
        configuration.apiBaseUrl,
        credential.accessToken,
        fetcher,
      )
    },

    /** Returns non-sensitive flags used to show connection and refresh actions after startup or authorization. */
    async connectionStatus(): Promise<{
      connected: boolean
      refreshAvailable: boolean
    }> {
      return readCredentialSummary(credentialStore)
    },

    /** Called by Refresh access token; rotates and atomically replaces the secure credential as a public client. */
    async refresh(): Promise<RefreshResult> {
      const metadata = await discoverAuthorizationServer(
        configuration.apiBaseUrl,
        fetcher,
      )
      return refreshCredential({
        clientId: configuration.clientId,
        clock,
        coordinator: refreshCoordinator,
        store: credentialStore,
        tokenEndpoint: metadata.tokenEndpoint,
        tokenRefresher: dependencies.tokenRefresher,
      })
    },

    /** Called by Revoke and verify; retains local data on ambiguity and deletes it only after a confirmed 401. */
    async revoke(): Promise<void> {
      const credential = await loadCredential(credentialStore, clock)
      const metadata = await discoverAuthorizationServer(
        configuration.apiBaseUrl,
        fetcher,
      )
      await revokeAndVerify({
        accessToken: credential.accessToken,
        clientId: configuration.clientId,
        meEndpoint: new URL('/v2/me', configuration.apiBaseUrl),
        revocationEndpoint: metadata.revocationEndpoint,
        ...(credential.refreshToken
          ? { refreshToken: credential.refreshToken }
          : {}),
        fetcher,
      })
      await clearLocalCredential(credentialStore)
    },

    /** Called by Local reset only; proves device cleanup is a separate operation from remote revocation. */
    async resetLocal(): Promise<void> {
      await clearLocalCredential(credentialStore)
    },
  }
}
