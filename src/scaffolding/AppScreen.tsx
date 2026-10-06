import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  type ConnectionStatus,
  type LunchMoneyProfile,
} from '../oauth'
import { SafeOAuthError } from '../oauth/errors'
import {
  expoOAuthBrowser,
  expoTokenRefresher,
} from '../oauth/expo-auth-session'
import { loadPublicConfiguration } from './configuration'
import {
  authorizationResultMessage,
  connectedStatusText,
  connectionLabel,
} from './connection-presentation'
import { secureStore } from './secure-store'

const clock = { now: () => Date.now() }
const emptyConnectionStatus: ConnectionStatus = {
  activeAccountId: null,
  activeLunchMoneyUserId: null,
  activeLunchMoneyUserName: null,
  connections: [],
  legacyCredentialDiscarded: false,
}

export function AppScreen() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Ready to connect.')
  const [profile, setProfile] = useState<LunchMoneyProfile | null>(null)
  const [budgetSelectorVisible, setBudgetSelectorVisible] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    emptyConnectionStatus,
  )
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
      setProfile(null)
      setConnectionStatus(emptyConnectionStatus)
      try {
        const result = await workflow.completeCallback(url)
        if (active) {
          const status = await workflow.connectionStatus()
          setConnectionStatus(status)
          setMessage(authorizationResultMessage(result))
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
        if (active) {
          setConnectionStatus(status)
          if (status.legacyCredentialDiscarded)
            setMessage(
              'A credential saved by an older sample version could not be identified safely. Authorize Lunch Money again.',
            )
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [workflow])

  async function act<T>(
    action: () => Promise<T>,
    success: string | ((result: T) => string),
  ) {
    setBusy(true)
    setProfile(null)
    try {
      const result = await action()
      setMessage(typeof success === 'function' ? success(result) : success)
    } catch (error) {
      setMessage(safeErrorMessage(error))
    } finally {
      const status = await workflow
        .connectionStatus()
        .catch(() => emptyConnectionStatus)
      setConnectionStatus(status)
      setBusy(false)
    }
  }

  const connections = connectionStatus.connections
  const activeConnection = connections.find(({ active }) => active)
  const refreshAvailable = Boolean(activeConnection?.refreshAvailable)
  const connectedStatus = connectedStatusText(connectionStatus)

  async function confirmForgetLocalCredential(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Forget local credential only?',
        'This removes only the active budget credential from this device. The remote Lunch Money authorization remains active.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'Forget credential',
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      )
    })
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
        {connectedStatus ? (
          <Text style={styles.message}>{connectedStatus}</Text>
        ) : null}
        {activeConnection ? (
          <View style={styles.budgetControl}>
            <Text style={styles.heading}>Active budget</Text>
            {connections.length === 1 ? (
              <View style={styles.activeBudget}>
                <Text style={styles.activeBudgetText}>
                  {connectionLabel(activeConnection, connections)}
                </Text>
              </View>
            ) : (
              <Pressable
                accessibilityHint="Opens the authorized budget selector"
                accessibilityLabel={`Active budget, ${connectionLabel(activeConnection, connections)}`}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setBudgetSelectorVisible(true)}
                style={[styles.activeBudget, busy && styles.disabled]}
              >
                <Text style={styles.activeBudgetText}>
                  {connectionLabel(activeConnection, connections)} ▾
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
        <Action
          disabled={busy}
          label={
            connections.length
              ? 'Authorize another budget'
              : 'Connect Lunch Money'
          }
          onPress={() =>
            act(async () => {
              setConnectionStatus(emptyConnectionStatus)
              return workflow.authorize()
            }, authorizationResultMessage)
          }
        />
        {activeConnection ? (
          <Action
            disabled={busy}
            label="Call /v2/me"
            onPress={() =>
              act(async () => {
                setProfile(await workflow.readProfile())
              }, 'The validated /v2/me profile is shown below.')
            }
          />
        ) : null}
        {activeConnection && refreshAvailable ? (
          <Action
            disabled={busy}
            label="Refresh access token"
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
        {activeConnection ? (
          <Action
            disabled={busy}
            label="Disconnect active budget"
            onPress={() =>
              act(
                () => workflow.revoke(),
                'The active budget was disconnected and its old token was rejected.',
              )
            }
          />
        ) : null}
        {activeConnection ? (
          <Action
            disabled={busy}
            label="Forget local credential only"
            secondary
            onPress={async () => {
              if (!(await confirmForgetLocalCredential())) return
              await act(
                () => workflow.resetLocal(),
                'Local credential removed. Remote Lunch Money authorization remains active.',
              )
            }}
          />
        ) : null}
        {busy ? <ActivityIndicator accessibilityLabel="Working" /> : null}
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {message}
        </Text>
      </View>
      <Modal
        animationType="slide"
        onRequestClose={() => setBudgetSelectorVisible(false)}
        transparent
        visible={budgetSelectorVisible}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.selectorSheet}>
            <Text style={styles.heading}>Choose active budget</Text>
            {connections.map((connection) => (
              <Pressable
                accessibilityLabel={connectionLabel(connection, connections)}
                accessibilityRole="radio"
                accessibilityState={{
                  disabled: busy,
                  selected: connection.active,
                }}
                disabled={busy}
                key={`${connection.lunchMoneyUserId}:${connection.accountId}`}
                onPress={() => {
                  setBudgetSelectorVisible(false)
                  void act(
                    () => workflow.selectConnection(connection.accountId),
                    `${connection.budgetName} is now active.`,
                  )
                }}
                style={[
                  styles.selectorOption,
                  connection.active && styles.budgetOptionActive,
                  busy && styles.disabled,
                ]}
              >
                <Text style={styles.activeBudgetText}>
                  {connectionLabel(connection, connections)}
                </Text>
              </Pressable>
            ))}
            <Action
              disabled={busy}
              label="Cancel"
              onPress={() => setBudgetSelectorVisible(false)}
              secondary
            />
          </View>
        </View>
      </Modal>
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
  budgetControl: { gap: 8, marginBottom: 4 },
  budgetOptionActive: { backgroundColor: '#bcdccb' },
  activeBudget: {
    backgroundColor: '#e2eee7',
    borderColor: '#176b4d',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  activeBudgetText: { color: '#176b4d', fontSize: 16, fontWeight: '700' },
  modalBackdrop: {
    backgroundColor: 'rgba(21, 35, 28, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  selectorSheet: {
    backgroundColor: '#fffdf7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 10,
    padding: 24,
    paddingBottom: 40,
  },
  selectorOption: {
    backgroundColor: '#e2eee7',
    borderColor: '#176b4d',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
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
