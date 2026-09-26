import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppScreen } from './src/scaffolding/AppScreen'

export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  )
}
