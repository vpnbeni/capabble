import type React from 'react'

/**
 * Houses, clubs and teams each carry their own colour (picked to match their logo).
 * That colour is identity data, not theme: it is applied exactly as stored. These
 * helpers pass it to CSS as `--tone`, with a readable text colour for anything placed
 * on a solid fill (`--tone-ink`). Soft tints are mixed in CSS (see actvt.css) so they
 * follow light and dark mode.
 */

export const isLikelyColor = (value = '') => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value).trim())

/** Used only when an entity has no colour saved. Matches the system's chart order. */
export const FALLBACK_TONES = ['#3A7AE1', '#2F9E77', '#D9A12B', '#D9577A', '#2DB3E7', '#8B6FD6']

const expand = (hex: string) => {
  const raw = hex.trim().replace('#', '')
  return raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
}

/** WCAG relative luminance of a #rgb / #rrggbb colour. */
const luminance = (hex: string) => {
  const value = expand(hex)
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** Dark or white text, whichever reads better on a solid fill of `hex`. */
export const readableInk = (hex: string) => {
  if (!isLikelyColor(hex)) return '#FFFFFF'
  const l = luminance(hex)
  const onWhite = 1.05 / (l + 0.05)
  const onDark = (l + 0.05) / 0.0627 // vs #191B1C
  return onDark > onWhite ? '#191B1C' : '#FFFFFF'
}

/** The entity's own colour, or a stable fallback by position. */
export const toneOf = (color: string | null | undefined, index = 0) =>
  isLikelyColor(color || '') ? String(color).trim() : FALLBACK_TONES[Math.abs(index) % FALLBACK_TONES.length]

/** Inline style that exposes the tone to `.actvt-tone*` classes. */
export const toneStyle = (color: string | null | undefined, index = 0): React.CSSProperties => {
  const tone = toneOf(color, index)
  return { ['--tone' as string]: tone, ['--tone-ink' as string]: readableInk(tone) } as React.CSSProperties
}
