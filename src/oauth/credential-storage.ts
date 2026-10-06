import { z } from 'zod'
import { SafeOAuthError } from './errors'
import type {
  Clock,
  AuthorizationResult,
  ConnectionSummary,
  CredentialState,
  KeyValueStore,
  LunchMoneyConnection,
  LunchMoneyProfile,
  StoredCredential,
} from './types'

const LEGACY_CREDENTIAL_KEY = 'lunch-money.native-oauth.credential.v1'
const LEGACY_CONNECTIONS_KEY = 'lunch-money.native-oauth.connections.v2'
const CONNECTIONS_KEY = 'lunch-money.native-oauth.connections.v3'

const credentialSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresAt: z.number().positive(),
    refreshToken: z.string().min(1).optional(),
    scope: z.string(),
    tokenType: z.literal('Bearer'),
  })
  .strict()
const credentialStateSchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('active'), credential: credentialSchema })
    .strict(),
  z.object({ status: z.literal('refreshing') }).strict(),
  z
    .object({
      status: z.literal('reauthorization_required'),
      reason: z.enum([
        'invalid_grant',
        'replacement_not_saved',
        'refresh_interrupted',
      ]),
    })
    .strict(),
])
const connectionSchema = z
  .object({
    accountId: z.number().int(),
    lunchMoneyUserId: z.number().int(),
    lunchMoneyUserName: z.string().min(1),
    budgetName: z.string(),
    credentialState: credentialStateSchema,
  })
  .strict()
const connectionsSchema = z
  .object({
    version: z.literal(3),
    activeAccountId: z.number().int().nullable(),
    activeLunchMoneyUserId: z.number().int().nullable(),
    connections: z.array(connectionSchema),
    legacyCredentialDiscarded: z.boolean(),
  })
  .strict()
  .superRefine((document, context) => {
    const connectionKeys = new Set<string>()
    for (const connection of document.connections) {
      const key = JSON.stringify([
        connection.lunchMoneyUserId,
        connection.accountId,
      ])
      if (connectionKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate Lunch Money user and account pair.',
        })
      }
      connectionKeys.add(key)
    }
    if (document.activeAccountId === null) return
    const active = document.connections.find(
      ({ accountId, lunchMoneyUserId }) =>
        accountId === document.activeAccountId &&
        lunchMoneyUserId === document.activeLunchMoneyUserId,
    )
    if (!active) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Active connection does not belong to the active user.',
      })
    }
  })

interface ConnectionsDocument {
  version: 3
  activeAccountId: number | null
  activeLunchMoneyUserId: number | null
  connections: LunchMoneyConnection[]
  legacyCredentialDiscarded: boolean
}

export interface ConnectionStatus {
  activeAccountId: number | null
  activeLunchMoneyUserId: number | null
  activeLunchMoneyUserName: string | null
  connections: ConnectionSummary[]
  legacyCredentialDiscarded: boolean
}

const emptyDocument = (): ConnectionsDocument => ({
  version: 3,
  activeAccountId: null,
  activeLunchMoneyUserId: null,
  connections: [],
  legacyCredentialDiscarded: false,
})

async function writeDocument(
  store: KeyValueStore,
  document: ConnectionsDocument,
): Promise<void> {
  await store.set(CONNECTIONS_KEY, JSON.stringify(document))
}

async function discardLegacyStorage(
  store: KeyValueStore,
): Promise<ConnectionsDocument | null> {
  const legacyKeys = [LEGACY_CREDENTIAL_KEY, LEGACY_CONNECTIONS_KEY]
  let found = false
  for (const key of legacyKeys) {
    if (await store.get(key).catch(() => null)) found = true
  }
  if (!found) return null
  for (const key of legacyKeys) {
    await store.remove(key).catch(() => undefined)
  }
  const migrated = { ...emptyDocument(), legacyCredentialDiscarded: true }
  await writeDocument(store, migrated).catch(() => undefined)
  return migrated
}

async function readDocument(
  store: KeyValueStore,
): Promise<ConnectionsDocument> {
  let raw: string | null
  try {
    raw = await store.get(CONNECTIONS_KEY)
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The Lunch Money credential could not be read securely.',
    )
  }
  if (!raw) return (await discardLegacyStorage(store)) ?? emptyDocument()

  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    decoded = undefined
  }
  const document = connectionsSchema.safeParse(decoded)
  if (document.success) return document.data
  await store.remove(CONNECTIONS_KEY).catch(() => undefined)
  return emptyDocument()
}

function activeConnection(document: ConnectionsDocument): LunchMoneyConnection {
  const connection = document.connections.find(
    ({ accountId, lunchMoneyUserId }) =>
      accountId === document.activeAccountId &&
      lunchMoneyUserId === document.activeLunchMoneyUserId,
  )
  if (!connection)
    throw new SafeOAuthError(
      'credential_not_found',
      'Connect Lunch Money first.',
    )
  return connection
}

/**
 * After authorization identifies the user and account with validated /v2/me,
 * atomically create or replace the complete connection, make its user active,
 * and reveal only that user's stored budgets.
 */
export async function upsertConnection(
  store: KeyValueStore,
  profile: LunchMoneyProfile,
  credential: StoredCredential,
): Promise<AuthorizationResult> {
  try {
    const document = await readDocument(store)
    const previousActive = document.connections.find(
      ({ accountId, lunchMoneyUserId }) =>
        accountId === document.activeAccountId &&
        lunchMoneyUserId === document.activeLunchMoneyUserId,
    )
    const matchingConnection = document.connections.find(
      ({ accountId, lunchMoneyUserId }) =>
        accountId === profile.account_id && lunchMoneyUserId === profile.id,
    )
    const knownUser = document.connections.some(
      ({ lunchMoneyUserId }) => lunchMoneyUserId === profile.id,
    )
    const outcome: AuthorizationResult['outcome'] =
      document.connections.length === 0
        ? 'connected_new_user'
        : document.activeLunchMoneyUserId !== profile.id
          ? knownUser
            ? 'returned_user'
            : 'switched_user'
          : matchingConnection
            ? 'reauthorized_budget'
            : 'added_budget'
    const replacement: LunchMoneyConnection = {
      accountId: profile.account_id,
      lunchMoneyUserId: profile.id,
      lunchMoneyUserName: profile.name,
      budgetName: profile.budget_name,
      credentialState: { status: 'active', credential },
    }
    // Security invariant: only validated /v2/me identity can change the active
    // user or create a user-and-account-keyed credential record.
    await writeDocument(store, {
      ...document,
      activeAccountId: replacement.accountId,
      activeLunchMoneyUserId: replacement.lunchMoneyUserId,
      legacyCredentialDiscarded: false,
      connections: [
        ...document.connections.filter(
          ({ accountId, lunchMoneyUserId }) =>
            accountId !== replacement.accountId ||
            lunchMoneyUserId !== replacement.lunchMoneyUserId,
        ),
        replacement,
      ],
    })
    const result = {
      budgetName: replacement.budgetName,
      lunchMoneyUserName: replacement.lunchMoneyUserName,
      visibleBudgetCount:
        document.connections.filter(
          ({ lunchMoneyUserId, accountId }) =>
            lunchMoneyUserId === replacement.lunchMoneyUserId &&
            accountId !== replacement.accountId,
        ).length + 1,
    }
    switch (outcome) {
      case 'switched_user':
        return {
          ...result,
          outcome,
          previousLunchMoneyUserName:
            previousActive?.lunchMoneyUserName ?? null,
        }
      case 'connected_new_user':
      case 'added_budget':
      case 'reauthorized_budget':
      case 'returned_user':
        return { ...result, outcome }
    }
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The Lunch Money credential could not be saved securely.',
    )
  }
}

/** Load only the active validated user's active-budget credential. */
export async function loadCredential(
  store: KeyValueStore,
  clock: Clock,
  options: { allowExpired?: boolean } = {},
): Promise<StoredCredential> {
  const document = await readDocument(store)
  const state = activeConnection(document).credentialState
  if (state.status !== 'active')
    throw new SafeOAuthError(
      'reauthorization_required',
      'Authorize Lunch Money again before continuing.',
    )
  if (!options.allowExpired && state.credential.expiresAt <= clock.now()) {
    if (!state.credential.refreshToken)
      await removeActiveConnection(store).catch(() => undefined)
    throw new SafeOAuthError(
      'credential_expired',
      state.credential.refreshToken
        ? 'The access token expired. Refresh access before retrying.'
        : 'The access token expired. Authorize again.',
    )
  }
  return state.credential
}

/** Return only summaries owned by the active validated Lunch Money user. */
export async function readConnectionSummary(
  store: KeyValueStore,
): Promise<ConnectionStatus> {
  const document = await readDocument(store)
  const visible = document.connections
    .filter(
      ({ lunchMoneyUserId }) =>
        lunchMoneyUserId === document.activeLunchMoneyUserId,
    )
    .sort((left, right) => left.accountId - right.accountId)
  const active = visible.find(
    ({ accountId }) => accountId === document.activeAccountId,
  )
  return {
    activeAccountId: active?.accountId ?? null,
    activeLunchMoneyUserId: document.activeLunchMoneyUserId,
    activeLunchMoneyUserName: active?.lunchMoneyUserName ?? null,
    legacyCredentialDiscarded: document.legacyCredentialDiscarded,
    connections: visible.map((connection) => ({
      accountId: connection.accountId,
      lunchMoneyUserId: connection.lunchMoneyUserId,
      lunchMoneyUserName: connection.lunchMoneyUserName,
      budgetName: connection.budgetName,
      active: connection.accountId === document.activeAccountId,
      connected: connection.credentialState.status === 'active',
      refreshAvailable:
        connection.credentialState.status === 'active' &&
        Boolean(connection.credentialState.credential.refreshToken),
    })),
  }
}

/** Select only a budget owned by the currently active validated user. */
export async function selectActiveConnection(
  store: KeyValueStore,
  accountId: number,
): Promise<void> {
  const document = await readDocument(store)
  if (
    !document.connections.some(
      (connection) =>
        connection.accountId === accountId &&
        connection.lunchMoneyUserId === document.activeLunchMoneyUserId,
    )
  )
    throw new SafeOAuthError(
      'credential_not_found',
      'That Lunch Money budget is not available for the active user.',
    )
  try {
    await writeDocument(store, { ...document, activeAccountId: accountId })
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The active Lunch Money budget could not be changed securely.',
    )
  }
}

export async function readReauthorizationReason(
  store: KeyValueStore,
): Promise<'invalid_grant' | 'replacement_not_saved' | undefined> {
  const state = activeConnection(await readDocument(store)).credentialState
  if (state.status === 'refreshing') return 'replacement_not_saved'
  if (state.status !== 'reauthorization_required') return undefined
  return state.reason === 'invalid_grant'
    ? 'invalid_grant'
    : 'replacement_not_saved'
}

export async function beginRefresh(store: KeyValueStore): Promise<void> {
  try {
    const document = await readDocument(store)
    const active = activeConnection(document)
    await writeDocument(store, {
      ...document,
      connections: document.connections.map((connection) =>
        connection.accountId === active.accountId &&
        connection.lunchMoneyUserId === active.lunchMoneyUserId
          ? { ...connection, credentialState: { status: 'refreshing' } }
          : connection,
      ),
    })
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'Refresh could not begin because secure storage is unavailable.',
    )
  }
}

export async function requireReauthorization(
  store: KeyValueStore,
  reason: Extract<
    CredentialState,
    { status: 'reauthorization_required' }
  >['reason'],
): Promise<void> {
  try {
    const document = await readDocument(store)
    const active = activeConnection(document)
    await writeDocument(store, {
      ...document,
      connections: document.connections.map((connection) =>
        connection.accountId === active.accountId &&
        connection.lunchMoneyUserId === active.lunchMoneyUserId
          ? {
              ...connection,
              credentialState: { status: 'reauthorization_required', reason },
            }
          : connection,
      ),
    })
  } catch {
    // A failed terminal-state write must not erase unrelated connections.
  }
}

export async function replaceActiveCredential(
  store: KeyValueStore,
  credential: StoredCredential,
): Promise<void> {
  const document = await readDocument(store)
  const active = activeConnection(document)
  await writeDocument(store, {
    ...document,
    connections: document.connections.map((connection) =>
      connection.accountId === active.accountId &&
      connection.lunchMoneyUserId === active.lunchMoneyUserId
        ? { ...connection, credentialState: { status: 'active', credential } }
        : connection,
    ),
  })
}

/**
 * Remove only the active connection. Fallback is limited to the same validated
 * user; removing that user's final budget exposes no other user's connection.
 */
export async function removeActiveConnection(
  store: KeyValueStore,
): Promise<void> {
  try {
    const document = await readDocument(store)
    const active = activeConnection(document)
    const connections = document.connections.filter(
      ({ accountId, lunchMoneyUserId }) =>
        accountId !== active.accountId ||
        lunchMoneyUserId !== active.lunchMoneyUserId,
    )
    const fallback = connections
      .filter(
        ({ lunchMoneyUserId }) =>
          lunchMoneyUserId === document.activeLunchMoneyUserId,
      )
      .sort((left, right) => left.accountId - right.accountId)[0]
    await writeDocument(store, {
      ...document,
      activeAccountId: fallback?.accountId ?? null,
      connections,
    })
  } catch {
    throw new SafeOAuthError(
      'storage_failed',
      'The local credential could not be removed.',
    )
  }
}
