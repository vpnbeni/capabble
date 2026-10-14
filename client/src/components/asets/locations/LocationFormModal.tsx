import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, MapPin, Pencil } from 'lucide-react'
import asetsService from '@/services/asetsService'
import { Banner, Button, Select, Sheet, TextArea, TextField } from '@/components/ui'
import {
  LOCATION_TYPES,
  ROOM_TYPES,
  childTypeForParent,
  normalizeLocationType,
  type LocationType,
} from '@/constants/locationConstants'
import { sortSectionNames } from '@/constants/studentClasses'
import './locations.css'

type ParentContext = { _id: string; name: string; type: string; pathSegments?: { name: string }[] }

type SuccessAction = {
  label: string
  kind: 'another' | 'child' | 'done'
  type: LocationType
  parentId?: string
}

type Props = {
  open: boolean
  initialType?: LocationType
  parent?: ParentContext | null
  editRecord?: any | null
  onClose: () => void
  onSaved: (created?: any) => void
}

type Errors = Partial<Record<'name' | 'roomNumber' | 'roomType', string>>

const emptyForm = (type: LocationType, parentId = '') => ({
  type,
  name: '',
  code: '',
  address: '',
  floorNumber: '',
  roomNumber: '',
  className: '',
  section: '',
  description: '',
  roomType: 'Classroom',
  capacityHint: '',
  locationStatus: 'Active',
  parentId,
})

const lower = (type: string) => type.toLowerCase()

/** Add or edit a campus, block, floor or room. A kit Sheet (portal), not an inline overlay. */
const LocationFormModal: React.FC<Props> = ({ open, initialType = 'Campus', parent, editRecord, onClose, onSaved }) => {
  const isEdit = Boolean(editRecord?._id)
  const [form, setForm] = useState(emptyForm(initialType, parent?._id || ''))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [successActions, setSuccessActions] = useState<SuccessAction[] | null>(null)
  const [lastCreated, setLastCreated] = useState<any>(null)
  const [classSectionOptions, setClassSectionOptions] = useState<{ className: string; sections: string[] }[]>([])
  const [loadingClassSections, setLoadingClassSections] = useState(false)

  useEffect(() => {
    if (!open) return
    const roomType = editRecord
      ? normalizeLocationType(editRecord.type)
      : (initialType || (parent ? childTypeForParent(normalizeLocationType(parent.type)) : 'Campus') || 'Campus')
    if (roomType !== 'Room') return
    setLoadingClassSections(true)
    void asetsService.getLocationClassSections()
      .then(setClassSectionOptions)
      .catch(() => toast.error('Could not load class and section options.'))
      .finally(() => setLoadingClassSections(false))
  }, [open, initialType, parent, editRecord])

  const availableSections = useMemo(() => {
    const match = classSectionOptions.find((item) => item.className === form.className)
    if (!match) return []
    return [...match.sections].sort((a, b) => sortSectionNames(a, b, form.className))
  }, [classSectionOptions, form.className])

  useEffect(() => {
    if (!open) return
    setSuccessActions(null)
    setLastCreated(null)
    setErrors({})
    if (editRecord) {
      setForm({
        type: normalizeLocationType(editRecord.type) as LocationType,
        name: editRecord.name || '',
        code: editRecord.code || '',
        address: editRecord.address || '',
        floorNumber: editRecord.floorNumber || '',
        roomNumber: editRecord.roomNumber || '',
        className: editRecord.className || '',
        section: editRecord.section || '',
        description: editRecord.notes || '',
        roomType: editRecord.roomType || 'Other',
        capacityHint: editRecord.capacityHint ? String(editRecord.capacityHint) : '',
        locationStatus: editRecord.locationStatus || (editRecord.isActive === false ? 'Inactive' : 'Active'),
        parentId: editRecord.parentId || parent?._id || '',
      })
      return
    }
    const type = initialType || (parent ? childTypeForParent(normalizeLocationType(parent.type)) : 'Campus') || 'Campus'
    setForm(emptyForm(type as LocationType, parent?._id || ''))
  }, [open, initialType, parent, editRecord])

  const typeName = String(form.type)
  const title = isEdit ? `Edit ${lower(typeName)}` : `Add ${lower(typeName)}`
  const breadcrumb = useMemo(
    () => parent?.pathSegments?.map((segment) => segment.name).join(' › ') || parent?.name || '',
    [parent]
  )
  const description = successActions
    ? undefined
    : parent && !isEdit
      ? `Inside ${breadcrumb || parent.name}`
      : isEdit
        ? 'Changes apply to this location only.'
        : 'Start with a campus, then add blocks, floors and rooms inside it.'

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    const keys = Object.keys(patch) as Array<keyof Errors>
    if (keys.some((key) => errors[key])) setErrors((prev) => {
      const next = { ...prev }
      keys.forEach((key) => delete next[key])
      return next
    })
  }

  const validate = (): Errors => {
    const next: Errors = {}
    if (!form.name.trim()) next.name = form.type === 'Room' ? 'Enter the room name.' : `Enter the ${lower(typeName)} name.`
    if (form.type === 'Room' && !form.roomNumber.trim()) next.roomNumber = 'Enter the room number.'
    if (form.type === 'Room' && !form.roomType) next.roomType = 'Choose a room type.'
    return next
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        code: form.code.trim(),
        type: form.type,
        parentId: form.type === 'Campus' ? null : form.parentId || parent?._id || null,
        notes: form.description,
        address: form.address,
        floorNumber: form.floorNumber,
        roomNumber: form.type === 'Room' ? form.roomNumber.trim() : undefined,
        className: form.type === 'Room' ? form.className.trim() : '',
        section: form.type === 'Room' ? form.section.trim() : '',
        roomType: form.type === 'Room' ? form.roomType : undefined,
        capacityHint: form.capacityHint ? Number(form.capacityHint) : 0,
        locationStatus: form.locationStatus,
        isStore: form.roomType === 'Store',
      }
      const response = isEdit
        ? await asetsService.saveLocation(payload, editRecord._id)
        : await asetsService.saveLocation(payload)
      const created = response.data?.data || response.data
      toast.success(isEdit ? 'Location updated.' : `${form.type} created successfully.`)
      if (isEdit) {
        onSaved(created)
        onClose()
        return
      }
      setLastCreated(created)
      const child = childTypeForParent(form.type)
      const actions: SuccessAction[] = [
        { label: `Add another ${lower(typeName)}`, kind: 'another', type: form.type as LocationType, parentId: form.parentId || parent?._id },
      ]
      if (child) actions.push({ label: `Add ${lower(child)} inside it`, kind: 'child', type: child, parentId: created?._id })
      actions.push({ label: 'Done', kind: 'done', type: form.type as LocationType })
      setSuccessActions(actions)
      onSaved(created)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not save location.')
    } finally {
      setSaving(false)
    }
  }

  const runSuccessAction = (action: SuccessAction) => {
    if (action.kind === 'done') {
      onClose()
      return
    }
    setSuccessActions(null)
    setErrors({})
    setForm(emptyForm(action.type, action.kind === 'another' ? action.parentId : action.parentId || lastCreated?._id))
  }

  const isRoom = form.type === 'Room'

  if (successActions) {
    const primary = successActions.find((action) => action.kind === 'child') || successActions[0]
    return (
      <Sheet
        open={open}
        onClose={onClose}
        icon={CheckCircle2}
        title={`${typeName} added`}
        description={lastCreated?.name ? `${lastCreated.name} is now in the location structure.` : undefined}
        footer={
          <>
            {successActions
              .filter((action) => action !== primary)
              .map((action) => (
                <Button key={action.label} onClick={() => runSuccessAction(action)}>
                  {action.label}
                </Button>
              ))}
            <Button variant="primary" onClick={() => runSuccessAction(primary)}>
              {primary.label}
            </Button>
          </>
        }
      >
        <Banner tone="success" title={`${typeName} created`}>
          Keep going to build out the structure, or choose Done to close.
        </Banner>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      icon={isEdit ? Pencil : MapPin}
      title={title}
      description={description}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>
            {isEdit ? 'Save changes' : `Add ${lower(typeName)}`}
          </Button>
        </>
      }
    >
      {!isEdit && !parent ? (
        <Select
          label="Location type"
          value={form.type}
          onChange={(e) => {
            setErrors({})
            setForm({ ...emptyForm(e.target.value as LocationType), type: e.target.value as LocationType })
          }}
          options={LOCATION_TYPES.map((type) => ({ value: type, label: type }))}
          hint={form.type !== 'Campus' ? 'Blocks, floors and rooms are easier to add from their parent on the canvas.' : undefined}
        />
      ) : null}

      <div className="cb-form-section">
        <div className="cb-form-grid">
          {isRoom ? (
            <>
              <TextField
                label="Room number"
                required
                value={form.roomNumber}
                error={errors.roomNumber}
                onChange={(e) => update({ roomNumber: e.target.value })}
              />
              <TextField
                label="Room name"
                required
                value={form.name}
                error={errors.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </>
          ) : (
            <TextField
              className="is-wide"
              label={`${typeName} name`}
              required
              value={form.name}
              error={errors.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          )}
          <TextField label="Code" value={form.code} onChange={(e) => update({ code: e.target.value })} />
          {form.type === 'Floor' ? (
            <TextField label="Floor number" value={form.floorNumber} onChange={(e) => update({ floorNumber: e.target.value })} />
          ) : null}
          <Select
            label="Status"
            value={form.locationStatus}
            onChange={(e) => update({ locationStatus: e.target.value })}
            options={['Active', 'Inactive']}
          />
          {form.type === 'Campus' ? (
            <TextField className="is-wide" label="Address" value={form.address} onChange={(e) => update({ address: e.target.value })} />
          ) : null}
        </div>
      </div>

      {isRoom ? (
        <div className="cb-form-section">
          <p className="cb-form-section__title">Room use</p>
          <div className="cb-form-grid">
            <Select
              label="Room type"
              required
              value={form.roomType}
              error={errors.roomType}
              onChange={(e) => update({ roomType: e.target.value })}
              options={ROOM_TYPES.map((type) => ({ value: type, label: type }))}
            />
            <TextField
              label="Capacity"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.capacityHint}
              onChange={(e) => update({ capacityHint: e.target.value })}
            />
            <Select
              label="Class"
              value={form.className}
              placeholder={loadingClassSections ? 'Loading classes…' : 'Select class'}
              disabled={loadingClassSections}
              onChange={(e) => update({ className: e.target.value, section: '' })}
              options={classSectionOptions.map((item) => ({ value: item.className, label: item.className }))}
            />
            <Select
              label="Section"
              value={form.section}
              placeholder="Select section"
              disabled={!form.className || loadingClassSections}
              onChange={(e) => update({ section: e.target.value })}
              options={availableSections}
            />
            <p className="is-wide cb-field__hint">Classes and sections come from the class section matrix on the Students classes page.</p>
          </div>
        </div>
      ) : null}

      <TextArea label="Description" value={form.description} onChange={(e) => update({ description: e.target.value })} />
    </Sheet>
  )
}

export default LocationFormModal
