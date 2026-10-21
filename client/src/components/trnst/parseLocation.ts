/**
 * Reads a map position out of what someone pastes: plain coordinates copied from
 * Google Maps ("28.8955, 76.6066"), degrees-minutes-seconds (28°53'43.8"N 76°36'23.8"E),
 * or a full Google Maps link. Short share links (maps.app.goo.gl) don't contain the
 * position, so they come back as `short_link` for the screen to explain.
 */

export type ParsedLocation =
  | { ok: true; lat: number; lng: number; swapped: boolean; outsideIndia: boolean }
  | { ok: false; reason: 'empty' | 'short_link' | 'not_found' | 'out_of_range' }

// Rough box around India, only to warn about obvious mistakes.
const INDIA = { minLat: 6, maxLat: 37.5, minLng: 68, maxLng: 98 }

const inIndia = (lat: number, lng: number) =>
  lat >= INDIA.minLat && lat <= INDIA.maxLat && lng >= INDIA.minLng && lng <= INDIA.maxLng

const NUMBER = '[-+]?\\d{1,3}(?:\\.\\d+)?'

/** Most precise position first: a place's own pin, then a searched point, then the view centre. */
const URL_PATTERNS: RegExp[] = [
  new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=(${NUMBER}),\\s*(${NUMBER})`),
  new RegExp(`/search/(${NUMBER}),\\s*\\+?(${NUMBER})`),
  new RegExp(`/place/(${NUMBER}),\\s*\\+?(${NUMBER})`),
  new RegExp(`@(${NUMBER}),(${NUMBER})`),
]

const PLAIN = new RegExp(`^\\(?\\s*(${NUMBER})\\s*[,;\\s]\\s*(${NUMBER})\\s*\\)?$`)

// 28°53'43.8"N 76°36'23.8"E (also with ′ ″ or spaces)
const DMS_PART = '(\\d{1,3})\\s*°\\s*(\\d{1,2})?\\s*[\'′]?\\s*(\\d{1,2}(?:\\.\\d+)?)?\\s*["″]?\\s*([NSEW])'
const DMS = new RegExp(`${DMS_PART}[\\s,]+${DMS_PART}`, 'i')

const fromDms = (deg: string, min = '0', sec = '0', hemisphere: string) => {
  const value = Number(deg) + Number(min || 0) / 60 + Number(sec || 0) / 3600
  return /[SW]/i.test(hemisphere) ? -value : value
}

const finish = (first: number, second: number): ParsedLocation => {
  let lat = first
  let lng = second
  let swapped = false
  // Pasted the wrong way round (longitude first), a common slip for India.
  if (!inIndia(lat, lng) && inIndia(lng, lat)) {
    lat = second
    lng = first
    swapped = true
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, reason: 'out_of_range' }
  return { ok: true, lat, lng, swapped, outsideIndia: !inIndia(lat, lng) }
}

export const parseLocation = (input: string): ParsedLocation => {
  const text = String(input || '').trim()
  if (!text) return { ok: false, reason: 'empty' }

  const dms = text.match(DMS)
  if (dms) {
    const [, d1, m1, s1, h1, d2, m2, s2, h2] = dms
    const a = fromDms(d1, m1, s1, h1)
    const b = fromDms(d2, m2, s2, h2)
    // Accept either order: the N/S part is the latitude.
    return /[NS]/i.test(h1) ? finish(a, b) : finish(b, a)
  }

  const plain = text.match(PLAIN)
  if (plain) return finish(Number(plain[1]), Number(plain[2]))

  if (/^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(text)) return { ok: false, reason: 'short_link' }

  let decoded = text
  try {
    decoded = decodeURIComponent(text)
  } catch {
    // Keep the raw text if it isn't valid URI encoding.
  }
  for (const pattern of URL_PATTERNS) {
    const match = decoded.match(pattern)
    if (match) return finish(Number(match[1]), Number(match[2]))
  }
  return { ok: false, reason: 'not_found' }
}

export const PARSE_MESSAGES: Record<Exclude<ParsedLocation, { ok: true }>['reason'], string> = {
  empty: 'Paste coordinates or a Google Maps link.',
  short_link:
    'Short share links don’t include the position. Open the link, right-click the exact spot (long-press on a phone) and copy the numbers shown.',
  not_found:
    'Couldn’t find a position in that. In Google Maps, right-click the spot and click the numbers at the top to copy them, then paste here.',
  out_of_range: 'Those numbers aren’t a map position. Copy them again from Google Maps.',
}
