import {
  LunchMoneyClient,
  LunchMoneyError,
  type User,
} from '@lunch-money/lunch-money-js-v2'
import { SafeOAuthError } from './errors'
import type { LunchMoneyProfile } from './types'

const requiredProfileFields = [
  'name',
  'email',
  'id',
  'account_id',
  'budget_name',
  'primary_currency',
  'api_key_label',
] as const satisfies readonly (keyof User)[]

function hasRequiredProfileFields(body: User): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    requiredProfileFields.every((field) => body[field] !== undefined)
  )
}

function sdkBaseUrl(apiBaseUrl: URL): string {
  return new URL('/v2', apiBaseUrl).href.replace(/\/$/, '')
}

/**
 * Call after authorization or when the user taps Call /v2/me. The official
 * SDK adds the access token to this request and parses the response. This app
 * still checks that every property it needs to identify and display the user
 * is present because generated TypeScript types do not validate data at run
 * time. The token, response body, and user data never enter displayed errors
 * or diagnostic logs.
 */
export async function readLunchMoneyProfile(
  apiBaseUrl: URL,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<LunchMoneyProfile> {
  let response: Response | undefined
  const client = new LunchMoneyClient({
    apiKey: accessToken,
    baseUrl: sdkBaseUrl(apiBaseUrl),
    fetch: async (request) => {
      response = await fetcher(request)
      return response
    },
  })
  let profile: User
  try {
    profile = await client.user.getMe()
  } catch (cause) {
    if (cause instanceof LunchMoneyError) {
      if (cause.status === 403)
        throw new SafeOAuthError(
          'insufficient_scope',
          'The registered client needs the me:read scope.',
          cause,
          { failureReason: 'http_error', httpStatus: cause.status },
        )
      throw new SafeOAuthError(
        'resource_failure',
        'Lunch Money rejected the /v2/me request.',
        cause,
        {
          failureReason: 'http_error',
          ...(cause.status === undefined ? {} : { httpStatus: cause.status }),
        },
      )
    }
    if (response)
      throw new SafeOAuthError(
        'resource_failure',
        'Lunch Money /v2/me returned an invalid response.',
        cause,
        { failureReason: 'invalid_json', httpStatus: response.status },
      )
    throw new SafeOAuthError(
      'resource_failure',
      'Lunch Money /v2/me could not be reached.',
      cause,
      { failureReason: 'network_error' },
    )
  }

  if (!hasRequiredProfileFields(profile))
    throw new SafeOAuthError(
      'resource_failure',
      'Lunch Money rejected the /v2/me request.',
      undefined,
      {
        failureReason: 'invalid_response',
        ...(response === undefined ? {} : { httpStatus: response.status }),
      },
    )

  return profile
}
