export type LogoBrandTheme = {
  primary: string
  dark: string
  light: string
  textPrimary: string
  textMuted: string
  ring: string
  isDarkBackground: boolean
}

const CACHE_PREFIX = 'capabble-logo-brand:'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((value) => Number.isNaN(value))) return null
  return { r, g, b }
}

const relativeLuminance = (r: number, g: number, b: number) => {
  const transform = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b)
}

export const adjustHexColor = (hex: string, amount: number) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const mix = amount >= 0 ? 255 : 0
  const ratio = Math.abs(amount)
  return rgbToHex(
    rgb.r + (mix - rgb.r) * ratio,
    rgb.g + (mix - rgb.g) * ratio,
    rgb.b + (mix - rgb.b) * ratio
  )
}

const buildTheme = (r: number, g: number, b: number): LogoBrandTheme => {
  const primary = rgbToHex(r, g, b)
  const luminance = relativeLuminance(r, g, b)
  const isDarkBackground = luminance < 0.45

  return {
    primary,
    dark: adjustHexColor(primary, -0.18),
    light: adjustHexColor(primary, 0.12),
    textPrimary: isDarkBackground ? '#ffffff' : '#0f172a',
    textMuted: isDarkBackground ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.62)',
    ring: isDarkBackground ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.08)',
    isDarkBackground,
  }
}

const readCachedTheme = (logoUrl: string): LogoBrandTheme | null => {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${logoUrl}`)
    if (!raw) return null
    return JSON.parse(raw) as LogoBrandTheme
  } catch {
    return null
  }
}

const writeCachedTheme = (logoUrl: string, theme: LogoBrandTheme) => {
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${logoUrl}`, JSON.stringify(theme))
  } catch {
    // Ignore quota errors.
  }
}

export const extractLogoBrandTheme = (logoUrl: string): Promise<LogoBrandTheme | null> => {
  const cached = readCachedTheme(logoUrl)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = 72
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(null)
          return
        }

        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const buckets = new Map<string, { score: number; r: number; g: number; b: number }>()

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3]
          if (alpha < 140) continue

          const r = data[index]
          const g = data[index + 1]
          const b = data[index + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const lightness = (max + min) / (2 * 255)
          if (lightness > 0.9 || lightness < 0.08) continue

          const delta = max - min
          const saturation = max === 0 ? 0 : delta / max
          if (saturation < 0.18) continue

          const qr = Math.round(r / 20) * 20
          const qg = Math.round(g / 20) * 20
          const qb = Math.round(b / 20) * 20
          const key = `${qr}-${qg}-${qb}`
          const weight = 1 + saturation * 2.2
          const existing = buckets.get(key)
          if (existing) {
            existing.score += weight
          } else {
            buckets.set(key, { score: weight, r: qr, g: qg, b: qb })
          }
        }

        let best: { score: number; r: number; g: number; b: number } | null = null
        for (const bucket of buckets.values()) {
          if (!best || bucket.score > best.score) best = bucket
        }

        if (!best) {
          resolve(null)
          return
        }

        const winner = best
        const theme = buildTheme(winner.r, winner.g, winner.b)
        writeCachedTheme(logoUrl, theme)
        resolve(theme)
      } catch {
        resolve(null)
      }
    }

    img.onerror = () => resolve(null)
    img.src = logoUrl
  })
}
