import { useEffect, useState } from 'react'
import { extractLogoBrandTheme, type LogoBrandTheme } from '@/utils/logoBrandColor'

export const useLogoBrandTheme = (logoUrl: string) => {
  const [theme, setTheme] = useState<LogoBrandTheme | null>(null)

  useEffect(() => {
    const normalized = String(logoUrl || '').trim()
    if (!normalized) {
      setTheme(null)
      return
    }

    let cancelled = false
    extractLogoBrandTheme(normalized).then((nextTheme) => {
      if (!cancelled) setTheme(nextTheme)
    })

    return () => {
      cancelled = true
    }
  }, [logoUrl])

  return theme
}
