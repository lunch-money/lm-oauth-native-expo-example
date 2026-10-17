import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ConnectionSummary } from '../../oauth/types'
import { connectionLabel } from '../connection-presentation'
import { ActionButton } from './ActionButton'

export function BudgetSelector({
  busy,
  connections,
  onClose,
  onSelect,
  visible,
}: {
  readonly busy: boolean
  readonly connections: ConnectionSummary[]
  readonly onClose: () => void
  readonly onSelect: (connection: ConnectionSummary) => void
  readonly visible: boolean
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
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
              onPress={() => onSelect(connection)}
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
          <ActionButton
            disabled={busy}
            label="Cancel"
            onPress={onClose}
            secondary
          />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  activeBudgetText: { color: '#176b4d', fontSize: 16, fontWeight: '700' },
  budgetOptionActive: { backgroundColor: '#bcdccb' },
  disabled: { opacity: 0.55 },
  heading: { color: '#15231c', fontSize: 20, fontWeight: '800' },
  modalBackdrop: {
    backgroundColor: 'rgba(21, 35, 28, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  selectorOption: {
    backgroundColor: '#e2eee7',
    borderColor: '#176b4d',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  selectorSheet: {
    backgroundColor: '#fffdf7',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 10,
    padding: 24,
    paddingBottom: 40,
  },
})
