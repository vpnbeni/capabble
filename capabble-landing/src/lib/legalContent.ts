import fs from 'node:fs'
import path from 'node:path'
import faq from '@/content/help-faq.json'
import { legalFacts, sharedPlaceholders } from '@/content/legalFacts'

export type LegalSection = { id: string; title: string; body: string }
export type LegalDoc = {
  title: string
  lastUpdated: string
  shortVersion: string[]
  sections: LegalSection[]
}

export type HelpTopic = (typeof faq)[number]
export const helpTopics: HelpTopic[] = faq

const DOCS = {
  privacy: { file: 'privacy-policy.md', date: legalFacts.privacyLastUpdated },
  terms: { file: 'terms-of-use.md', date: legalFacts.termsLastUpdated },
} as const

function fillPlaceholders(text: string, extra: Record<string, string>) {
  return Object.entries({ ...sharedPlaceholders, ...extra }).reduce(
    (out, [placeholder, value]) => out.split(placeholder).join(value),
    text
  )
}

/**
 * Reads a legal markdown file and splits it into the hero parts (h1, "Last updated",
 * short version) and the `##` sections, each with the id from the file's anchor table.
 */
export function loadLegalDoc(kind: keyof typeof DOCS): LegalDoc {
  const { file, date } = DOCS[kind]
  const raw = fs.readFileSync(path.join(process.cwd(), 'src/content', file), 'utf8')

  const anchorTable = /<!--([\s\S]*?)-->/.exec(raw)?.[1] ?? ''
  const idByTitle = new Map<string, string>()
  for (const m of anchorTable.matchAll(/\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/g)) idByTitle.set(m[2], m[1])

  const text = fillPlaceholders(raw.replace(/<!--[\s\S]*?-->/, ''), { '[date]': date })
  const title = /^# (.+)$/m.exec(text)?.[1] ?? ''
  const lastUpdated = /^(Last updated .+)$/m.exec(text)?.[1] ?? ''

  const [, ...chunks] = text.split(/^## /m)
  let shortVersion: string[] = []
  const sections: LegalSection[] = []
  for (const chunk of chunks) {
    const newline = chunk.indexOf('\n')
    const heading = chunk.slice(0, newline).trim()
    const body = chunk.slice(newline + 1).trim()
    if (heading === 'The short version') {
      shortVersion = body
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim())
      continue
    }
    const id = idByTitle.get(heading)
    if (!id) throw new Error(`${file}: no section id for "${heading}" in the anchor table`)
    sections.push({ id, title: heading, body })
  }

  return { title, lastUpdated, shortVersion, sections }
}
