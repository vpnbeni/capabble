// Display formats from the design system. Same rules as client/src/utils/classLabel.ts and
// client/src/components/ui/format.ts; move them to packages/shared once both apps use them.

/** "10th", "Class X" → "10"; keeps names like "Nursery". */
export const shortClass = (className?: string | null) =>
  String(className || '')
    .trim()
    .replace(/^class\s*/i, '')
    .replace(/^(\d+)\s*(st|nd|rd|th)$/i, '$1')

/** School style: "Class 7-A" (never "7th-A"). */
export const classLabel = (className?: string | null, section?: string | null) => {
  const cls = shortClass(className)
  if (!cls) return '—'
  return `Class ${cls}${section ? `-${section}` : ''}`
}
