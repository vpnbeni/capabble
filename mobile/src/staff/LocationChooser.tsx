import { useState } from 'react'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useAssetLocations } from '@/staff/assetQueries'
import { OptionList, SearchBar } from '@/ui'

/** "Main block › First floor" for a room: its parents, without the campus or the room itself. */
const parentsOf = (path = '') => path.split(' › ').slice(1, -1).join(' › ')

/** Pick a room or store from the school's locations, with a search for long lists. Goes in a BottomSheet. */
export function LocationChooser({ value, onChange, anyLabel, exclude }: { value: string | null; onChange: (id: string) => void; anyLabel?: string; exclude?: string }) {
  const locations = useAssetLocations()
  const [query, setQuery] = useState('')
  if (locations.isPending) return <CardSkeleton rows={4} />
  if (locations.isError) return <LoadFailed what="Places" error={locations.error} onRetry={locations.refetch} />
  const needle = query.trim().toLowerCase()
  const rows = (locations.data ?? []).filter((row) => row._id !== exclude && (!needle || `${row.name} ${row.path ?? ''}`.toLowerCase().includes(needle)))
  return (
    <>
      {(locations.data?.length ?? 0) > 8 ? <SearchBar label="Search places" placeholder="Room, block or store" value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
      <OptionList
        label="Place"
        value={value}
        onChange={onChange}
        options={[
          ...(anyLabel && !needle ? [{ value: '', label: anyLabel }] : []),
          ...rows.map((row) => ({ value: row._id, label: row.name, meta: [parentsOf(row.path), row.isStore ? 'Store' : row.type].filter(Boolean).join(' · ') || undefined })),
        ]}
      />
    </>
  )
}
