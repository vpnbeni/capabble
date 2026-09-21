import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { AsetsCard, btnPrimary, btnSecondary, inputClass } from '@/components/asets/AsetsUi'
import {
  LOCATION_TYPES,
  ROOM_TYPES,
  addFormTitle,
  childTypeForParent,
  normalizeLocationType,
  type LocationType,
} from '@/constants/locationConstants'
import { sortSectionNames } from '@/constants/studentClasses'

type ParentContext = { _id: string; name: string; type: string; pathSegments?: { name: string }[] }

type SuccessAction = {
  label: string
  type: LocationType
  parentId?: string
  createdId?: string
}

type Props = {
  open: boolean
  initialType?: LocationType
  parent?: ParentContext | null
  editRecord?: any | null
  onClose: () => void
  onSaved: (created?: any) => void
}

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

const LocationFormModal: React.FC<Props> = ({ open, initialType = 'Campus', parent, editRecord, onClose, onSaved }) => {
  const isEdit = Boolean(editRecord?._id)
  const [form, setForm] = useState(emptyForm(initialType, parent?._id || ''))
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

  const title = isEdit ? `Edit ${normalizeLocationType(form.type)}` : addFormTitle(form.type as LocationType)
  const breadcrumb = useMemo(() => parent?.pathSegments?.map((segment) => segment.name).join(' → ') || parent?.name || '', [parent])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
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
        { label: `Add another ${form.type}`, type: form.type as LocationType, parentId: form.parentId || parent?._id },
      ]
      if (child) actions.push({ label: `Add ${child}`, type: child, parentId: created?._id, createdId: created?._id })
      actions.push({ label: 'Done', type: form.type as LocationType })
      setSuccessActions(actions)
      onSaved(created)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not save location.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold dark:text-white">{title}</h3>
            {parent && !isEdit ? (
              <p className="mt-1 text-sm text-slate-500">
                Parent: <span className="font-medium text-slate-700 dark:text-slate-200">{breadcrumb || parent.name}</span>
              </p>
            ) : null}
          </div>
          <button type="button" className="text-slate-500" onClick={onClose}>✕</button>
        </div>

        {successActions ? (
          <AsetsCard>
            <p className="text-sm text-slate-600 dark:text-slate-300">{form.type} created successfully.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {successActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={action.label === 'Done' ? btnSecondary : btnPrimary}
                  onClick={() => {
                    if (action.label === 'Done') {
                      onClose()
                      return
                    }
                    if (action.label.startsWith('Add another')) {
                      setSuccessActions(null)
                      setForm(emptyForm(action.type, action.parentId))
                      return
                    }
                    setSuccessActions(null)
                    setForm(emptyForm(action.type, action.parentId || lastCreated?._id))
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </AsetsCard>
        ) : (
          <>
            {!isEdit && !parent ? (
              <label className="mb-4 block text-sm">
                Location type
                <select
                  className={inputClass}
                  value={form.type}
                  onChange={(e) => setForm({ ...emptyForm(e.target.value as LocationType), type: e.target.value as LocationType })}
                >
                  {LOCATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {form.type === 'Room' ? (
                <>
                  <label className="text-sm">
                    Room Number *
                    <input required className={inputClass} value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} />
                  </label>
                  <label className="text-sm">
                    Room Name *
                    <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                </>
              ) : (
                <label className="text-sm sm:col-span-2">
                  {`${form.type} Name`} *
                  <input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
              )}
              <label className="text-sm">
                Code
                <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </label>
              {form.type === 'Campus' ? (
                <label className="text-sm sm:col-span-2">
                  Address
                  <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </label>
              ) : null}
              {form.type === 'Floor' ? (
                <label className="text-sm">
                  Floor Number
                  <input className={inputClass} value={form.floorNumber} onChange={(e) => setForm({ ...form, floorNumber: e.target.value })} />
                </label>
              ) : null}
              {form.type === 'Room' ? (
                <>
                  <label className="text-sm">
                    Class
                    <select
                      className={inputClass}
                      value={form.className}
                      onChange={(e) => setForm({ ...form, className: e.target.value, section: '' })}
                      disabled={loadingClassSections}
                    >
                      <option value="">Select class</option>
                      {classSectionOptions.map((item) => (
                        <option key={item.className} value={item.className}>{item.className}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Section
                    <select
                      className={inputClass}
                      value={form.section}
                      onChange={(e) => setForm({ ...form, section: e.target.value })}
                      disabled={!form.className || loadingClassSections}
                    >
                      <option value="">Select section</option>
                      {availableSections.map((sectionName) => (
                        <option key={sectionName} value={sectionName}>{sectionName}</option>
                      ))}
                    </select>
                  </label>
                  <p className="sm:col-span-2 text-xs text-slate-500">
                    Classes and sections come from the STDNT Class Section Matrix on the Classes page.
                  </p>
                  <label className="text-sm">
                    Room Type *
                    <select required className={inputClass} value={form.roomType} onChange={(e) => setForm({ ...form, roomType: e.target.value })}>
                      {ROOM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    Capacity
                    <input type="number" min={0} className={inputClass} value={form.capacityHint} onChange={(e) => setForm({ ...form, capacityHint: e.target.value })} />
                  </label>
                </>
              ) : null}
              <label className="text-sm">
                Status
                <select className={inputClass} value={form.locationStatus} onChange={(e) => setForm({ ...form, locationStatus: e.target.value })}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm">
              Description
              <textarea className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
              <button disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : isEdit ? 'Save changes' : `Create ${form.type}`}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

export default LocationFormModal
