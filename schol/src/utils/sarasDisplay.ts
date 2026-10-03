export function displaySarasValue(value: string | null | undefined): string {
  if (value == null) return 'Not available'
  const trimmed = value.trim()
  return trimmed || 'Not available'
}

/** Decode CBSE/KYS obfuscation: name[at]domain[dot]com → name@domain.com */
export function displayEmail(value: string | null | undefined): string {
  if (value == null) return 'Not available'
  const trimmed = value.trim()
  if (!trimmed) return 'Not available'
  return trimmed
    .replace(/\s*[\[({]\s*at\s*[\])}]\s*/gi, '@')
    .replace(/\s*[\[({]\s*dot\s*[\])}]\s*/gi, '.')
}

export function sarasWebsiteHref(website: string | null | undefined): string | null {
  if (!website?.trim()) return null
  const normalized = website.trim()
  if (/^https?:\/\//i.test(normalized)) return normalized
  return `https://${normalized}`
}
