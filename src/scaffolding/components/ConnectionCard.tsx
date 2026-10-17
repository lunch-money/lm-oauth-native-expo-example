import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { ConnectionSummary } from '../../oauth/types'
import { connectionLabel } from '../connection-presentation'
import { ActionButton } from './ActionButton'

export function ConnectionCard({
  activeConnection,
  busy,
  connectionAvailability,
  connectedStatus,
  connections,
  message,
  onAuthorize,
  onForget,
  onOpenBudgetSelector,
  onReadProfile,
  onRefresh,
  onRevoke,
  refreshAvailable,
}: {
  readonly activeConnection?: ConnectionSummary
  readonly busy: boolean
  readonly connectionAvailability: string | null
  readonly connectedStatus: string | null
  readonly connections: ConnectionSummary[]
  readonly message: string
  readonly onAuthorize: () => void
  readonly onForget: () => void
  readonly onOpenBudgetSelector: () => void
  readonly onReadProfile: () => void
  readonly onRefresh: () => void
  readonly onRevoke: () => void
  readonly refreshAvailable: boolean
}) {
  return (
    <View style={styles.card}>
      {connectedStatus ? (
        <Text style={styles.message}>{connectedStatus}</Text>
      ) : null}
      {connectionAvailability ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.message,
            activeConnection?.availability !== 'ready' && styles.warning,
          ]}
        >
          {connectionAvailability}
        </Text>
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
              onPress={onOpenBudgetSelector}
              style={[styles.activeBudget, busy && styles.disabled]}
            >
              <Text style={styles.activeBudgetText}>
                {connectionLabel(activeConnection, connections)} ▾
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
      <ActionButton
        disabled={busy}
        label={
          connections.length
            ? 'Authorize another budget'
            : 'Connect Lunch Money'
        }
        onPress={onAuthorize}
      />
      {activeConnection?.availability === 'ready' ? (
        <ActionButton
          disabled={busy}
          label="Call /v2/me"
          onPress={onReadProfile}
        />
      ) : null}
      {activeConnection && refreshAvailable ? (
        <ActionButton
          disabled={busy}
          label="Refresh access token"
          onPress={onRefresh}
        />
      ) : null}
      {activeConnection?.availability === 'ready' ? (
        <ActionButton
          disabled={busy}
          label="Disconnect active budget"
          onPress={onRevoke}
        />
      ) : null}
      {activeConnection ? (
        <ActionButton
          disabled={busy}
          label="Forget local credential only"
          onPress={onForget}
          secondary
        />
      ) : null}
      {busy ? <ActivityIndicator accessibilityLabel="Working" /> : null}
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  activeBudget: {
    backgroundColor: '#e2eee7',
    borderColor: '#176b4d',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  activeBudgetText: { color: '#176b4d', fontSize: 16, fontWeight: '700' },
  budgetControl: { gap: 8, marginBottom: 4 },
  card: {
    backgroundColor: '#fffdf7',
    borderColor: '#d9d2c2',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginBottom: 18,
    padding: 18,
  },
  disabled: { opacity: 0.55 },
  heading: { color: '#15231c', fontSize: 20, fontWeight: '800' },
  message: { color: '#435047', lineHeight: 20 },
  warning: { color: '#a12622', fontWeight: '700' },
})
