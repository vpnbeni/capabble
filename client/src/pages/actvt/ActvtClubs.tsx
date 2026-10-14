import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ImagePlus, Pencil, Plus, SearchX, Shapes, Trash2 } from 'lucide-react'
import api from '@/services/api'
import {
  ClubColorField,
  ClubEditModal,
  ClubLogoCropper,
  ClubLogoTile,
  DEFAULT_CLUB_COLOR,
  type ClubEditRecord,
} from '@/components/actvt/ClubEditModal'
import { Badge, Button, Card, Dialog, EmptyState, FilterBar, Page, Sheet, TextField } from '@/components/ui'
import { isLikelyColor, toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/clubs.css'

type ClubRecord = ClubEditRecord

type ClubFormState = {
  name: string
  color: string
}

const emptyForm = (): ClubFormState => ({
  name: '',
  color: DEFAULT_CLUB_COLOR,
})

const ActvtClubs: React.FC = () => {
  const navigate = useNavigate()
  const [records, setRecords] = useState<ClubRecord[]>([])
  const [form, setForm] = useState<ClubFormState>(emptyForm)
  const [addOpen, setAddOpen] = useState(false)
  const [editingClub, setEditingClub] = useState<ClubRecord | null>(null)
  const [removing, setRemoving] = useState<ClubRecord | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [cropSource, setCropSource] = useState('')
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const cropSourceRef = useRef('')

  const load = async () => {
    setLoading(true)
    try {
      const response = await api.get('/actvt/clubs')
      setRecords((response.data?.data || []) as ClubRecord[])
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load clubs.'))
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    cropSourceRef.current = cropSource
  }, [cropSource])

  useEffect(
    () => () => {
      if (cropSourceRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(cropSourceRef.current)
      }
    },
    []
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter((item) =>
      `${item.name || ''} ${item.tagline || ''} ${item.motto || ''} ${item.color || ''} ${item.incharge || ''} ${item.meetingDay || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }, [query, records])

  const clearCropSource = () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource)
    setCropSource('')
  }

  const clearLogo = () => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoFile(null)
    setLogoPreview('')
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const resetForm = () => {
    setForm(emptyForm())
    clearLogo()
    clearCropSource()
  }

  const handleLogoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file for the club logo.')
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

  const closeAdd = () => {
    if (saving || cropSource) return
    setAddOpen(false)
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) {
      toast.error('Club name is required.')
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

      await api.post('/actvt/clubs', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Club saved.')
      resetForm()
      setAddOpen(false)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to save club.'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    const item = removing
    if (!item?._id) return
    setRemoveBusy(true)
    try {
      await api.delete(`/actvt/clubs/${item._id}`)
      toast.success('Club removed.')
      if (editingClub?._id === item._id) setEditingClub(null)
      setRemoving(null)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove club.'))
    } finally {
      setRemoveBusy(false)
    }
  }

  const openClub = (club: ClubRecord) => {
    if (club._id) navigate(`/actvt/clubs/${club._id}`)
  }

  const countLabel = query.trim()
    ? `${visible.length} of ${records.length} club${records.length === 1 ? '' : 's'}`
    : `${records.length} club${records.length === 1 ? '' : 's'}`

  let content: React.ReactNode
  if (loading && !loaded) {
    content = (
      <Card>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading clubs
        </div>
      </Card>
    )
  } else if (records.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon={Shapes}
          title="No clubs yet"
          body="Add a club with its name, colour and logo, then open it to manage members and activities."
          action={
            <Button icon={Plus} onClick={() => setAddOpen(true)}>
              Add club
            </Button>
          }
        />
      </Card>
    )
  } else if (visible.length === 0) {
    content = (
      <Card>
        <EmptyState
          icon={SearchX}
          title={`No clubs match “${query.trim()}”`}
          body="Search looks at names, taglines, mottos, colours, incharge and meeting days."
          action={<Button onClick={() => setQuery('')}>Clear search</Button>}
        />
      </Card>
    )
  } else {
    content = (
      <ul className="actvt-grid" aria-label="Clubs" aria-busy={loading || undefined}>
        {visible.map((club, index) => {
          const name = club.name || 'Untitled club'
          return (
            <li key={club._id || club.name} className="actvt-card ac-card" style={toneStyle(club.color, index)}>
              <button type="button" className="actvt-card__open" onClick={() => openClub(club)} aria-label={`Open ${name}`}>
                <span className="actvt-card__band" aria-hidden="true" />
                <ClubLogoTile logo={club.logo} name={club.name} className="actvt-card__logo" />
                <span className="actvt-card__body">
                  <span className="actvt-card__name">{name}</span>
                  {club.tagline ? <span className="actvt-card__tagline">{club.tagline}</span> : null}
                  {club.motto ? <span className="actvt-card__motto">“{club.motto}”</span> : null}
                  {club.incharge || club.meetingDay ? (
                    <span className="actvt-card__meta">
                      {club.meetingDay ? (
                        <Badge tone="neutral" dot={false}>
                          Meets {club.meetingDay}
                        </Badge>
                      ) : null}
                      {club.incharge ? (
                        <Badge tone="neutral" dot={false}>
                          {club.incharge}
                        </Badge>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </button>
              <div className="actvt-card__foot">
                <span className="actvt-card__swatch">
                  <span className="actvt-tone-dot" aria-hidden="true" />
                  <span className="ac-truncate">{isLikelyColor(club.color || '') ? club.color : 'No colour saved'}</span>
                </span>
                <span className="actvt-card__actions">
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={Pencil}
                    aria-label={`Edit ${name}`}
                    title="Edit club"
                    onClick={() => setEditingClub(club)}
                  />
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={Trash2}
                    aria-label={`Remove ${name}`}
                    title="Remove club"
                    onClick={() => setRemoving(club)}
                  />
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Page>
      <div className="cb-stack">
        <FilterBar
          search={{ placeholder: 'Search clubs', value: query, onChange: setQuery, label: 'Search clubs' }}
          filters={
            loaded ? (
              <span className="ac-count" aria-live="polite">
                {countLabel}
              </span>
            ) : null
          }
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
              Add club
            </Button>
          }
        />

        {content}
      </div>

      <Sheet
        open={addOpen}
        onClose={closeAdd}
        title="Add club"
        description="Start with the name, colour and logo. Add the tagline, incharge and members from the club page."
        icon={Shapes}
        size="md"
        onSubmit={handleSave}
        footer={
          <>
            <Button variant="secondary" onClick={closeAdd} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Add club
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <div className="ac-logo-field" style={toneStyle(form.color)}>
            <ClubLogoTile logo={logoPreview} name={form.name} className="ac-logo-tile--lg" />
            <div className="ac-logo-field__body">
              <p className="ac-logo-field__label">Club logo</p>
              <p className="ac-logo-field__hint">Optional. Square image; you can crop it after choosing.</p>
              <div className="ac-logo-field__actions">
                <Button size="sm" icon={ImagePlus} onClick={() => logoInputRef.current?.click()}>
                  {logoPreview ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoPreview ? (
                  <Button size="sm" variant="tertiary" icon={Trash2} onClick={clearLogo}>
                    Remove
                  </Button>
                ) : null}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="ac-file-input"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleLogoSelected}
              />
            </div>
          </div>
          <TextField
            label="Club name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. Eco club"
            autoFocus
          />
          <ClubColorField value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => !removeBusy && setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Remove ${removing?.name || 'this club'}?`}
        description="The club and its member roster will be removed from Activities."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={removeBusy}>
              Keep club
            </Button>
            <Button variant="danger" icon={Trash2} loading={removeBusy} onClick={() => void handleRemove()}>
              Remove club
            </Button>
          </>
        }
      />

      <ClubEditModal
        open={Boolean(editingClub)}
        club={editingClub}
        onClose={() => setEditingClub(null)}
        onSaved={() => {
          void load()
        }}
      />

      <ClubLogoCropper imageSrc={cropSource} onCancel={handleCropCancel} onCropped={handleCropped} />
    </Page>
  )
}

export default ActvtClubs
