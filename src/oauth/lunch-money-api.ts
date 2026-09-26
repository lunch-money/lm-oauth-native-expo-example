import { z } from 'zod'
import { SafeOAuthError } from './errors'
import type { LunchMoneyProfile } from './types'

const profileSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    id: z.number().int(),
    account_id: z.number().int(),
    budget_name: z.string(),
    primary_currency: z.string(),
    api_key_label: z.string().nullable(),
  })
  .strict()

/** Called by Call /v2/me; uses an access token transiently and returns only the validated public profile. */
export async function readLunchMoneyProfile(
  apiBaseUrl: URL,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<LunchMoneyProfile> {
  try {
    const response = await fetcher(new URL('/v2/me', apiBaseUrl), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (response.status === 403)
      throw new SafeOAuthError(
        'insufficient_scope',
        'The registered client needs the me:read scope.',
      )
    if (!response.ok) throw new Error()
    const parsed = profileSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error()
    return parsed.data
  } catch (error) {
    if (error instanceof SafeOAuthError) throw error
    // Security invariant: token and response details do not appear in UI-facing failures or logs.
    throw new SafeOAuthError(
      'resource_failure',
      'Lunch Money /v2/me could not be read.',
    )
  }
}
