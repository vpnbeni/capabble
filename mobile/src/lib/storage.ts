import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// Small key/value values that should survive restarts (the school code, the last login ID).
// Session cookies are kept by the OS networking layer, not here.

const web = Platform.OS === 'web'

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return web ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (web) globalThis.localStorage?.setItem(key, value)
      else await SecureStore.setItemAsync(key, value)
    } catch {
      // Not being able to remember a value only means asking for it again.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (web) globalThis.localStorage?.removeItem(key)
      else await SecureStore.deleteItemAsync(key)
    } catch {
      // Ignore: see set().
    }
  },
}
