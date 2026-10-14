import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, Pencil, Plus, SearchX } from 'lucide-react'
import asetsService from '@/services/asetsService'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  Sheet,
  TextArea,
  TextField,
  orDash,
  type DataTableColumn,
  type MenuItem,
  type SelectOption,
} from '@/components/ui'
import '@/components/asets/overview.css'

type FieldDef = {
  key: string
  label: string
  type?: string
  /** Plain strings keep the old behaviour (first option is the default). */
  options?: SelectOption[]
  /** Adds an empty first option with this label (default value ''). */
  placeholder?: string
  required?: boolean
  hint?: string
  /** Spans both columns of the form grid. */
  wide?: boolean
}

type SimplePageProps = {
  title: string
  subtitle: string
  list: () => Promise<any[]>
  save: (payload: any, id?: string) => Promise<unknown>
  remove?: (id: string) => Promise<unknown>
  /** Static list, or derived from the loaded records (for parent pickers). */
  fields: FieldDef[] | ((ctx: { items: any[]; editingId: string }) => FieldDef[])
  titleOf: (item: any) => string
  metaOf: (item: any) => string
  /** Lower-case nouns for buttons, counts and messages: { one: 'vendor', many: 'vendors' }. */
  noun?: { one: string; many: string }
  /** Table columns (row actions are appended). Defaults to a single name + meta column. */
  columns?: DataTableColumn<any>[] | ((items: any[]) => DataTableColumn<any>[])
  searchPlaceholder?: string
  emptyBody?: string
}

const optionValue = (option: SelectOption) => (typeof option === 'object' ? option.value : option)

const resolveFields = (fields: SimplePageProps['fields'], items: any[], editingId: string) =>
  typeof fields === 'function' ? fields({ items, editingId }) : fields

const emptyFor = (fields: FieldDef[]) =>
  fields.reduce((acc, field) => {
    if (field.type === 'number') acc[field.key] = 0
    else if (field.type === 'checkbox') acc[field.key] = false
    else if (field.placeholder != null) acc[field.key] = ''
    else acc[field.key] = field.options?.length ? optionValue(field.options[0]) : ''
    return acc
  }, {} as Record<string, any>)

const SimpleCrudPage: React.FC<SimplePageProps> = ({
  title,
  subtitle,
  list,
  save,
  remove,
  fields,
  titleOf,
  metaOf,
  noun,
  columns,
  searchPlaceholder,
  emptyBody,
}) => {
  const one = noun?.one || 'record'
  const many = noun?.many || 'records'
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<Record<string, any>>(() => emptyFor(resolveFields(fields, [], '')))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<any | null>(null)
  const [archiving, setArchiving] = useState(false)

  const formFields = resolveFields(fields, items, editingId)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await list())
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const keys = resolveFields(fields, items, '').map((f) => item[f.key])
      const haystack = [titleOf(item), metaOf(item), ...keys]
        .filter((v) => v != null && typeof v !== 'object')
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [items, search, fields, titleOf, metaOf])

  const openAdd = () => {
    setEditingId('')
    setForm(emptyFor(resolveFields(fields, items, '')))
    setErrors({})
    setSheetOpen(true)
  }

  const openEdit = (item: any) => {
    const editFields = resolveFields(fields, items, item._id)
    const next = emptyFor(editFields)
    editFields.forEach((field) => {
      next[field.key] = item[field.key] ?? next[field.key]
    })
    setEditingId(item._id)
    setForm(next)
    setErrors({})
    setSheetOpen(true)
  }

  const closeSheet = () => {
    if (saving) return
    setSheetOpen(false)
    setEditingId('')
    setErrors({})
  }

  const setValue = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    formFields.forEach((field) => {
      if (field.required && !String(form[field.key] ?? '').trim()) nextErrors[field.key] = `Enter the ${field.label.toLowerCase()}.`
    })
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors)
      return
    }
    setSaving(true)
    try {
      await save(form, editingId || undefined)
      toast.success(editingId ? 'Updated.' : 'Created.')
      setSheetOpen(false)
      setEditingId('')
      setForm(emptyFor(resolveFields(fields, items, '')))
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const confirmArchive = async () => {
    if (!remove || !archiveTarget) return
    setArchiving(true)
    try {
      await remove(archiveTarget._id)
      toast.success('Archived.')
      setArchiveTarget(null)
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Archive failed.')
    } finally {
      setArchiving(false)
    }
  }

  const baseColumns: DataTableColumn<any>[] = columns
    ? typeof columns === 'function'
      ? columns(items)
      : columns
    : [
        {
          key: 'name',
          header: 'Name',
          mobile: 'title',
          render: (item) => <span className="ao-name__primary">{titleOf(item)}</span>,
        },
        { key: 'meta', header: 'Details', mobile: 'subtitle', render: (item) => orDash(metaOf(item)) },
      ]

  const tableColumns: DataTableColumn<any>[] = [
    ...baseColumns,
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      interactive: true,
      mobile: 'aside',
      width: 48,
      align: 'right',
      render: (item) => {
        const menuItems: MenuItem[] = [{ label: `Edit ${one}`, icon: Pencil, onSelect: () => openEdit(item) }]
        if (remove) {
          menuItems.push({ divider: true })
          menuItems.push({ label: `Archive ${one}`, icon: Archive, tone: 'danger', onSelect: () => setArchiveTarget(item) })
        }
        return <Menu label={`Actions for ${titleOf(item)}`} items={menuItems} />
      },
    },
  ]

  const countLabel = loading && !items.length
    ? ''
    : search.trim()
      ? `${filtered.length} of ${items.length} ${items.length === 1 ? one : many}`
      : `${items.length} ${items.length === 1 ? one : many}`

  const renderField = (field: FieldDef) => {
    const common = {
      label: field.label,
      required: field.required,
      hint: field.hint,
      error: errors[field.key] || undefined,
      className: field.wide || field.type === 'textarea' ? 'is-wide' : undefined,
    }
    if (field.type === 'select') {
      const value = form[field.key] ?? ''
      const options = field.options || []
      const known = value === '' || options.some((o) => optionValue(o) === String(value))
      return (
        <Select
          key={field.key}
          {...common}
          value={String(value)}
          placeholder={field.placeholder}
          options={known ? options : [...options, String(value)]}
          onChange={(e) => setValue(field.key, e.target.value)}
        />
      )
    }
    if (field.type === 'checkbox') {
      return (
        <div key={field.key} className={common.className}>
          <Checkbox
            label={field.label}
            description={field.hint}
            checked={form[field.key] === true || form[field.key] === 'true'}
            onChange={(checked) => setValue(field.key, checked)}
          />
        </div>
      )
    }
    if (field.type === 'textarea') {
      return (
        <TextArea
          key={field.key}
          {...common}
          className="is-wide"
          value={form[field.key] || ''}
          onChange={(e) => setValue(field.key, e.target.value)}
        />
      )
    }
    return (
      <TextField
        key={field.key}
        {...common}
        type={field.type || 'text'}
        value={form[field.key] ?? ''}
        onChange={(e) => setValue(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    )
  }

  const archiveName = archiveTarget ? titleOf(archiveTarget) : ''

  return (
    <Page>
      <Card flush className="ao-crud">
        <div className="ao-crud-toolbar">
          <FilterBar
            search={{
              placeholder: searchPlaceholder || `Search ${many}`,
              value: search,
              onChange: setSearch,
              label: `Search ${many}`,
            }}
            filters={countLabel ? <span className="ao-crud-count" aria-live="polite">{countLabel}</span> : undefined}
            actions={
              <Button variant="primary" icon={Plus} onClick={openAdd}>
                Add {one}
              </Button>
            }
          />
        </div>
        <DataTable
          caption={title}
          columns={tableColumns}
          rows={filtered}
          getRowKey={(item) => String(item._id)}
          onRowClick={openEdit}
          loading={loading}
          loadingLabel={`Loading ${many}…`}
          empty={
            search.trim() && items.length ? (
              <EmptyState
                icon={SearchX}
                title={`No ${many} match “${search.trim()}”`}
                body="Check the spelling or search by code."
                action={
                  <Button variant="tertiary" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                }
                compact
              />
            ) : (
              <EmptyState
                title={`No ${many} yet`}
                body={emptyBody || `${subtitle} Add the first one to get started.`}
                action={
                  <Button icon={Plus} onClick={openAdd}>
                    Add {one}
                  </Button>
                }
              />
            )
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        title={editingId ? `Edit ${one}` : `Add ${one}`}
        description={subtitle}
        icon={editingId ? Pencil : Plus}
        onSubmit={onSave}
        footer={
          <>
            <Button variant="secondary" onClick={closeSheet} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              {editingId ? 'Save changes' : `Add ${one}`}
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">{formFields.map(renderField)}</div>
      </Sheet>

      <Dialog
        open={Boolean(archiveTarget)}
        onClose={archiving ? undefined : () => setArchiveTarget(null)}
        tone="danger"
        size="sm"
        title={`Archive ${one}?`}
        description={`${archiveName} will be hidden from lists and pickers. Records that already use it keep their history.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="danger" icon={Archive} loading={archiving} onClick={() => void confirmArchive()}>
              Archive {one}
            </Button>
          </>
        }
      />
    </Page>
  )
}

const NameCell: React.FC<{ primary: React.ReactNode; secondary?: React.ReactNode }> = ({ primary, secondary }) => (
  <span className="ao-name">
    <span className="ao-name__primary">{primary}</span>
    {secondary ? <span className="ao-name__secondary">{secondary}</span> : null}
  </span>
)

const trackingLabel = (mode?: string) => (mode === 'consumable' ? 'Consumable' : mode === 'individual' ? 'Individual' : orDash(mode))

export const AsetsCategories: React.FC = () => (
  <SimpleCrudPage
    title="Categories"
    subtitle="Hierarchical asset categories and subcategories."
    noun={{ one: 'category', many: 'categories' }}
    searchPlaceholder="Search name, code or description"
    emptyBody="Categories group assets, such as furniture or IT equipment. Add the first one to start registering assets."
    list={asetsService.listCategories}
    save={async (payload, id) => asetsService.saveCategory({ ...payload, parentId: payload.parentId || null }, id)}
    remove={asetsService.removeCategory}
    fields={({ items, editingId }) => [
      { key: 'name', label: 'Name', required: true },
      { key: 'code', label: 'Code', required: true, hint: 'Saved in capitals, for example FURN.' },
      {
        key: 'parentId',
        label: 'Parent category',
        type: 'select',
        placeholder: 'None (top-level category)',
        options: items
          .filter((row) => row._id !== editingId)
          .map((row) => ({ value: String(row._id), label: `${row.name} (${row.code})` })),
      },
      {
        key: 'trackingModeDefault',
        label: 'Default tracking',
        type: 'select',
        options: [
          { value: 'individual', label: 'Individual (one record per item)' },
          { value: 'consumable', label: 'Consumable (tracked as stock)' },
        ],
      },
      { key: 'description', label: 'Description', type: 'textarea' },
    ]}
    columns={(items) => {
      const byId = new Map(items.map((row) => [String(row._id), row]))
      return [
        {
          key: 'name',
          header: 'Category',
          mobile: 'title',
          render: (item) => <NameCell primary={item.name} secondary={item.code} />,
        },
        {
          key: 'parent',
          header: 'Parent',
          mobile: 'subtitle',
          render: (item) => {
            if (!item.parentId) return <span className="cb-subtle">Top-level</span>
            const parent = byId.get(String(item.parentId?._id || item.parentId))
            return parent ? parent.name : orDash(item.parentId?.name)
          },
        },
        {
          key: 'trackingModeDefault',
          header: 'Default tracking',
          render: (item) => <Badge tone={item.trackingModeDefault === 'consumable' ? 'info' : 'neutral'}>{trackingLabel(item.trackingModeDefault)}</Badge>,
        },
        {
          key: 'description',
          header: 'Description',
          render: (item) => <span className="ao-clip" title={item.description || undefined}>{orDash(item.description)}</span>,
        },
      ]
    }}
    titleOf={(item) => `${item.name} (${item.code})`}
    metaOf={(item) => (item.parentId ? 'Subcategory' : 'Top-level category')}
  />
)

const LOCATION_TYPES = ['School', 'Campus', 'Building', 'Floor', 'Wing', 'Room', 'Classroom', 'Store', 'Lab', 'Office', 'Other']

export const AsetsLocationsLegacy: React.FC = () => (
  <SimpleCrudPage
    title="Locations"
    subtitle="Hierarchical school locations — campus, building, floor, room, store."
    noun={{ one: 'location', many: 'locations' }}
    searchPlaceholder="Search name, code, path or department"
    list={asetsService.listLocations}
    save={async (payload, id) => {
      const body = {
        ...payload,
        isStore: payload.isStore === true || payload.isStore === 'true',
        parentId: payload.parentId || null,
      }
      return asetsService.saveLocation(body, id)
    }}
    remove={asetsService.removeLocation}
    fields={({ items, editingId }) => [
      { key: 'name', label: 'Name', required: true },
      { key: 'code', label: 'Code' },
      { key: 'type', label: 'Type', type: 'select', options: LOCATION_TYPES },
      {
        key: 'parentId',
        label: 'Parent location',
        type: 'select',
        placeholder: 'None (top level)',
        options: items
          .filter((row) => row._id !== editingId)
          .map((row) => ({ value: String(row._id), label: row.path || row.name })),
      },
      { key: 'department', label: 'Department' },
      { key: 'isStore', label: 'Is a store', type: 'checkbox', hint: 'Stock can be held here.', wide: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ]}
    columns={[
      { key: 'name', header: 'Location', mobile: 'title', render: (item) => <NameCell primary={item.name} secondary={item.code} /> },
      { key: 'type', header: 'Type', mobile: 'subtitle', render: (item) => orDash(item.type) },
      { key: 'path', header: 'Path', render: (item) => <span className="ao-clip">{item.path || 'Path pending'}</span> },
      { key: 'department', header: 'Department', render: (item) => orDash(item.department) },
      { key: 'isStore', header: 'Store', render: (item) => (item.isStore ? <Badge tone="info">Store</Badge> : <span className="cb-subtle">—</span>) },
    ]}
    titleOf={(item) => item.name}
    metaOf={(item) => `${item.type} · ${item.path || 'path pending'}${item.isStore ? ' · STORE' : ''}`}
  />
)

export const AsetsVendors: React.FC = () => (
  <SimpleCrudPage
    title="Vendors"
    subtitle="Suppliers and service providers for school assets."
    noun={{ one: 'vendor', many: 'vendors' }}
    searchPlaceholder="Search name, code, contact, phone or GSTIN"
    emptyBody="Vendors are the suppliers and service providers you buy from. Add one to link it to purchases and warranties."
    list={asetsService.listVendors}
    save={asetsService.saveVendor}
    remove={asetsService.removeVendor}
    fields={[
      { key: 'name', label: 'Vendor name', required: true },
      { key: 'code', label: 'Vendor code' },
      { key: 'contactPerson', label: 'Contact person' },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'productsServices', label: 'Products / services', type: 'textarea' },
    ]}
    columns={[
      { key: 'name', header: 'Vendor', mobile: 'title', render: (item) => <NameCell primary={item.name} secondary={item.code} /> },
      { key: 'contactPerson', header: 'Contact person', mobile: 'subtitle', render: (item) => orDash(item.contactPerson) },
      { key: 'phone', header: 'Phone', render: (item) => <span className="is-num">{orDash(item.phone)}</span> },
      { key: 'email', header: 'Email', render: (item) => <span className="ao-clip" title={item.email || undefined}>{orDash(item.email)}</span> },
      { key: 'gstin', header: 'GSTIN', render: (item) => <span className="ao-code">{orDash(item.gstin)}</span> },
      {
        key: 'productsServices',
        header: 'Products / services',
        render: (item) => <span className="ao-clip" title={item.productsServices || undefined}>{orDash(item.productsServices)}</span>,
      },
    ]}
    titleOf={(item) => item.name}
    metaOf={(item) => [item.code, item.contactPerson, item.phone].filter(Boolean).join(' · ')}
  />
)

export default SimpleCrudPage
