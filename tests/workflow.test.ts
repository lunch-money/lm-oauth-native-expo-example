import { savePendingAuthorization } from '../src/oauth/authorization-attempt'
import { createNativeOAuthWorkflow } from '../src/oauth/workflow'
import { MemoryStore, fakeAttempt, fakeClock } from './fakes'

describe('native OAuth workflow callback coordination', () => {
  it('completes the same concurrently delivered callback only once', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    await savePendingAuthorization(store, clock, fakeAttempt)

    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetcher = jest.fn(async (_input: RequestInfo | URL) => {
      void _input
      await blocked
      return Response.json({
        access_token: 'fake-access-token',
        expires_in: 3600,
        refresh_token: 'fake-refresh-token',
        scope: 'me:read offline_access',
        token_type: 'Bearer',
      })
    })
    const workflow = createNativeOAuthWorkflow({
      attemptStore: store,
      browser: {
        prepare: jest.fn(),
        open: jest.fn(),
      },
      clock,
      configuration: {
        apiBaseUrl: new URL('https://api.test'),
        clientId: 'fake-client',
        redirectUri: fakeAttempt.redirectUri,
      },
      credentialStore: store,
      fetcher,
      tokenRefresher: { refresh: jest.fn() },
    })
    const callbackUrl = `${fakeAttempt.redirectUri}?code=fake-code&state=${fakeAttempt.state}`

    const first = workflow.completeCallback(
      callbackUrl,
      'https://oauth.test/token',
    )
    const duplicate = workflow.completeCallback(
      callbackUrl,
      'https://oauth.test/token',
    )
    release()

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      undefined,
      undefined,
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    await expect(workflow.connectionStatus()).resolves.toEqual({
      connected: true,
      refreshAvailable: true,
    })
  })
})
