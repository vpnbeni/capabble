export function displaySarasValue(value: string | null | undefined): string {
  if (value == null) return 'Not available'
  const trimmed = value.trim()
  return trimmed || 'Not available'
}

export function sarasWebsiteHref(website: string | null | undefined): string | null {
  if (!website?.trim()) return null
  const normalized = website.trim()
  if (/^https?:\/\//i.test(normalized)) return normalized
  return `https://${normalized}`
}
