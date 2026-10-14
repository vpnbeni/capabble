import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Lets a list page accept a search term from the URL (e.g. `/subjects?q=maths`, used by the ⌘K palette).
 * Returns the value present on first render (use it as initial state) and calls `apply`
 * whenever the param changes afterwards — e.g. the palette navigates to the page it is already on.
 */
export const useUrlSearchQuery = (apply: (value: string) => void, key = 'q'): string => {
  const [searchParams] = useSearchParams()
  const value = searchParams.get(key) ?? ''
  const applyRef = useRef(apply)
  applyRef.current = apply
  const initialValue = useRef(value)
  const lastValue = useRef(value)

  useEffect(() => {
    if (value === lastValue.current) return
    lastValue.current = value
    applyRef.current(value)
  }, [value])

  return initialValue.current
}
