import { parseConfiguration } from '../oauth/configuration'

export function loadPublicConfiguration() {
  return parseConfiguration({
    clientId: process.env.EXPO_PUBLIC_LUNCH_MONEY_CLIENT_ID,
    apiBaseUrl: process.env.EXPO_PUBLIC_LUNCH_MONEY_API_BASE_URL,
    redirectUri: process.env.EXPO_PUBLIC_LUNCH_MONEY_REDIRECT_URI,
  })
}
