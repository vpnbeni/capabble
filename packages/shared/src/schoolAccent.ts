// The school's own colour as the accent tokens, from the design system's SchoolTheme
// (bundle.js `schoolAccent`). One hex in, the seven accent tokens for light and dark out,
// darkened (light) or lightened (dark) until text pairs pass 4.5:1 and marks pass 3:1.
// Status colours, neutrals and charts never change. Used by the web app and the mobile app.

export type AccentTokens = {
  accent: string
  'accent-strong': string
  'accent-strong-hover': string
  'on-accent': string
  'accent-soft': string
  'accent-soft-ink': string
  'focus-ring': string
}

type Rgb = [number, number, number]

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export const isSchoolColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value.trim())

const hexToRgb = (hex: string): Rgb => {
  let s = hex.trim().replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

const rgbToHex = (c: Rgb) =>
  '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

const luminance = (c: Rgb) => {
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

const contrast = (a: Rgb, b: Rgb) => {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Moves `base` towards `target` until it reaches `min` contrast against `against`. */
const pushTo = (base: Rgb, target: Rgb, against: Rgb, min: number) => {
  let c = base
  for (let t = 0; t <= 1.0001 && contrast(c, against) < min; t += 0.02) c = mix(base, target, t)
  return c
}

/** The accent tokens for both themes, or null when `hex` isn't a colour. */
export function schoolAccent(hex: string | null | undefined): { light: AccentTokens; dark: AccentTokens } | null {
  if (!isSchoolColor(hex)) return null
  const base = hexToRgb(hex)
  const W: Rgb = [255, 255, 255]
  const K: Rgb = [0, 0, 0]
  // `bg` and `surface` of each theme (designTokens.json).
  const bgLight: Rgb = [244, 245, 246]
  const surfaceDark: Rgb = [25, 27, 28]
  const bgDark: Rgb = [17, 19, 20]

  const strong = pushTo(base, K, bgLight, 4.6)
  const soft = mix(base, W, 0.88)
  const dStrong = pushTo(base, W, bgDark, 4.8)
  const dSoft = mix(base, surfaceDark, 0.78)
  const dOn = contrast([5, 23, 54], dStrong) >= contrast(W, dStrong) ? bgDark : W

  return {
    light: {
      accent: rgbToHex(contrast(base, bgLight) >= 3 ? base : pushTo(base, K, bgLight, 3.05)),
      'accent-strong': rgbToHex(strong),
      'accent-strong-hover': rgbToHex(mix(strong, K, 0.18)),
      'on-accent': '#FFFFFF',
      'accent-soft': rgbToHex(soft),
      'accent-soft-ink': rgbToHex(pushTo(strong, K, soft, 4.6)),
      'focus-ring': rgbToHex(strong),
    },
    dark: {
      accent: rgbToHex(pushTo(base, W, bgDark, 3.05)),
      'accent-strong': rgbToHex(dStrong),
      'accent-strong-hover': rgbToHex(mix(dStrong, W, 0.25)),
      'on-accent': rgbToHex(dOn),
      'accent-soft': rgbToHex(dSoft),
      'accent-soft-ink': rgbToHex(pushTo(mix(base, W, 0.55), W, dSoft, 4.6)),
      'focus-ring': rgbToHex(dStrong),
    },
  }
}
