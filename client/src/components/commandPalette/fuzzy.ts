/**
 * Small dependency-free fuzzy matcher for the command palette.
 * Ranks: exact > prefix > word-start > acronym ("tw" → "Teacher Wise") > substring > subsequence.
 */
export type MatchRange = [start: number, end: number]

export type FieldMatch = { score: number; ranges: MatchRange[] }

const isBoundary = (text: string, index: number) => index === 0 || /[\s\-_/&(]/.test(text[index - 1])

export const matchField = (needle: string, text: string): FieldMatch | null => {
  if (!needle || !text) return null
  const hay = text.toLowerCase()
  const len = needle.length

  if (hay === needle) return { score: 1000, ranges: [[0, len]] }
  if (hay.startsWith(needle)) return { score: 900 - Math.min(hay.length - len, 100), ranges: [[0, len]] }

  // Word-start substring, e.g. "coll" in "Fee collection".
  let index = hay.indexOf(needle)
  while (index !== -1) {
    if (isBoundary(hay, index)) return { score: 700 - Math.min(index, 100), ranges: [[index, index + len]] }
    index = hay.indexOf(needle, index + 1)
  }

  // Acronym: each needle char starts a word, in order.
  const starts: number[] = []
  for (let i = 0; i < hay.length; i += 1) if (isBoundary(hay, i) && /[a-z0-9]/.test(hay[i])) starts.push(i)
  if (len > 1 && len <= starts.length) {
    const ranges: MatchRange[] = []
    let n = 0
    for (const start of starts) {
      if (hay[start] === needle[n]) {
        ranges.push([start, start + 1])
        n += 1
        if (n === len) return { score: 600, ranges }
      }
    }
  }

  const contains = hay.indexOf(needle)
  if (contains !== -1) return { score: 500 - Math.min(contains, 100), ranges: [[contains, contains + len]] }

  // Subsequence with a bonus for consecutive characters; needs ≥ 3 chars to avoid noise.
  if (len < 3) return null
  const ranges: MatchRange[] = []
  let n = 0
  let consecutive = 0
  let bonus = 0
  for (let i = 0; i < hay.length && n < len; i += 1) {
    if (hay[i] !== needle[n]) {
      consecutive = 0
      continue
    }
    const last = ranges[ranges.length - 1]
    if (last && last[1] === i) last[1] = i + 1
    else ranges.push([i, i + 1])
    consecutive += 1
    bonus += consecutive * 4 + (isBoundary(hay, i) ? 10 : 0)
    n += 1
  }
  if (n < len) return null
  return { score: Math.min(100 + bonus, 450), ranges }
}

export type Searchable = { title: string; keywords?: string; subtitle?: string }

export type ScoredMatch = { score: number; titleRanges: MatchRange[] }

/**
 * Every whitespace-separated token must match the title, keywords or subtitle.
 * Title hits weigh most; ranges are returned for highlighting the title only.
 */
export const scoreSearchable = (query: string, item: Searchable): ScoredMatch | null => {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return null

  const whole = tokens.length > 1 ? matchField(tokens.join(' '), item.title) : null
  if (whole && whole.score >= 700) return { score: whole.score + 200, titleRanges: whole.ranges }

  let total = 0
  const titleRanges: MatchRange[] = []
  for (const token of tokens) {
    const title = matchField(token, item.title)
    const keyword = item.keywords ? matchField(token, item.keywords) : null
    const subtitle = item.subtitle ? matchField(token, item.subtitle) : null
    const best = Math.max(title?.score ?? 0, (keyword?.score ?? 0) * 0.6, (subtitle?.score ?? 0) * 0.5)
    if (best <= 0) return null
    if (title && title.score >= best) titleRanges.push(...title.ranges)
    total += best
  }
  return { score: total / tokens.length, titleRanges }
}
