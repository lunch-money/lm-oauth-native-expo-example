import { Pressable, StyleSheet, Text } from 'react-native'

export function ActionButton({
  disabled,
  label,
  onPress,
  secondary = false,
}: {
  readonly disabled: boolean
  readonly label: string
  readonly onPress: () => void
  readonly secondary?: boolean
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
})
