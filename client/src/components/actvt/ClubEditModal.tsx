import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { ImagePlus, Pencil, Trash2 } from 'lucide-react'
import api from '@/services/api'
import { ImageCropModal } from '@/components/common/ImageCropModal'
import { Button, Sheet, TextArea, TextField } from '@/components/ui'
import { isLikelyColor, toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/clubs.css'

export type ClubEditRecord = {
  _id?: string
  name?: string
  logo?: string
  tagline?: string
  motto?: string
  color?: string
  incharge?: string
  meetingDay?: string
  description?: string
  members?: string
  activities?: string
}

type ClubEditForm = {
  name: string
  tagline: string
  motto: string
  color: string
  incharge: string
  meetingDay: string
  description: string
}

/** Colour a new club starts with until the school picks one. */
export const DEFAULT_CLUB_COLOR = '#4f46e5'

export const clubInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'C'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

/**
 * The shared crop modal is an inline `fixed z-[80]` overlay; kit Sheets and Dialogs sit at
 * z-index 100 in a body portal. Portal the cropper into its own layer above them.
 */
export const ClubLogoCropper: React.FC<{
  imageSrc: string
  onCancel: () => void
  onCropped: (file: File, previewUrl: string) => void
}> = ({ imageSrc, onCancel, onCropped }) => {
  if (!imageSrc || typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'relative', zIndex: 120 }}>
      <ImageCropModal
        open
        imageSrc={imageSrc}
        title="Crop club logo"
        aspect={1}
        onCancel={onCancel}
        onCropped={onCropped}
      />
    </div>,
    document.body
  )
}

/** Logo tile: the uploaded image, or initials on the club's own colour. */
export const ClubLogoTile: React.FC<{ logo?: string; name?: string; className?: string }> = ({ logo, name, className }) => (
  <span className={className ? `ac-logo-tile ${className}` : 'ac-logo-tile'}>
    {logo ? (
      <img src={logo} alt={name ? `${name} logo` : 'Club logo'} />
    ) : (
      <span className="ac-logo-tile__initials actvt-tone-fill" aria-hidden="true">
        {clubInitials(name)}
      </span>
    )}
  </span>
)

/** Colour picker + hex field, used by the add and edit sheets. */
export const ClubColorField: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const labelId = useId()
  return (
  <div className="cb-field">
    <span className="cb-field__label" id={labelId}>
      Colour
    </span>
    <div className="actvt-colorfield">
      <input
        type="color"
        value={isLikelyColor(value) ? value : DEFAULT_CLUB_COLOR}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Pick club colour"
      />
      <TextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={DEFAULT_CLUB_COLOR}
        aria-labelledby={labelId}
      />
    </div>
    <div className="cb-field__hint">Match the club logo. Shown on its card and profile.</div>
  </div>
  )
}

type ClubEditModalProps = {
  open: boolean
  club: ClubEditRecord | null
  onClose: () => void
  onSaved: (club: ClubEditRecord) => void
}

export const ClubEditModal: React.FC<ClubEditModalProps> = ({ open, club, onClose, onSaved }) => {
  const [form, setForm] = useState<ClubEditForm>({
    name: '',
    tagline: '',
    motto: '',
    color: DEFAULT_CLUB_COLOR,
    incharge: '',
    meetingDay: '',
    description: '',
  })
  const [logoPreview, setLogoPreview] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [clearLogo, setClearLogo] = useState(false)
  const [cropSource, setCropSource] = useState('')
  const [saving, setSaving] = useState(false)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const cropSourceRef = useRef('')

  useEffect(() => {
    if (!open || !club) return
    setForm({
      name: String(club.name || ''),
      tagline: String(club.tagline || ''),
      motto: String(club.motto || ''),
      color: String(club.color || DEFAULT_CLUB_COLOR),
      incharge: String(club.incharge || ''),
      meetingDay: String(club.meetingDay || ''),
      description: String(club.description || ''),
    })
    setLogoPreview(String(club.logo || ''))
    setLogoFile(null)
    setClearLogo(false)
    setCropSource('')
    if (logoInputRef.current) logoInputRef.current.value = ''
  }, [open, club])

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

  const visible = open && Boolean(club?._id)

  const clearCropSource = () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource)
    setCropSource('')
  }

  const requestClose = () => {
    if (saving || cropSource) return
    onClose()
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
    setCropSource(URL.createObjectURL(file))
  }

  const handleCropped = (file: File, previewUrl: string) => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    clearCropSource()
    setLogoFile(file)
    setLogoPreview(previewUrl)
    setClearLogo(false)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleRemoveLogo = () => {
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoFile(null)
    setLogoPreview('')
    setClearLogo(true)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!club?._id) return
    if (!form.name.trim()) {
      toast.error('Club name is required.')
      return
    }

    setSaving(true)
    try {
      const body = new FormData()
      body.append('name', form.name.trim())
      body.append('color', form.color.trim())
      body.append('tagline', form.tagline.trim())
      body.append('motto', form.motto.trim())
      body.append('incharge', form.incharge.trim())
      body.append('meetingDay', form.meetingDay.trim())
      body.append('description', form.description.trim())
      body.append('members', String(club.members || ''))
      body.append('activities', String(club.activities || ''))
      if (logoFile) body.append('logo', logoFile)
      if (clearLogo && !logoFile) body.append('clearLogo', 'true')

      const response = await api.put(`/actvt/clubs/${club._id}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Club updated.')
      onSaved((response.data?.data || { ...club, ...form, logo: logoPreview }) as ClubEditRecord)
      onClose()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to update club.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet
        open={visible}
        onClose={requestClose}
        title="Edit club"
        description={club?.name ? `Update ${club.name}'s identity and details.` : undefined}
        icon={Pencil}
        size="md"
        onSubmit={handleSave}
        footer={
          <>
            <Button variant="secondary" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <p className="cb-form-section__title">Identity</p>
          <div className="ac-logo-field" style={toneStyle(form.color)}>
            <ClubLogoTile logo={logoPreview} name={form.name} className="ac-logo-tile--lg" />
            <div className="ac-logo-field__body">
              <p className="ac-logo-field__label">Club logo</p>
              <p className="ac-logo-field__hint">Square image. You can crop it after choosing.</p>
              <div className="ac-logo-field__actions">
                <Button size="sm" icon={ImagePlus} onClick={() => logoInputRef.current?.click()}>
                  {logoPreview ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoPreview ? (
                  <Button size="sm" variant="tertiary" icon={Trash2} onClick={handleRemoveLogo}>
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
          />
          <ClubColorField value={form.color} onChange={(color) => setForm({ ...form, color })} />
          <div className="cb-form-grid">
            <TextField
              label="Tagline"
              value={form.tagline}
              onChange={(event) => setForm({ ...form, tagline: event.target.value })}
            />
            <TextField
              label="Motto"
              value={form.motto}
              onChange={(event) => setForm({ ...form, motto: event.target.value })}
            />
          </div>
        </div>

        <div className="cb-form-section">
          <p className="cb-form-section__title">Running the club</p>
          <div className="cb-form-grid">
            <TextField
              label="Teacher incharge"
              value={form.incharge}
              onChange={(event) => setForm({ ...form, incharge: event.target.value })}
              placeholder="Teacher name"
            />
            <TextField
              label="Meeting day"
              value={form.meetingDay}
              onChange={(event) => setForm({ ...form, meetingDay: event.target.value })}
              placeholder="e.g. Friday"
            />
          </div>
          <TextArea
            label="Description"
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
      </Sheet>

      <ClubLogoCropper
        imageSrc={cropSource}
        onCancel={() => {
          clearCropSource()
          if (logoInputRef.current) logoInputRef.current.value = ''
        }}
        onCropped={handleCropped}
      />
    </>
  )
}

export default ClubEditModal
