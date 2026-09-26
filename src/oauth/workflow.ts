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

/**
 * Connect these methods to the sample's screen actions and browser-return
 * handler. The workflow keeps tokens and saved authorization details out of
 * React state and returns only data the screen needs.
 */
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
    /**
     * Call when the user taps Connect. It finds Lunch Money's current OAuth
     * URLs, saves the values needed to verify the browser return, opens the
     * system browser, and finishes authorization when the user comes back.
     */
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

    /**
     * Call when the operating system delivers the browser redirect to the app.
     * It deletes the saved attempt before validating the redirect, requests
     * tokens only after validation succeeds, and stores them securely.
     */
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

    /**
     * Call when the user taps Call /v2/me. It loads the access token only for
     * the request and returns the validated profile, not the credential.
     */
    async readProfile(): Promise<LunchMoneyProfile> {
      const credential = await loadCredential(credentialStore, clock)
      return readLunchMoneyProfile(
        configuration.apiBaseUrl,
        credential.accessToken,
        fetcher,
      )
    },

    /**
     * Call after startup or authorization to decide which actions to show. It
     * returns connection and refresh availability without returning tokens.
     */
    async connectionStatus(): Promise<{
      connected: boolean
      refreshAvailable: boolean
    }> {
      return readCredentialSummary(credentialStore)
    },

    /**
     * Call when the user taps Refresh access token. It sends the refresh token
     * once and replaces the entire saved credential with Lunch Money's newly
     * returned values, or tells the screen that the user must connect again.
     */
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

    /**
     * Call when the user taps Revoke and verify. It asks Lunch Money to revoke
     * access and deletes the device credential only after the old access token
     * is confirmed unusable.
     */
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

    /**
     * Call when the user taps Local reset only. It clears this device without
     * telling Lunch Money to revoke the credential.
     */
    async resetLocal(): Promise<void> {
      await clearLocalCredential(credentialStore)
    },
  }
}
