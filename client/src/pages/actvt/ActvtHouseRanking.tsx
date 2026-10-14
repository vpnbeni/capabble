import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ListOrdered, Trash2, Trophy } from 'lucide-react'
import api from '@/services/api'
import { Banner, Button, Card, Dialog, EmptyState, Page, Select, TextField, formatDate, initials } from '@/components/ui'
import { isLikelyColor, toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/sports.css'

type HouseOption = {
  _id?: string
  name?: string
  color?: string
  logo?: string
}

type PointsEntry = {
  _id?: string
  title?: string
  date?: string
  houseId?: string
  houseName?: string
  houseColor?: string
  points?: number
  category?: string
  notes?: string
}

type Standing = {
  houseId: string
  houseName: string
  houseColor: string
  logo?: string
  totalPoints: number
  entries: number
  rank: number
}

type PointsForm = {
  title: string
  date: string
  houseId: string
  points: string
  category: string
  notes: string
}

const emptyForm = (): PointsForm => ({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  houseId: '',
  points: '',
  category: 'Inter-house',
  notes: '',
})

const PLACE_LABELS = ['First place', 'Second place', 'Third place']

const formatPoints = (value?: number) => {
  const points = Number(value || 0)
  return points > 0 ? `+${points}` : String(points)
}

const ActvtHouseRanking: React.FC = () => {
  const [houses, setHouses] = useState<HouseOption[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [recent, setRecent] = useState<PointsEntry[]>([])
  const [form, setForm] = useState<PointsForm>(emptyForm())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<PointsEntry | null>(null)
  const [removing, setRemoving] = useState(false)

  const houseMap = useMemo(() => {
    const map = new Map<string, HouseOption>()
    houses.forEach((house) => map.set(String(house._id), house))
    return map
  }, [houses])

  const load = async () => {
    setLoading(true)
    try {
      const [housesRes, rankingRes] = await Promise.all([
        api.get('/actvt/houses'),
        api.get('/actvt/ranking'),
      ])
      setHouses((housesRes.data?.data || []) as HouseOption[])
      setStandings((rankingRes.data?.data?.standings || []) as Standing[])
      setRecent((rankingRes.data?.data?.recent || []) as PointsEntry[])
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load ranking.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) {
      toast.error('Activity title is required.')
      return
    }
    if (!form.houseId) {
      toast.error('Please select a house.')
      return
    }
    const pointsValue = Number(form.points)
    if (!Number.isFinite(pointsValue)) {
      toast.error('Enter a valid points value.')
      return
    }

    const house = houseMap.get(form.houseId)
    setSaving(true)
    try {
      await api.post('/actvt/points', {
        title: form.title.trim(),
        date: form.date,
        houseId: form.houseId,
        houseName: house?.name || '',
        houseColor: house?.color || '',
        points: pointsValue,
        category: form.category.trim() || 'Inter-house',
        notes: form.notes.trim(),
      })
      toast.success('Points recorded.')
      setForm(emptyForm())
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save points.'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (item: PointsEntry) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/points/${item._id}`)
      toast.success('Entry removed.')
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove entry.'))
    }
  }

  const houseIndex = useMemo(() => {
    const map = new Map<string, number>()
    houses.forEach((house, index) => map.set(String(house._id), index))
    return map
  }, [houses])

  /** The house's own colour as stored; the entry's snapshot if the house has none. */
  const houseTone = (houseId?: string, snapshot?: string, position = 0) => {
    const house = houseId ? houseMap.get(String(houseId)) : undefined
    const color = isLikelyColor(house?.color || '') ? house?.color : snapshot
    const index = houseId && houseIndex.has(String(houseId)) ? houseIndex.get(String(houseId))! : position
    return toneStyle(color, index)
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    setRemoving(true)
    try {
      await handleRemove(pendingRemove)
    } finally {
      setRemoving(false)
      setPendingRemove(null)
    }
  }

  const maxPoints = Math.max(...standings.map((item) => item.totalPoints), 1)
  const podium = standings.length > 1 ? standings.slice(0, 3) : []
  const activityLabel = (count: number) => `${count} ${count === 1 ? 'activity' : 'activities'}`

  return (
    <Page>
      <Card title="House standings" subtitle="Total points from every recorded activity">
        {loading && standings.length === 0 ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading rankings…
          </div>
        ) : standings.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No house points yet"
            body="Record points for an activity below to start the leaderboard."
          />
        ) : (
          <>
            {podium.length ? (
              <ol className="asp-podium" aria-label="Top houses">
                {podium.map((house, index) => (
                  <li
                    key={house.houseId}
                    className="asp-podium__item"
                    style={houseTone(house.houseId, house.houseColor, index)}
                  >
                    <span className="asp-podium__logo" aria-hidden="true">
                      {house.logo ? (
                        <img src={house.logo} alt="" />
                      ) : (
                        <span className="asp-podium__initials">{initials(house.houseName) || '?'}</span>
                      )}
                    </span>
                    <span className="asp-podium__main">
                      <span className="asp-podium__place">{PLACE_LABELS[house.rank - 1] || `Rank ${house.rank}`}</span>
                      <span className="asp-podium__name">{house.houseName}</span>
                    </span>
                    <span className="asp-podium__points">
                      {house.totalPoints}
                      <small>points</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}

            <ol className="asp-bars" aria-label="All houses by points">
              {standings.map((house, index) => (
                <li key={house.houseId} style={houseTone(house.houseId, house.houseColor, index)}>
                  <span className="asp-bars__rank" aria-label={`Rank ${house.rank}`}>
                    {house.rank}
                  </span>
                  <span className="asp-bars__label">
                    <span className="asp-bars__name">{house.houseName}</span>
                    <span className="asp-bars__meta">{activityLabel(house.entries)}</span>
                  </span>
                  <span className="asp-bars__track" aria-hidden="true">
                    <span
                      className="asp-bars__fill"
                      style={{ width: `${Math.max((house.totalPoints / maxPoints) * 100, 4)}%` }}
                    />
                  </span>
                  <span className="asp-bars__value">{house.totalPoints}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>

      <div className="asp-split">
        <Card title="Record house points" subtitle="Award or deduct points for an activity">
          <form className="asp-form" onSubmit={handleSave} noValidate>
            {!loading && houses.length === 0 ? (
              <Banner tone="warning" title="No houses yet">
                Create houses first to record ranking points.
              </Banner>
            ) : null}
            <TextField
              label="Activity or event"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Annual sports relay"
            />
            <div className="cb-form-grid">
              <TextField
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
              <TextField
                label="Points"
                required
                type="number"
                inputMode="numeric"
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
                placeholder="10"
                hint="Use a minus sign to deduct."
              />
            </div>
            <Select
              label="House"
              required
              value={form.houseId}
              onChange={(e) => setForm({ ...form, houseId: e.target.value })}
              placeholder="Select house"
              options={houses
                .filter((house) => house._id)
                .map((house) => ({ value: String(house._id), label: house.name || 'Untitled house' }))}
            />
            <TextField
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Inter-house, cultural or sports"
            />
            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
            />
            <div className="asp-form__actions">
              <Button variant="primary" type="submit" loading={saving} disabled={houses.length === 0}>
                Add points
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Points log" subtitle={`${recent.length} recent ${recent.length === 1 ? 'entry' : 'entries'}`} className="asp-logcard">
          {loading && recent.length === 0 ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Loading entries…
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={ListOrdered}
              title="No points recorded yet"
              body="Entries appear here as you add points for each house."
              compact
            />
          ) : (
            <ul className="asp-log">
              {recent.map((item, index) => {
                const points = Number(item.points || 0)
                const house = item.houseId ? houseMap.get(String(item.houseId)) : undefined
                return (
                  <li key={item._id || index}>
                    <div className="asp-log__main">
                      <span className="asp-log__title">{item.title || 'Untitled activity'}</span>
                      <span className="asp-log__meta">
                        <span className="asp-swatchname" style={houseTone(item.houseId, item.houseColor, index)}>
                          <span className="actvt-tone-dot" aria-hidden="true" />
                          <span>{house?.name || item.houseName || 'House'}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.date ? formatDate(item.date) : 'No date'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.category || 'Inter-house'}</span>
                      </span>
                    </div>
                    <span className={`asp-log__points${points < 0 ? ' is-negative' : ''}`}>{formatPoints(points)}</span>
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon={Trash2}
                      aria-label={`Remove points entry ${item.title || ''}`.trim()}
                      onClick={() => setPendingRemove(item)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Dialog
        open={Boolean(pendingRemove)}
        onClose={() => (removing ? undefined : setPendingRemove(null))}
        tone="danger"
        size="sm"
        title={`Remove ${pendingRemove?.title || 'this'} entry?`}
        description={`The ${formatPoints(pendingRemove?.points)} points it gave ${pendingRemove?.houseName || 'the house'} no longer count towards the standings. This can't be undone.`}
        footer={
          <>
            <Button onClick={() => setPendingRemove(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" loading={removing} onClick={() => void confirmRemove()}>
              Remove entry
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ActvtHouseRanking
