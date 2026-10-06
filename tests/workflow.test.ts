import { savePendingAuthorization } from '../src/oauth/authorization-attempt'
import { upsertConnection } from '../src/oauth/credential-storage'
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
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v2/me'))
        return Response.json({
          name: 'Demo User',
          email: 'user@example.test',
          id: 10,
          account_id: 20,
          budget_name: 'Household',
          primary_currency: 'usd',
          api_key_label: null,
        })
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

    const expectedResult = {
      outcome: 'connected_new_user',
      budgetName: 'Household',
      lunchMoneyUserName: 'Demo User',
      visibleBudgetCount: 1,
    }
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      expectedResult,
      expectedResult,
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    await expect(workflow.connectionStatus()).resolves.toEqual({
      activeAccountId: 20,
      activeLunchMoneyUserId: 10,
      activeLunchMoneyUserName: 'Demo User',
      legacyCredentialDiscarded: false,
      connections: [
        {
          accountId: 20,
          active: true,
          budgetName: 'Household',
          connected: true,
          lunchMoneyUserId: 10,
          lunchMoneyUserName: 'Demo User',
          refreshAvailable: true,
        },
      ],
    })
  })

  it('returns a validated identity result from the direct browser flow', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    const callbackUrl = `${fakeAttempt.redirectUri}?code=fake-code&state=${fakeAttempt.state}`
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/.well-known/oauth-authorization-server'))
        return Response.json({
          authorization_endpoint: 'https://oauth.test/authorize',
          token_endpoint: 'https://oauth.test/token',
          revocation_endpoint: 'https://oauth.test/revoke',
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        })
      if (url.endsWith('/v2/me'))
        return Response.json({
          name: 'Demo User',
          email: 'user@example.test',
          id: 10,
          account_id: 20,
          budget_name: 'Household',
          primary_currency: 'usd',
          api_key_label: null,
        })
      return Response.json({
        access_token: 'fake-access-token',
        expires_in: 3600,
        scope: 'me:read',
        token_type: 'Bearer',
      })
    })
    const workflow = createNativeOAuthWorkflow({
      attemptStore: store,
      browser: {
        prepare: jest.fn().mockResolvedValue({
          authorizationUrl:
            'https://oauth.test/authorize?client_id=fake-client',
          codeVerifier: fakeAttempt.codeVerifier,
          state: fakeAttempt.state,
        }),
        open: jest.fn().mockResolvedValue(callbackUrl),
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

    await expect(workflow.authorize()).resolves.toEqual({
      outcome: 'connected_new_user',
      budgetName: 'Household',
      lunchMoneyUserName: 'Demo User',
      visibleBudgetCount: 1,
    })
  })

  it('does not persist credentials when /v2/me cannot identify the account', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    await savePendingAuthorization(store, clock, fakeAttempt)
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'unidentified-access-token',
          expires_in: 3600,
          scope: 'me:read',
          token_type: 'Bearer',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ account_id: 20, budget_name: 'Incomplete' }),
      )
    const workflow = createNativeOAuthWorkflow({
      attemptStore: store,
      browser: { prepare: jest.fn(), open: jest.fn() },
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

    await expect(
      workflow.completeCallback(
        `${fakeAttempt.redirectUri}?code=fake-code&state=${fakeAttempt.state}`,
        'https://oauth.test/token',
      ),
    ).rejects.toMatchObject({ code: 'resource_failure' })
    await expect(workflow.connectionStatus()).resolves.toMatchObject({
      activeAccountId: null,
      connections: [],
    })
  })

  it('reveals only the newly authorized user and restores a prior user on reauthorization', async () => {
    const store = new MemoryStore()
    const clock = fakeClock()
    const tokenResponses = [
      'first-access-token',
      'second-access-token',
      'third-access-token',
      'replacement-access-token',
      'second-replacement-access-token',
    ]
    const profiles = [
      { id: 1, name: 'User A', account_id: 10, budget_name: 'A1' },
      { id: 1, name: 'User A', account_id: 20, budget_name: 'A2' },
      { id: 2, name: 'User B', account_id: 30, budget_name: 'B1' },
      { id: 1, name: 'User A', account_id: 10, budget_name: 'A1' },
      { id: 1, name: 'User A', account_id: 10, budget_name: 'A1' },
    ]
    let authorization = 0
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v2/me')) {
        const selected = profiles[authorization]
        authorization += 1
        return Response.json({
          email: 'user@example.test',
          ...selected,
          primary_currency: 'usd',
          api_key_label: null,
        })
      }
      return Response.json({
        access_token: tokenResponses[authorization],
        expires_in: 3600,
        scope: 'me:read',
        token_type: 'Bearer',
      })
    })
    const workflow = createNativeOAuthWorkflow({
      attemptStore: store,
      browser: { prepare: jest.fn(), open: jest.fn() },
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

    const initialResults = []
    for (const suffix of ['one', 'two']) {
      const attempt = {
        ...fakeAttempt,
        state: `${suffix}${'s'.repeat(43)}`,
      }
      await savePendingAuthorization(store, clock, attempt)
      initialResults.push(
        await workflow.completeCallback(
          `${attempt.redirectUri}?code=${suffix}&state=${attempt.state}`,
          'https://oauth.test/token',
        ),
      )
    }
    expect(initialResults.map(({ outcome }) => outcome)).toEqual([
      'connected_new_user',
      'added_budget',
    ])

    await expect(workflow.connectionStatus()).resolves.toMatchObject({
      activeLunchMoneyUserId: 1,
      activeLunchMoneyUserName: 'User A',
      connections: [
        { accountId: 10, budgetName: 'A1' },
        { accountId: 20, budgetName: 'A2' },
      ],
    })

    const userBAttempt = { ...fakeAttempt, state: `three${'s'.repeat(43)}` }
    await savePendingAuthorization(store, clock, userBAttempt)
    await expect(
      workflow.completeCallback(
        `${userBAttempt.redirectUri}?code=three&state=${userBAttempt.state}`,
        'https://oauth.test/token',
      ),
    ).resolves.toMatchObject({
      outcome: 'switched_user',
      previousLunchMoneyUserName: 'User A',
    })
    await expect(workflow.connectionStatus()).resolves.toMatchObject({
      activeLunchMoneyUserId: 2,
      activeLunchMoneyUserName: 'User B',
      connections: [{ accountId: 30, budgetName: 'B1' }],
    })
    await expect(workflow.selectConnection(10)).rejects.toMatchObject({
      code: 'credential_not_found',
    })

    const userAAgain = { ...fakeAttempt, state: `four${'s'.repeat(43)}` }
    await savePendingAuthorization(store, clock, userAAgain)
    await expect(
      workflow.completeCallback(
        `${userAAgain.redirectUri}?code=four&state=${userAAgain.state}`,
        'https://oauth.test/token',
      ),
    ).resolves.toMatchObject({
      outcome: 'returned_user',
      visibleBudgetCount: 2,
    })

    const userAReplacement = {
      ...fakeAttempt,
      state: `five${'s'.repeat(43)}`,
    }
    await savePendingAuthorization(store, clock, userAReplacement)
    await expect(
      workflow.completeCallback(
        `${userAReplacement.redirectUri}?code=five&state=${userAReplacement.state}`,
        'https://oauth.test/token',
      ),
    ).resolves.toMatchObject({ outcome: 'reauthorized_budget' })

    await expect(workflow.connectionStatus()).resolves.toMatchObject({
      activeAccountId: 10,
      activeLunchMoneyUserId: 1,
      activeLunchMoneyUserName: 'User A',
      connections: [
        {
          accountId: 10,
          budgetName: 'A1',
          lunchMoneyUserId: 1,
        },
        {
          accountId: 20,
          budgetName: 'A2',
          lunchMoneyUserId: 1,
        },
      ],
    })
  })

  it.each(['reset', 'revoke'] as const)(
    '%s does not fall back to another Lunch Money user',
    async (operation) => {
      const store = new MemoryStore()
      const clock = fakeClock()
      const connection = (lunchMoneyUserId: number, accessToken: string) =>
        upsertConnection(
          store,
          {
            name: `User ${lunchMoneyUserId}`,
            email: 'user@example.test',
            id: lunchMoneyUserId,
            account_id: 10,
            budget_name: 'Shared budget',
            primary_currency: 'usd',
            api_key_label: null,
          },
          {
            accessToken,
            expiresAt: clock.now() + 60_000,
            scope: 'me:read',
            tokenType: 'Bearer',
          },
        )
      await connection(10, 'first-access-token')
      await connection(20, 'second-access-token')
      const fetcher = jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/.well-known/oauth-authorization-server'))
          return Response.json({
            authorization_endpoint: 'https://oauth.test/authorize',
            token_endpoint: 'https://oauth.test/token',
            revocation_endpoint: 'https://oauth.test/revoke',
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
          })
        if (url.endsWith('/v2/me')) return new Response(null, { status: 401 })
        return new Response(null, { status: 200 })
      })
      const workflow = createNativeOAuthWorkflow({
        attemptStore: store,
        browser: { prepare: jest.fn(), open: jest.fn() },
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

      if (operation === 'revoke') await workflow.revoke()
      else await workflow.resetLocal()

      await expect(workflow.connectionStatus()).resolves.toMatchObject({
        activeAccountId: null,
        activeLunchMoneyUserId: 20,
        connections: [],
      })
      const saved = JSON.parse(
        store.values.get('lunch-money.native-oauth.connections.v3')!,
      ) as { connections: Array<{ lunchMoneyUserId: number }> }
      expect(saved.connections).toEqual([
        expect.objectContaining({ lunchMoneyUserId: 10 }),
      ])
      if (operation === 'reset') expect(fetcher).not.toHaveBeenCalled()
    },
  )
})
