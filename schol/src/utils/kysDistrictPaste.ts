import type { KysPasteSchool } from '@/types/collection'

function extractRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
  }
  if (raw && typeof raw === 'object') {
    const root = raw as Record<string, unknown>
    const data = root.data ?? raw
    if (Array.isArray(data)) {
      return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    }
    if (data && typeof data === 'object') {
      const content = (data as Record<string, unknown>).content
      if (Array.isArray(content)) {
        return content.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      }
    }
  }
  return []
}

/** Parse a pasted KYS Advance Search / district listing JSON into unique schools. */
export function parseKysDistrictPaste(rawText: string): {
  schools: KysPasteSchool[]
  rowsSeen: number
  duplicates: number
  parseError: string | null
  rawJson: unknown | null
} {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return { schools: [], rowsSeen: 0, duplicates: 0, parseError: 'Paste the KYS JSON response first.', rawJson: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { schools: [], rowsSeen: 0, duplicates: 0, parseError: 'Invalid JSON — paste the full Network response body.', rawJson: null }
  }

  const rows = extractRows(parsed)
  const seen = new Set<string>()
  const schools: KysPasteSchool[] = []
  let duplicates = 0

  for (const row of rows) {
    const schoolId = row.schoolId != null ? String(row.schoolId).trim() : ''
    if (!schoolId) continue
    if (seen.has(schoolId)) {
      duplicates += 1
      continue
    }
    seen.add(schoolId)
    schools.push({
      schoolId,
      udise: row.udiseschCode != null ? String(row.udiseschCode).trim() : '',
      schoolName: row.schoolName != null ? String(row.schoolName).trim() : schoolId,
      district: row.districtName != null ? String(row.districtName).trim() : null,
      state: row.stateName != null ? String(row.stateName).trim() : null,
    })
  }

  if (schools.length === 0) {
    return {
      schools: [],
      rowsSeen: rows.length,
      duplicates,
      parseError: 'No school records with schoolId found in the pasted JSON.',
      rawJson: parsed,
    }
  }

  return { schools, rowsSeen: rows.length, duplicates, parseError: null, rawJson: parsed }
}
