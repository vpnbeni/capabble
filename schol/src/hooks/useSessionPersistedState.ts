import { useEffect, useRef, useState } from 'react'

/**
 * Like useState, but mirrors the value to sessionStorage so a refresh or
 * back/forward navigation inside the same tab restores it. `version` should
 * bump whenever the stored shape changes — a mismatched version discards the
 * stored draft instead of trying to merge an incompatible shape into it.
 */
export function useSessionPersistedState<T>(key: string, version: number, initial: T) {
  const storageKey = `${key}:v${version}`

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // Corrupt or inaccessible storage — fall back to the initial value.
    }
    return initial
  })

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Ignore quota/availability errors — persistence is a convenience, not a requirement.
    }
  }, [storageKey, value])

  function clear() {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
    setValue(initial)
  }

  return [value, setValue, clear] as const
}
