import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import {
  createNativeOAuthWorkflow,
  discardAbandonedAuthorization,
  safeErrorMessage,
  type LunchMoneyProfile,
} from '../oauth'
import { SafeOAuthError } from '../oauth/errors'
import {
  expoOAuthBrowser,
  expoTokenRefresher,
} from '../oauth/expo-auth-session'
import { loadPublicConfiguration } from './configuration'
import { secureStore } from './secure-store'

const clock = { now: () => Date.now() }

export function AppScreen() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Ready to connect.')
  const [profile, setProfile] = useState<LunchMoneyProfile | null>(null)
  const [refreshAvailable, setRefreshAvailable] = useState(false)
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
      try {
        await workflow.completeCallback(url)
        if (active) {
          const status = await workflow.connectionStatus()
          setRefreshAvailable(status.refreshAvailable)
          setMessage(
            'Authorization resumed after app restart and completed securely.',
          )
        }
      } catch (error) {
        if (active) setMessage(safeErrorMessage(error))
      } finally {
        if (active) setBusy(false)
      }
    }
    void Linking.getInitialURL().then(complete)
    void discardAbandonedAuthorization(secureStore, clock)
    void workflow
      .connectionStatus()
      .then((status) => {
        if (active) setRefreshAvailable(status.refreshAvailable)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [workflow])

  async function act(action: () => Promise<void>, success: string) {
    setBusy(true)
    setProfile(null)
    try {
      await action()
      setMessage(success)
    } catch (error) {
      setMessage(safeErrorMessage(error))
    } finally {
      const status = await workflow.connectionStatus().catch(() => ({
        connected: false,
        refreshAvailable: false,
      }))
      setRefreshAvailable(status.refreshAvailable)
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StatusBar style="dark" />
      <Text style={styles.eyebrow}>LUNCH MONEY DEVELOPER SAMPLE</Text>
      <Text style={styles.title}>Native OAuth with Expo</Text>
      <Text style={styles.body}>
        A public client: system browser, state, S256 PKCE, discovery, and
        platform secure storage. No client secret belongs in this app.
      </Text>
      <View style={styles.card}>
        <Action
          disabled={busy}
          label="1. Connect Lunch Money"
          onPress={() =>
            act(
              () => workflow.authorize(),
              'Authorization completed and the credential is stored securely.',
            )
          }
        />
        <Action
          disabled={busy}
          label="2. Call /v2/me"
          onPress={() =>
            act(async () => {
              setProfile(await workflow.readProfile())
            }, 'The validated /v2/me profile is shown below.')
          }
        />
        {refreshAvailable ? (
          <Action
            disabled={busy}
            label="3. Refresh access token"
            onPress={() =>
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
              }, 'Access and refresh tokens were rotated and stored securely.')
            }
          />
        ) : null}
        <Action
          disabled={busy}
          label={
            refreshAvailable ? '4. Revoke and verify' : '3. Revoke and verify'
          }
          onPress={() =>
            act(
              () => workflow.revoke(),
              'Lunch Money rejected the old token and the local credential was removed.',
            )
          }
        />
        <Action
          disabled={busy}
          label="Local reset only"
          secondary
          onPress={() =>
            act(
              () => workflow.resetLocal(),
              'Local credential removed. Remote access was not revoked.',
            )
          }
        />
        {busy ? <ActivityIndicator accessibilityLabel="Working" /> : null}
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      </View>
      {profile ? (
        <View style={styles.card}>
          <Text style={styles.heading}>Validated profile</Text>
          <Text style={styles.profile}>{profile.name}</Text>
          <Text style={styles.profile}>{profile.email}</Text>
          <Text style={styles.profile}>
            {profile.budget_name} · {profile.primary_currency.toUpperCase()}
          </Text>
        </View>
      ) : null}
      <Text style={styles.note}>
        Refresh appears only when the registered client includes offline_access
        and Lunch Money returns a refresh token.
      </Text>
    </ScrollView>
  )
}

function Action({
  disabled,
  label,
  onPress,
  secondary = false,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  secondary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#f6f2e9',
    flexGrow: 1,
    padding: 24,
    paddingTop: 72,
  },
  eyebrow: {
    color: '#4f6d5d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: { color: '#15231c', fontSize: 36, fontWeight: '800', marginTop: 8 },
  body: {
    color: '#435047',
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 20,
    marginTop: 12,
  },
  card: {
    backgroundColor: '#fffdf7',
    borderColor: '#d9d2c2',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginBottom: 18,
    padding: 18,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#176b4d',
    borderRadius: 12,
    padding: 15,
  },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  secondary: {
    backgroundColor: '#fffdf7',
    borderColor: '#176b4d',
    borderWidth: 1,
  },
  secondaryText: { color: '#176b4d' },
  disabled: { opacity: 0.55 },
  message: { color: '#435047', lineHeight: 20 },
  heading: { color: '#15231c', fontSize: 20, fontWeight: '800' },
  profile: { color: '#435047', fontSize: 16 },
  note: { color: '#675f52', fontSize: 14, lineHeight: 20 },
})
