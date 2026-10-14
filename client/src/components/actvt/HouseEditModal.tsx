import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ImagePlus, Pencil, Trash2 } from 'lucide-react'
import api from '@/services/api'
import { ImageCropModal } from '@/components/common/ImageCropModal'
import { Button, Sheet, TextField, initials } from '@/components/ui'
import { isLikelyColor, toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/houses.css'

export type HouseEditRecord = {
  _id?: string
  name?: string
  logo?: string
  tagline?: string
  motto?: string
  color?: string
  flag?: string
  teachers?: unknown
  councilMembers?: unknown
}

type HouseEditForm = {
  name: string
  tagline: string
  motto: string
  color: string
}

/** Default for a new house before the school picks its own colour. */
export const DEFAULT_HOUSE_COLOR = '#3A7AE1'

export const houseInitials = (name = '') => initials(name) || 'H'

/** Colour picker plus hex field. The swatch shows the house colour exactly as typed. */
export const HouseColorField: React.FC<{
  value: string
  onChange: (value: string) => void
  label?: string
}> = ({ value, onChange, label = 'Colour' }) => (
  <div className="cb-field">
    <span className="cb-field__label">{label}</span>
    <div className="actvt-colorfield">
      <input
        type="color"
        value={isLikelyColor(value) ? value : DEFAULT_HOUSE_COLOR}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Pick house colour"
      />
      <TextField
        aria-label="House colour hex code"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="#3A7AE1"
        error={value && !isLikelyColor(value) ? 'Use a hex code such as #FF0000' : undefined}
      />
    </div>
  </div>
)

/** Logo preview with upload / replace / remove controls. */
export const HouseLogoField: React.FC<{
  preview: string
  name: string
  color: string
  onPick: () => void
  onRemove?: () => void
}> = ({ preview, name, color, onPick, onRemove }) => (
  <div className="cb-field">
    <span className="cb-field__label">Logo</span>
    <div className="ah-logofield" style={toneStyle(color)}>
      <div className="ah-logofield__preview">
        {preview ? (
          <img src={preview} alt={name ? `${name} logo` : 'House logo'} />
        ) : (
          <span className="ah-logofield__initials actvt-tone-fill" aria-hidden="true">
            {houseInitials(name)}
          </span>
        )}
      </div>
      <div className="ah-logofield__side">
        <div className="ah-logofield__actions">
          <Button size="sm" icon={ImagePlus} onClick={onPick}>
            {preview ? 'Replace logo' : 'Upload logo'}
          </Button>
          {preview && onRemove ? (
            <Button size="sm" variant="tertiary" icon={Trash2} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
        <p className="ah-logofield__hint">Square image works best. You can crop it after choosing.</p>
      </div>
    </div>
  </div>
)

type HouseEditModalProps = {
  open: boolean
  house: HouseEditRecord | null
  onClose: () => void
  onSaved: (house: HouseEditRecord) => void
}

export const HouseEditModal: React.FC<HouseEditModalProps> = ({
  open,
  house,
  onClose,
  onSaved,
}) => {
  const [form, setForm] = useState<HouseEditForm>({
    name: '',
    tagline: '',
    motto: '',
    color: DEFAULT_HOUSE_COLOR,
  })
  const [logoPreview, setLogoPreview] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [clearLogo, setClearLogo] = useState(false)
  const [cropSource, setCropSource] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const cropSourceRef = useRef('')

  useEffect(() => {
    if (!open || !house) return
    setForm({
      name: String(house.name || ''),
      tagline: String(house.tagline || ''),
      motto: String(house.motto || ''),
      color: String(house.color || DEFAULT_HOUSE_COLOR),
    })
    setLogoPreview(String(house.logo || ''))
    setLogoFile(null)
    setClearLogo(false)
    setCropSource('')
    setNameError('')
    if (logoInputRef.current) logoInputRef.current.value = ''
  }, [open, house])

  useEffect(() => {
    cropSourceRef.current = cropSource
  }, [cropSource])

  useEffect(() => () => {
    if (cropSourceRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(cropSourceRef.current)
    }
  }, [])

  const clearCropSource = () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource)
    setCropSource('')
  }

  // The sheet stays open while the crop step is showing or a save is in flight.
  const handleClose = () => {
    if (saving || cropSource) return
    onClose()
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
    if (!house?._id) return
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
      body.append('tagline', form.tagline.trim())
      body.append('motto', form.motto.trim())
      if (logoFile) body.append('logo', logoFile)
      if (clearLogo && !logoFile) body.append('clearLogo', 'true')

      const response = await api.put(`/actvt/houses/${house._id}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('House updated.')
      onSaved((response.data?.data || { ...house, ...form, logo: logoPreview }) as HouseEditRecord)
      onClose()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to update house.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet
        open={open && Boolean(house?._id)}
        onClose={handleClose}
        title="Edit house"
        description="Name, colour and logo appear on house cards, certificates and reports."
        icon={Pencil}
        onSubmit={handleSave}
        footer={
          <>
            <Button size="sm" variant="tertiary" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" loading={saving}>
              Save changes
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
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleLogoSelected}
          />
          <TextField
            label="House name"
            required
            value={form.name}
            error={nameError || undefined}
            onChange={(event) => {
              setForm({ ...form, name: event.target.value })
              if (nameError) setNameError('')
            }}
          />
          <HouseColorField value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        <div className="cb-form-section">
          <TextField
            label="Tagline"
            value={form.tagline}
            onChange={(event) => setForm({ ...form, tagline: event.target.value })}
            placeholder="For example, Courage and honour"
          />
          <TextField
            label="Motto"
            value={form.motto}
            onChange={(event) => setForm({ ...form, motto: event.target.value })}
          />
        </div>
      </Sheet>

      <ImageCropModal
        open={Boolean(cropSource)}
        imageSrc={cropSource}
        title="Crop house logo"
        aspect={1}
        onCancel={() => {
          clearCropSource()
          if (logoInputRef.current) logoInputRef.current.value = ''
        }}
        onCropped={handleCropped}
      />
    </>
  )
}

export default HouseEditModal
