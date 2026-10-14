import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Pencil, Plus, Shield, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import api from '@/services/api'
import { ImageCropModal } from '@/components/common/ImageCropModal'
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Sheet,
  StatCard,
  TextField,
} from '@/components/ui'
import {
  DEFAULT_HOUSE_COLOR,
  HouseColorField,
  HouseEditModal,
  HouseLogoField,
  houseInitials,
  type HouseEditRecord,
} from '@/components/actvt/HouseEditModal'
import { toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/houses.css'

type HouseRecord = HouseEditRecord

type HouseFormState = {
  name: string
  color: string
}

type GenderSplit = {
  boys: number
  girls: number
}

type HouseStats = {
  totalStudents: number
  assignedStudents: number
  unassignedStudents: number
  byHouse: Array<{
    houseId: string
    houseName: string
    color: string
    logo?: string
    count: number
  }>
  matrix: Array<{
    className: string
    section: string
    houses: Record<string, GenderSplit>
    unassigned: GenderSplit
    total: number
  }>
}

const emptyForm = (): HouseFormState => ({
  name: '',
  color: DEFAULT_HOUSE_COLOR,
})

const emptyGenderSplit = (): GenderSplit => ({ boys: 0, girls: 0 })

const emptyStats = (): HouseStats => ({
  totalStudents: 0,
  assignedStudents: 0,
  unassignedStudents: 0,
  byHouse: [],
  matrix: [],
})

const percentOf = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

const ActvtHouses: React.FC = () => {
  const navigate = useNavigate()
  const [records, setRecords] = useState<HouseRecord[]>([])
  const [stats, setStats] = useState<HouseStats>(emptyStats)
  const [form, setForm] = useState<HouseFormState>(emptyForm)
  const [addOpen, setAddOpen] = useState(false)
  const [nameError, setNameError] = useState('')
  const [editingHouse, setEditingHouse] = useState<HouseRecord | null>(null)
  const [removingHouse, setRemovingHouse] = useState<HouseRecord | null>(null)
  const [removing, setRemoving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [cropSource, setCropSource] = useState('')
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const cropSourceRef = useRef('')

  const loadStats = async () => {
    try {
      const response = await api.get('/actvt/houses/stats')
      setStats((response.data?.data || emptyStats()) as HouseStats)
    } catch {
      setStats(emptyStats())
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const response = await api.get('/actvt/houses')
      setRecords((response.data?.data || []) as HouseRecord[])
      await loadStats()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load houses.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    cropSourceRef.current = cropSource
  }, [cropSource])

  useEffect(() => () => {
    if (cropSourceRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(cropSourceRef.current)
    }
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter((item) =>
      `${item.name || ''} ${item.tagline || ''} ${item.motto || ''} ${item.color || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }, [query, records])

  const countByHouse = useMemo(() => {
    const map = new Map<string, number>()
    stats.byHouse.forEach((entry) => map.set(String(entry.houseId), entry.count))
    return map
  }, [stats.byHouse])

  // Stable fallback colour per house (by position in the full list), used only when no colour is saved.
  const toneIndex = useMemo(() => {
    const map = new Map<string, number>()
    records.forEach((house, index) => map.set(String(house._id || house.name), index))
    return map
  }, [records])

  const largestHouse = useMemo(
    () => stats.byHouse.reduce((max, entry) => Math.max(max, entry.count), 0),
    [stats.byHouse]
  )

  const clearCropSource = () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource)
    setCropSource('')
  }

  const resetForm = () => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setForm(emptyForm())
    setNameError('')
    setLogoFile(null)
    setLogoPreview('')
    clearCropSource()
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const closeAdd = () => {
    if (saving || cropSource) return
    setAddOpen(false)
    resetForm()
  }

  const handleLogoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file for the house logo.')
      event.target.value = ''
      return
    }

    clearCropSource()
    const objectUrl = URL.createObjectURL(file)
    setCropSource(objectUrl)
  }

  const handleCropCancel = () => {
    clearCropSource()
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleCropped = (file: File, previewUrl: string) => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    clearCropSource()
    setLogoFile(file)
    setLogoPreview(previewUrl)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleRemoveLogo = () => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoFile(null)
    setLogoPreview('')
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setNameError('Enter a house name')
      toast.error('House name is required.')
      return
    }

    setSaving(true)
    try {
      const body = new FormData()
      body.append('name', form.name.trim())
      body.append('color', form.color.trim())
      body.append('tagline', '')
      body.append('motto', '')
      if (logoFile) body.append('logo', logoFile)

      await api.post('/actvt/houses', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('House saved.')
      resetForm()
      setAddOpen(false)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save house.'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    const item = removingHouse
    if (!item?._id) return
    setRemoving(true)
    try {
      await api.delete(`/actvt/houses/${item._id}`)
      toast.success('House removed.')
      if (editingHouse?._id === item._id) setEditingHouse(null)
      setRemovingHouse(null)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove house.'))
    } finally {
      setRemoving(false)
    }
  }

  const openHouse = (house: HouseRecord) => {
    if (house._id) navigate(`/actvt/houses/${house._id}`)
  }

  const assignedPct = percentOf(stats.assignedStudents, stats.totalStudents)

  return (
    <Page>
      <div className="cb-stack">
        <div className="cb-stats">
          <StatCard label="Houses" value={records.length} icon={Shield} />
          <StatCard label="All students" value={stats.totalStudents} icon={Users} />
          <StatCard
            label="Assigned to a house"
            value={stats.assignedStudents}
            icon={UserCheck}
            hint={`${assignedPct}% of students`}
            progress={assignedPct}
            progressTone="success"
          />
          <StatCard
            label="Not assigned"
            value={stats.unassignedStudents}
            icon={UserX}
            hint={stats.unassignedStudents > 0 ? 'Assign houses from student records' : 'Every student has a house'}
          />
        </div>

        <Card flush className="ah-list">
          <div className="ah-toolbar">
            <FilterBar
              search={{ placeholder: 'Search houses', value: query, onChange: setQuery, label: 'Search houses' }}
              actions={
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                  Add house
                </Button>
              }
            />
          </div>

          {loading && records.length === 0 ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Loading houses…
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No houses yet"
              body="Add a house with its name, colour and logo. Tagline, motto, teachers and council can be added from the house page."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              compact
              title={`No houses match “${query.trim()}”`}
              body="Try a different name, tagline or colour code."
              action={
                <Button size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="actvt-grid ah-grid" aria-label="Houses">
              {visible.map((house) => {
                const key = String(house._id || house.name)
                const count = countByHouse.get(String(house._id || ''))
                return (
                  <li key={key} className="actvt-card" style={toneStyle(house.color, toneIndex.get(key) ?? 0)}>
                    <button
                      type="button"
                      className="actvt-card__open"
                      onClick={() => openHouse(house)}
                      aria-label={`Open ${house.name || 'house'}`}
                    >
                      <span className="actvt-card__band" aria-hidden="true" />
                      <span className="actvt-card__logo">
                        {house.logo ? (
                          <img src={house.logo} alt="" />
                        ) : (
                          <span className="actvt-card__initials" aria-hidden="true">
                            {houseInitials(house.name)}
                          </span>
                        )}
                      </span>
                      <span className="actvt-card__body">
                        <span className="actvt-card__name">{house.name || 'Untitled house'}</span>
                        <span className="actvt-card__tagline">{house.tagline || 'No tagline yet'}</span>
                        {house.motto ? <span className="actvt-card__motto">“{house.motto}”</span> : null}
                        <span className="actvt-card__meta">
                          <Badge tone="neutral" dot={false}>
                            {count ?? 0} student{count === 1 ? '' : 's'}
                          </Badge>
                        </span>
                      </span>
                    </button>
                    <div className="actvt-card__foot">
                      <span className="actvt-card__swatch">
                        <span className="actvt-tone-dot" aria-hidden="true" />
                        <span className="ah-truncate">{house.color || 'No colour set'}</span>
                      </span>
                      <span className="actvt-card__actions">
                        <Menu
                          label={`More actions for ${house.name || 'house'}`}
                          items={[
                            { label: 'Edit house', icon: Pencil, onSelect: () => setEditingHouse(house) },
                            { divider: true },
                            {
                              label: 'Remove house',
                              icon: Trash2,
                              tone: 'danger',
                              onSelect: () => setRemovingHouse(house),
                            },
                          ]}
                        />
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {stats.byHouse.length > 0 ? (
          <Card title="Students per house" subtitle="How evenly students are spread across houses">
            <ul className="ah-dist">
              {stats.byHouse.map((entry, index) => (
                <li
                  key={entry.houseId}
                  className="ah-dist__row"
                  style={toneStyle(entry.color, toneIndex.get(String(entry.houseId)) ?? index)}
                >
                  <span className="ah-dist__name">
                    <span className="actvt-tone-dot" aria-hidden="true" />
                    <span className="ah-truncate">{entry.houseName}</span>
                  </span>
                  <span className="ah-dist__track" aria-hidden="true">
                    <span
                      className="ah-dist__fill"
                      style={{ width: `${largestHouse > 0 ? (entry.count / largestHouse) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="ah-dist__value">
                    {entry.count}
                    <span className="ah-dist__pct">{percentOf(entry.count, stats.totalStudents)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card
          flush
          title="Students by class and section"
          subtitle="House strength for each class and section, split into boys and girls"
        >
          {stats.matrix.length === 0 ? (
            <EmptyState
              compact
              icon={Users}
              title="No class or section data yet"
              body="Counts appear here once students with a class and section are added in student records."
            />
          ) : (
            <div className="cb-table-scroll ah-matrix-scroll">
              <table className="cb-table ah-matrix">
                <caption className="cb-visually-hidden">Students by class, section and house</caption>
                <thead>
                  <tr>
                    <th rowSpan={2} scope="col" className="ah-matrix__sticky ah-matrix__class">
                      Class
                    </th>
                    <th rowSpan={2} scope="col" className="ah-matrix__sticky ah-matrix__section">
                      Section
                    </th>
                    {records.map((house) => {
                      const key = String(house._id || house.name)
                      return (
                        <th
                          key={key}
                          colSpan={2}
                          scope="colgroup"
                          className="ah-matrix__group"
                          style={toneStyle(house.color, toneIndex.get(key) ?? 0)}
                        >
                          <span className="ah-matrix__house">
                            <span className="actvt-tone-dot" aria-hidden="true" />
                            {house.name}
                          </span>
                        </th>
                      )
                    })}
                    <th colSpan={2} scope="colgroup" className="ah-matrix__group">
                      Not assigned
                    </th>
                    <th rowSpan={2} scope="col" className="ah-matrix__num">
                      Total
                    </th>
                  </tr>
                  <tr>
                    {records.map((house) => (
                      <React.Fragment key={`${house._id}-split`}>
                        <th scope="col" className="ah-matrix__num ah-matrix__first">Boys</th>
                        <th scope="col" className="ah-matrix__num">Girls</th>
                      </React.Fragment>
                    ))}
                    <th scope="col" className="ah-matrix__num ah-matrix__first">Boys</th>
                    <th scope="col" className="ah-matrix__num">Girls</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.matrix.map((row) => (
                    <tr key={`${row.className}-${row.section}`}>
                      <th scope="row" className="ah-matrix__sticky ah-matrix__class">{row.className}</th>
                      <td className="ah-matrix__sticky ah-matrix__section">{row.section}</td>
                      {records.map((house) => {
                        const houseId = String(house._id || '')
                        return <GenderSplitCells key={houseId} split={row.houses[houseId]} />
                      })}
                      <GenderSplitCells split={row.unassigned} warn />
                      <td className="ah-matrix__num ah-matrix__total">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Sheet
        open={addOpen}
        onClose={closeAdd}
        title="Add house"
        description="Pick the colour that matches the house logo. Tagline and motto can be added later."
        icon={Shield}
        onSubmit={handleSave}
        footer={
          <>
            <Button size="sm" variant="tertiary" onClick={closeAdd} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={saving}>
              Add house
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <HouseLogoField
            preview={logoPreview}
            name={form.name}
            color={form.color}
            onPick={() => logoInputRef.current?.click()}
            onRemove={handleRemoveLogo}
          />
          <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={handleLogoSelected} />
          <TextField
            label="House name"
            required
            value={form.name}
            placeholder="For example, Mars"
            error={nameError || undefined}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value })
              if (nameError) setNameError('')
            }}
          />
          <HouseColorField value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removingHouse)}
        onClose={() => !removing && setRemovingHouse(null)}
        tone="danger"
        size="sm"
        title={`Remove ${removingHouse?.name || 'this house'}?`}
        description="The house no longer appears in Activities. Student records are not changed."
        footer={
          <>
            <Button variant="tertiary" onClick={() => setRemovingHouse(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={removing} onClick={() => void handleRemove()}>
              Remove house
            </Button>
          </>
        }
      />

      <HouseEditModal
        open={Boolean(editingHouse)}
        house={editingHouse}
        onClose={() => setEditingHouse(null)}
        onSaved={() => {
          void load()
        }}
      />

      <ImageCropModal
        open={Boolean(cropSource)}
        imageSrc={cropSource}
        title="Crop house logo"
        aspect={1}
        onCancel={handleCropCancel}
        onCropped={handleCropped}
      />
    </Page>
  )
}

const GenderSplitCells = ({ split, warn = false }: { split?: GenderSplit; warn?: boolean }) => {
  const value = split || emptyGenderSplit()
  const empty = value.boys === 0 && value.girls === 0
  const cls = `ah-matrix__num${warn && !empty ? ' is-warn' : ''}`

  return (
    <>
      <td className={`${cls} ah-matrix__first`}>{empty ? '—' : value.boys}</td>
      <td className={cls}>{empty ? '—' : value.girls}</td>
    </>
  )
}

export default ActvtHouses
