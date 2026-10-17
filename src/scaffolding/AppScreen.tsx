import { Alert, ScrollView, StyleSheet, Text } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { BudgetSelector } from './components/BudgetSelector'
import { ConnectionCard } from './components/ConnectionCard'
import { ProfileCard } from './components/ProfileCard'
import { useOAuthDemo } from './useOAuthDemo'

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

export function AppScreen() {
  const { actions, state } = useOAuthDemo()

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StatusBar style="dark" />
      <Text style={styles.eyebrow}>LUNCH MONEY DEVELOPER SAMPLE</Text>
      <Text style={styles.title}>Native OAuth with Expo</Text>
      <Text style={styles.body}>
        A public client: system browser, state, S256 PKCE, discovery, and
        platform secure storage. No client secret belongs in this app.
      </Text>
      <ConnectionCard
        activeConnection={state.activeConnection}
        busy={state.busy}
        connectionAvailability={state.connectionAvailability}
        connectedStatus={state.connectedStatus}
        connections={state.connections}
        message={state.message}
        onAuthorize={() => void actions.authorize()}
        onForget={() => {
          void confirmForgetLocalCredential().then((confirmed) => {
            if (confirmed) void actions.forgetLocalCredential()
          })
        }}
        onOpenBudgetSelector={actions.openBudgetSelector}
        onReadProfile={() => void actions.readProfile()}
        onRefresh={() => void actions.refresh()}
        onRevoke={() => void actions.revoke()}
        refreshAvailable={state.refreshAvailable}
      />
      <BudgetSelector
        busy={state.busy}
        connections={state.connections}
        onClose={actions.closeBudgetSelector}
        onSelect={(connection) => void actions.selectConnection(connection)}
        visible={state.budgetSelectorVisible}
      />
      {state.profile ? <ProfileCard profile={state.profile} /> : null}
      <Text style={styles.note}>
        Refresh appears only when the registered client includes offline_access
        and Lunch Money returns a refresh token.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  body: {
    color: '#435047',
    fontSize: 17,
    lineHeight: 25,
    marginBottom: 20,
    marginTop: 12,
  },
  eyebrow: {
    color: '#4f6d5d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  note: { color: '#675f52', fontSize: 14, lineHeight: 20 },
  page: {
    backgroundColor: '#f6f2e9',
    flexGrow: 1,
    padding: 24,
    paddingTop: 72,
  },
  title: { color: '#15231c', fontSize: 36, fontWeight: '800', marginTop: 8 },
})
