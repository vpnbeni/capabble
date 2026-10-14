import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Award, Printer, Trash2 } from 'lucide-react'
import api from '@/services/api'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  FilterBar,
  Page,
  Select,
  TextArea,
  TextField,
  EmptyState,
  formatDate,
  type DataTableColumn,
} from '@/components/ui'
import { toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/sports.css'

type HouseOption = {
  _id?: string
  name?: string
  color?: string
}

type ActivityEvent = {
  _id?: string
  title?: string
  date?: string
}

type CertificateRecord = {
  _id?: string
  title?: string
  eventId?: string
  eventTitle?: string
  eventDate?: string
  houseId?: string
  houseName?: string
  participantName?: string
  className?: string
  section?: string
  role?: string
  issuedOn?: string
  status?: string
}

type CertForm = {
  title: string
  eventId: string
  houseId: string
  participants: string
  className: string
  section: string
  role: string
  issuedOn: string
}

const emptyForm = (): CertForm => ({
  title: 'Certificate of Participation',
  eventId: '',
  houseId: '',
  participants: '',
  className: '',
  section: '',
  role: 'Participant',
  issuedOn: new Date().toISOString().slice(0, 10),
})

const ROLE_OPTIONS = ['Participant', 'Winner', 'Runner-up', 'Second Runner-up', 'Volunteer']

const ActvtCertificates: React.FC = () => {
  const printRef = useRef<HTMLDivElement | null>(null)
  const [houses, setHouses] = useState<HouseOption[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [records, setRecords] = useState<CertificateRecord[]>([])
  const [form, setForm] = useState<CertForm>(emptyForm())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingRemove, setPendingRemove] = useState<CertificateRecord | null>(null)
  const [removing, setRemoving] = useState(false)

  const houseMap = useMemo(() => {
    const map = new Map<string, HouseOption>()
    houses.forEach((house) => map.set(String(house._id), house))
    return map
  }, [houses])

  const eventMap = useMemo(() => {
    const map = new Map<string, ActivityEvent>()
    events.forEach((event) => map.set(String(event._id), event))
    return map
  }, [events])

  const load = async () => {
    setLoading(true)
    try {
      const [housesRes, eventsRes, certsRes] = await Promise.all([
        api.get('/actvt/houses'),
        api.get('/actvt/events'),
        api.get('/actvt/certificates'),
      ])
      setHouses((housesRes.data?.data || []) as HouseOption[])
      setEvents((eventsRes.data?.data || []) as ActivityEvent[])
      setRecords((certsRes.data?.data || []) as CertificateRecord[])
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load certificates.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selectedCertificates = useMemo(
    () => records.filter((item) => item._id && selectedIds.includes(String(item._id))),
    [records, selectedIds]
  )

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault()
    const names = form.participants
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (!form.title.trim()) {
      toast.error('Certificate title is required.')
      return
    }
    if (names.length === 0) {
      toast.error('Add at least one participant name.')
      return
    }

    const selectedEvent = form.eventId ? eventMap.get(form.eventId) : null
    const selectedHouse = form.houseId ? houseMap.get(form.houseId) : null

    setSaving(true)
    try {
      const createdIds: string[] = []
      for (const name of names) {
        const response = await api.post('/actvt/certificates', {
          title: form.title.trim(),
          eventId: form.eventId,
          eventTitle: selectedEvent?.title || '',
          eventDate: selectedEvent?.date || '',
          houseId: form.houseId,
          houseName: selectedHouse?.name || '',
          participantName: name,
          className: form.className.trim(),
          section: form.section.trim(),
          role: form.role.trim() || 'Participant',
          issuedOn: form.issuedOn,
          status: 'issued',
        })
        const id = response.data?.data?._id
        if (id) createdIds.push(String(id))
      }

      toast.success(`Generated ${names.length} certificate${names.length === 1 ? '' : 's'}.`)
      setForm((prev) => ({ ...prev, participants: '' }))
      await load()
      setSelectedIds(createdIds)
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to generate certificates.'))
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (item: CertificateRecord) => {
    if (!item._id) return
    try {
      await api.delete(`/actvt/certificates/${item._id}`)
      toast.success('Certificate removed.')
      setSelectedIds((prev) => prev.filter((id) => id !== String(item._id)))
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove certificate.'))
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handlePrint = () => {
    if (selectedCertificates.length === 0) {
      toast.error('Select at least one certificate to print.')
      return
    }
    window.print()
  }

  const houseIndex = useMemo(() => {
    const map = new Map<string, number>()
    houses.forEach((house, index) => map.set(String(house._id), index))
    return map
  }, [houses])

  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter((item) =>
      `${item.participantName || ''} ${item.title || ''} ${item.eventTitle || ''} ${item.houseName || ''} ${item.role || ''} ${item.className || ''}`
        .toLowerCase()
        .includes(needle)
    )
  }, [records, query])

  const visibleIds = visibleRecords.map((item) => String(item._id || '')).filter(Boolean)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id))

  const toggleAllVisible = () => {
    setSelectedIds((prev) =>
      allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]))
    )
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

  const columns: DataTableColumn<CertificateRecord>[] = [
    {
      key: 'participantName',
      header: 'Participant',
      mobile: 'title',
      render: (item) => (
        <span className="asp-person">
          <span className="asp-person__name">{item.participantName || 'Unnamed'}</span>
          {item.className || item.section ? (
            <span className="asp-person__sub">
              Class {item.className || '—'}
              {item.section ? `-${item.section}` : ''}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Certificate',
      mobile: 'subtitle',
      render: (item) => `${item.title || 'Certificate'}${item.role ? ` · ${item.role}` : ''}`,
    },
    { key: 'eventTitle', header: 'Activity', render: (item) => item.eventTitle || '—' },
    {
      key: 'houseName',
      header: 'House',
      render: (item) => {
        if (!item.houseName && !item.houseId) return '—'
        const house = item.houseId ? houseMap.get(String(item.houseId)) : undefined
        const name = house?.name || item.houseName || 'House'
        if (!house) return name
        return (
          <span className="asp-swatchname" style={toneStyle(house.color, houseIndex.get(String(item.houseId)) || 0)}>
            <span className="actvt-tone-dot" aria-hidden="true" />
            <span>{name}</span>
          </span>
        )
      },
    },
    { key: 'issuedOn', header: 'Issued on', render: (item) => formatDate(item.issuedOn) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (item) =>
        String(item.status || 'issued').toLowerCase() === 'issued' ? (
          <Badge tone="success">Issued</Badge>
        ) : (
          <Badge tone="neutral">{item.status}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      width: 48,
      render: (item) => (
        <Button
          variant="tertiary"
          size="sm"
          icon={Trash2}
          aria-label={`Remove certificate for ${item.participantName || 'participant'}`}
          onClick={() => setPendingRemove(item)}
        />
      ),
    },
  ]

  const participantCount = form.participants.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length

  return (
    <>
      <Page className="print:hidden">
        <div className="asp-split">
          <Card title="Generate certificates" subtitle="One certificate per participant name">
            <form className="asp-form" onSubmit={handleGenerate} noValidate>
              <TextField
                label="Certificate title"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <Select
                label="Activity"
                hint="Optional. Pick an activity from the board."
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                placeholder="No activity"
                options={events
                  .filter((item) => item._id)
                  .map((item) => ({
                    value: String(item._id),
                    label: `${item.title || 'Untitled activity'}${item.date ? ` · ${item.date}` : ''}`,
                  }))}
              />
              <Select
                label="House"
                hint="Optional."
                value={form.houseId}
                onChange={(e) => setForm({ ...form, houseId: e.target.value })}
                placeholder="No house"
                options={houses
                  .filter((house) => house._id)
                  .map((house) => ({ value: String(house._id), label: house.name || 'Untitled house' }))}
              />
              <div className="cb-form-grid cb-form-grid--3">
                <Select
                  label="Role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  options={ROLE_OPTIONS}
                />
                <TextField label="Class" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} />
                <TextField label="Section" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
              </div>
              <TextField
                label="Issued on"
                type="date"
                value={form.issuedOn}
                onChange={(e) => setForm({ ...form, issuedOn: e.target.value })}
              />
              <TextArea
                label="Participants"
                required
                rows={8}
                value={form.participants}
                onChange={(e) => setForm({ ...form, participants: e.target.value })}
                placeholder={'Aarav Sharma\nIsha Verma\nKabir Singh'}
                hint={
                  participantCount
                    ? `${participantCount} ${participantCount === 1 ? 'name' : 'names'} · one name per line`
                    : 'One name per line.'
                }
              />
              <div className="asp-form__actions">
                <Button variant="primary" type="submit" icon={Award} loading={saving}>
                  {participantCount > 1 ? `Generate ${participantCount} certificates` : 'Generate certificates'}
                </Button>
              </div>
            </form>
          </Card>

          <Card flush className="asp-certs-card">
            <div className="asp-certs-head">
              <FilterBar
                search={{ placeholder: 'Search certificates', value: query, onChange: setQuery }}
                actions={
                  <Button icon={Printer} onClick={handlePrint} disabled={selectedCertificates.length === 0}>
                    {selectedCertificates.length ? `Print ${selectedCertificates.length} selected` : 'Print selected'}
                  </Button>
                }
              />
            </div>
            <DataTable
              caption="Issued certificates"
              columns={columns}
              rows={visibleRecords}
              getRowKey={(item) => String(item._id || `${item.participantName}-${item.issuedOn}`)}
              loading={loading}
              loadingLabel="Loading certificates…"
              selection={{
                isSelected: (item) => selectedIds.includes(String(item._id || '')),
                onToggle: (item) => {
                  if (item._id) toggleSelected(String(item._id))
                },
                allSelected: allVisibleSelected,
                someSelected: someVisibleSelected,
                onToggleAll: toggleAllVisible,
                rowLabel: (item) => `Select certificate for ${item.participantName || 'participant'}`,
              }}
              empty={
                <EmptyState
                  icon={Award}
                  title={query.trim() ? 'No certificates match your search' : 'No certificates issued yet'}
                  body={
                    query.trim()
                      ? 'Try a different name, activity or house.'
                      : 'Add participant names in the form to generate certificates, then select them here to print.'
                  }
                  action={query.trim() ? <Button onClick={() => setQuery('')}>Clear search</Button> : undefined}
                  compact
                />
              }
              footer={`${records.length} issued · ${selectedCertificates.length} selected for printing`}
            />
          </Card>
        </div>

        <Dialog
          open={Boolean(pendingRemove)}
          onClose={() => (removing ? undefined : setPendingRemove(null))}
          tone="danger"
          size="sm"
          title={`Remove certificate for ${pendingRemove?.participantName || 'this participant'}?`}
          description="The certificate record is deleted and can't be printed again. This can't be undone."
          footer={
            <>
              <Button onClick={() => setPendingRemove(null)} disabled={removing}>
                Cancel
              </Button>
              <Button variant="danger" loading={removing} onClick={() => void confirmRemove()}>
                Remove certificate
              </Button>
            </>
          }
        />
      </Page>

      {/* Printed certificates: artwork kept exactly as before; shown only when printing. */}
      <div className="hidden p-6 print:block">
        <div ref={printRef} className="hidden print:block">
          {selectedCertificates.map((item) => (
            <div
              key={item._id}
              className="mb-8 flex min-h-[90vh] break-after-page flex-col items-center justify-center border-[10px] border-indigo-700 px-12 py-16 text-center"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-indigo-700">CAPABBLE · ACTVT</p>
              <h1 className="mt-6 text-4xl font-bold text-slate-900">{item.title || 'Certificate'}</h1>
              <p className="mt-8 text-base text-slate-600">This is to certify that</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{item.participantName}</p>
              {(item.className || item.section) ? (
                <p className="mt-2 text-sm text-slate-500">
                  Class {item.className || '—'}{item.section ? `-${item.section}` : ''}
                </p>
              ) : null}
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-600">
                has participated as <span className="font-semibold text-slate-800">{item.role || 'Participant'}</span>
                {item.eventTitle ? <> in <span className="font-semibold text-slate-800">{item.eventTitle}</span></> : null}
                {item.houseName ? <> representing <span className="font-semibold text-slate-800">{item.houseName}</span></> : null}.
              </p>
              <div className="mt-16 flex w-full max-w-3xl justify-between text-sm text-slate-500">
                <div>
                  <p className="font-semibold text-slate-800">{item.issuedOn || '—'}</p>
                  <p>Date of issue</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">Activity Incharge</p>
                  <p>Authorised signatory</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default ActvtCertificates
