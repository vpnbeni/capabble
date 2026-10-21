import React, { useMemo, useState } from 'react'
import { ClipboardPaste, LocateFixed, Search } from 'lucide-react'
import { Banner, Button, TextField } from '@/components/ui'
import trnstService, { type PlaceResult, type PublicStop } from '@/services/trnstService'
import TransportMap from './TransportMap'
import { PARSE_MESSAGES, parseLocation } from './parseLocation'

type Point = { lat: number; lng: number }

type Props = {
  /** The route's other stops, drawn for reference. */
  stops: Array<Pick<PublicStop, 'id' | 'name' | 'lat' | 'lng'>>
  value: Point | null
  onChange: (point: Point) => void
  /** Pre-filled search text, usually the stop's name. */
  initialQuery?: string
}

const round = (value: number) => Number(value.toFixed(6))

/**
 * Place a stop: paste a spot copied from Google Maps, search a place name, use this
 * device's location, or click the map.
 * Search runs only when asked (OpenStreetMap's search service doesn't allow search-as-you-type).
 */
const StopPlacePicker: React.FC<Props> = ({ stops, value, onChange, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')
  const [pasted, setPasted] = useState('')
  const [pasteNote, setPasteNote] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null)
  const [focus, setFocus] = useState<{ key: string; lat: number; lng: number; zoom?: number } | undefined>()

  // Bias results towards the area the route already covers.
  const near = useMemo(() => {
    const placed = stops.filter((stop) => typeof stop.lat === 'number' && typeof stop.lng === 'number')
    if (!placed.length) return value
    return {
      lat: placed.reduce((sum, stop) => sum + (stop.lat as number), 0) / placed.length,
      lng: placed.reduce((sum, stop) => sum + (stop.lng as number), 0) / placed.length,
    }
  }, [stops, value])

  const choose = (place: Point, zoom = 17) => {
    const point = { lat: round(place.lat), lng: round(place.lng) }
    onChange(point)
    setFocus({ key: `${point.lat},${point.lng},${Date.now()}`, ...point, zoom })
  }

  const search = async () => {
    const text = query.trim()
    if (text.length < 3) {
      setMessage('Type at least 3 letters to search.')
      return
    }
    setSearching(true)
    setMessage('')
    try {
      const found = await trnstService.searchPlaces(text, near)
      setResults(found)
      if (!found.length) {
        setMessage('No place found with that name. Search the town or a nearby landmark, then click the exact spot on the map.')
      } else if (found.length === 1) {
        choose(found[0], 16)
      }
    } catch (error: any) {
      setResults(null)
      setMessage(error?.response?.data?.message || 'Place search is not working right now. Click the map instead.')
    } finally {
      setSearching(false)
    }
  }

  const usePasted = (text: string) => {
    const parsed = parseLocation(text)
    if (!parsed.ok) {
      setPasteNote({ tone: 'warning', text: PARSE_MESSAGES[parsed.reason] })
      return
    }
    choose(parsed, 18)
    setPasteNote(
      parsed.outsideIndia
        ? { tone: 'warning', text: 'This point is outside India. Check you copied the right place.' }
        : parsed.swapped
          ? { tone: 'info', text: 'The two numbers were the wrong way round, so they were swapped. Check the pin is right.' }
          : { tone: 'info', text: 'Pin placed. Check it on the map, then save the point.' }
    )
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setMessage("This browser can't share its location.")
      return
    }
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        choose({ lat: position.coords.latitude, lng: position.coords.longitude }, 18)
      },
      (error) => {
        setLocating(false)
        setMessage(error.code === error.PERMISSION_DENIED
          ? 'Location is blocked for this site. Allow it in the browser settings, or search instead.'
          : 'Could not find this device’s location. Search or click the map instead.')
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    )
  }

  return (
    <div className="tr-picker">
      <form
        className="tr-picker__paste"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          usePasted(pasted)
        }}
      >
        <TextField
          label="Paste from Google Maps"
          hint="In Google Maps, right-click the stop (long-press on a phone) and copy the numbers, or copy the page link."
          placeholder="28.8955, 76.6066 or a Google Maps link"
          icon={ClipboardPaste}
          value={pasted}
          autoComplete="off"
          onChange={(event) => setPasted(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text')
            if (!text) return
            event.preventDefault()
            setPasted(text.trim())
            usePasted(text)
          }}
        />
        <Button type="submit" disabled={!pasted.trim()}>Place pin</Button>
      </form>
      {pasteNote ? <Banner tone={pasteNote.tone}>{pasteNote.text}</Banner> : null}

      <form
        className="tr-picker__search"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void search()
        }}
      >
        <TextField
          aria-label="Search a place"
          placeholder="Search a place, e.g. Jawahar Circle, Jaipur"
          icon={Search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" loading={searching}>Find</Button>
        <Button icon={LocateFixed} loading={locating} onClick={useMyLocation} title="Use where this device is now">
          My location
        </Button>
      </form>

      {message ? <Banner tone="info">{message}</Banner> : null}

      {results && results.length > 1 ? (
        <ul className="tr-list tr-picker__results" aria-label="Places found">
          {results.map((place) => (
            <li key={`${place.lat},${place.lng}`}>
              <button type="button" className="tr-list__row" onClick={() => choose(place)}>
                <span className="tr-entity">
                  <span className="tr-entity__primary">
                    {place.name}
                    {place.kind ? <span className="cb-muted"> · {place.kind}</span> : null}
                  </span>
                  <span className="tr-entity__secondary">{place.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <TransportMap
        label="Choose the stop's position"
        className="tr-map--short"
        stops={stops}
        pick={{ value, onChange }}
        focus={focus}
      />
      <p className="cb-subtle">Search gets you close. Click the map to set the exact spot, or zoom in first.</p>
    </div>
  )
}

export default StopPlacePicker
