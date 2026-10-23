import Constants from 'expo-constants'
import { Platform } from 'react-native'

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

/**
 * API base URL, ending in /api.
 * 1. EXPO_PUBLIC_API_URL (set per EAS build profile: stage, production).
 * 2. In development, the API on the machine running Metro (port 5000), so a phone
 *    on the same Wi-Fi or an emulator reaches it without editing anything.
 * 3. Production.
 */
const resolveApiBaseUrl = () => {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) return trimTrailingSlash(fromEnv)

  if (__DEV__) {
    if (Platform.OS === 'web') return 'http://localhost:5000/api'
    const host = Constants.expoConfig?.hostUri?.split(':')[0]
    if (host) return `http://${host}:5000/api`
  }

  return 'https://api.capabble.cloud/api'
}

export const API_BASE_URL = resolveApiBaseUrl()
