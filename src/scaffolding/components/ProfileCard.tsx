import { StyleSheet, Text, View } from 'react-native'
import type { LunchMoneyProfile } from '../../oauth'

export function ProfileCard({
  profile,
}: {
  readonly profile: LunchMoneyProfile
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Validated profile</Text>
      <Text style={styles.profile}>{profile.name}</Text>
      <Text style={styles.profile}>{profile.email}</Text>
      <Text style={styles.profile}>
        {profile.budget_name} · {profile.primary_currency.toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fffdf7',
    borderColor: '#d9d2c2',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginBottom: 18,
    padding: 18,
  },
  heading: { color: '#15231c', fontSize: 20, fontWeight: '800' },
  profile: { color: '#435047', fontSize: 16 },
})
