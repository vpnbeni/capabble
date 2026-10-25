import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'

// Larger JSON the app keeps on the phone between launches (the offline attendance queue,
// class lists for marking without a connection). Small values go in lib/storage.ts instead.
// Never put tokens or passwords here.

const web = Platform.OS === 'web'
const fileFor = (name: string) => new File(Paths.document, `${name}.json`)

export const fileStore = {
  async read<T>(name: string): Promise<T | null> {
    try {
      if (web) {
        const text = globalThis.localStorage?.getItem(`capabble.file.${name}`)
        return text ? (JSON.parse(text) as T) : null
      }
      const file = fileFor(name)
      if (!file.exists) return null
      return JSON.parse(await file.text()) as T
    } catch {
      return null
    }
  },

  async write(name: string, value: unknown): Promise<void> {
    const text = JSON.stringify(value)
    if (web) {
      globalThis.localStorage?.setItem(`capabble.file.${name}`, text)
      return
    }
    const file = fileFor(name)
    if (!file.exists) file.create()
    await file.write(text)
  },

  async remove(name: string): Promise<void> {
    try {
      if (web) globalThis.localStorage?.removeItem(`capabble.file.${name}`)
      else {
        const file = fileFor(name)
        if (file.exists) file.delete()
      }
    } catch {
      // Nothing to remove.
    }
  },
}
