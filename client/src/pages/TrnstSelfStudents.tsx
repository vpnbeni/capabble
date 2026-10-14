import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Footprints, Plus, Trash2 } from 'lucide-react'
import trnstService, { type CommuteMode, type SelfStudentOption, type SelfStudentRecord } from '@/services/trnstService'
import {
  Button,
  Card,
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
} from '@/components/ui'
import { Entity, errorMessage } from '@/components/trnst/TrnstUi'

const COMMUTE_MODES: CommuteMode[] = ['Walk', 'Bicycle', 'Parent drop', 'Own vehicle', 'Other']

type ClassOption = { className: string; sections: string[] }

const TrnstSelfStudents: React.FC = () => {
  const [records, setRecords] = useState<SelfStudentRecord[]>([])
  const [classOptions, setClassOptions] = useState<ClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'all' | CommuteMode>('all')
  const [filterClass, setFilterClass] = useState('')
  const [filterSection, setFilterSection] = useState('')

  // Add sheet: its own class and section pick narrows the student list.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [formClass, setFormClass] = useState('')
  const [formSection, setFormSection] = useState('')
  const [availableStudents, setAvailableStudents] = useState<SelfStudentOption[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [commuteMode, setCommuteMode] = useState<CommuteMode>('Walk')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const [removing, setRemoving] = useState<SelfStudentRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadRecords = async () => {
    try {
      const payload = await trnstService.getSelfStudents()
      setRecords(payload.records || [])
      setClassOptions(payload.classOptions || [])
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load self students.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  useEffect(() => {
    if (!sheetOpen) return
    let cancelled = false
    setStudentsLoading(true)
    trnstService
      .getSelfStudents({ className: formClass || undefined, section: formSection || undefined })
      .then((payload) => {
        if (!cancelled) setAvailableStudents(payload.availableStudents || [])
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorMessage(error, 'Could not load students.'))
      })
      .finally(() => {
        if (!cancelled) setStudentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sheetOpen, formClass, formSection])

  useEffect(() => {
    const student = availableStudents.find((item) => item._id === studentId)
    setGuardianPhone(student?.guardianPhone || student?.phone || '')
  }, [studentId, availableStudents])

  const sectionsOf = (className: string) => classOptions.find((item) => item.className === className)?.sections || []

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return records.filter((item) => {
      if (mode !== 'all' && item.commuteMode !== mode) return false
      if (filterClass && item.className !== filterClass) return false
      if (filterSection && item.section !== filterSection) return false
      if (!needle) return true
      return [item.name, item.rollNumber, item.className, item.section, item.guardianPhone]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [records, search, mode, filterClass, filterSection])

  const openAdd = () => {
    setFormClass(filterClass)
    setFormSection(filterSection)
    setStudentId('')
    setCommuteMode('Walk')
    setNotes('')
    setTried(false)
    setSheetOpen(true)
  }

  const save = async () => {
    setTried(true)
    if (!studentId) {
      toast.error('Choose a student.')
      return
    }
    setSaving(true)
    try {
      await trnstService.saveSelfStudent({ studentId, commuteMode, guardianPhone, notes })
      toast.success('Student added to the self-commute list.')
      setSheetOpen(false)
      await loadRecords()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not add the student.'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setDeleting(true)
    try {
      await trnstService.deleteSelfStudent(removing._id)
      toast.success('Student removed.')
      setRemoving(null)
      await loadRecords()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove the student.'))
    } finally {
      setDeleting(false)
    }
  }

  const columns: DataTableColumn<SelfStudentRecord>[] = [
    {
      key: 'name',
      header: 'Student',
      mobile: 'title',
      render: (s) => <Entity primary={s.name} secondary={s.rollNumber ? `Roll ${s.rollNumber}` : undefined} />,
    },
    { key: 'class', header: 'Class', mobile: 'subtitle', render: (s) => orDash([s.className, s.section].filter(Boolean).join(' ')) },
    { key: 'mode', header: 'Comes by', mobile: 'aside', render: (s) => s.commuteMode },
    { key: 'phone', header: 'Guardian phone', render: (s) => orDash(s.guardianPhone) },
    { key: 'notes', header: 'Notes', mobile: 'hidden', render: (s) => orDash(s.notes) },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      render: (s) => (
        <Menu
          label={`Actions for ${s.name}`}
          items={[{ label: 'Remove from list', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(s) }]}
        />
      ),
    },
  ]

  const modeCount = (value: CommuteMode) => records.filter((r) => r.commuteMode === value).length
  const filtered = Boolean(search.trim() || mode !== 'all' || filterClass || filterSection)
  const filterSections = sectionsOf(filterClass)
  const formSections = sectionsOf(formClass)

  return (
    <Page>
      <Card flush className="tr-records">
        <div className="tr-records__toolbar">
          <FilterBar
            search={{ placeholder: 'Search name, roll or phone', value: search, onChange: setSearch, label: 'Search self students' }}
            chips={[
              { id: 'all', label: 'All', count: records.length, active: mode === 'all' },
              ...COMMUTE_MODES.filter((m) => modeCount(m) > 0).map((m) => ({ id: m, label: m, count: modeCount(m), active: mode === m })),
            ]}
            onChipClick={(id) => setMode(id as typeof mode)}
            chipsLabel="Comes by"
            filters={
              <>
                <Select
                  size="sm"
                  aria-label="Class"
                  value={filterClass}
                  onChange={(e) => {
                    setFilterClass(e.target.value)
                    setFilterSection('')
                  }}
                  placeholder="All classes"
                  options={classOptions.map((item) => item.className)}
                />
                {filterClass && filterSections.length ? (
                  <Select
                    size="sm"
                    aria-label="Section"
                    value={filterSection}
                    onChange={(e) => setFilterSection(e.target.value)}
                    placeholder="All sections"
                    options={filterSections}
                  />
                ) : null}
              </>
            }
            actions={
              <Button variant="primary" icon={Plus} onClick={openAdd}>
                Add student
              </Button>
            }
          />
        </div>
        <DataTable
          caption="Self students"
          columns={columns}
          rows={rows}
          getRowKey={(s) => s._id}
          loading={loading}
          loadingLabel="Loading self students…"
          empty={
            records.length === 0 ? (
              <EmptyState
                icon={Footprints}
                title="No self students recorded"
                body="List the students who walk, cycle or are dropped by family, so the transport office knows who is not on a bus."
                action={
                  <Button size="sm" icon={Plus} onClick={openAdd}>
                    Add student
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={Footprints}
                title="No students match these filters"
                body="Try another search, class or mode."
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setMode('all')
                        setFilterClass('')
                        setFilterSection('')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Add self student"
        description="A student who comes to school without school transport."
        icon={Footprints}
        onSubmit={(event) => {
          event.preventDefault()
          if (!saving) void save()
        }}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Add student
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          <Select
            label="Class"
            value={formClass}
            onChange={(e) => {
              setFormClass(e.target.value)
              setFormSection('')
              setStudentId('')
            }}
            placeholder="All classes"
            options={classOptions.map((item) => item.className)}
          />
          <Select
            label="Section"
            value={formSection}
            disabled={!formClass}
            onChange={(e) => {
              setFormSection(e.target.value)
              setStudentId('')
            }}
            placeholder={formClass ? 'All sections' : 'Choose a class first'}
            options={formSections}
          />
          <Select
            className="is-wide"
            label="Student"
            required
            value={studentId}
            disabled={studentsLoading}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder={studentsLoading ? 'Loading students…' : availableStudents.length ? 'Choose a student' : 'No students left to add'}
            options={availableStudents.map((student) => ({
              value: student._id,
              label: `${student.name} · ${[student.class, student.section].filter(Boolean).join(' ')}${student.rollNumber ? ` · Roll ${student.rollNumber}` : ''}`,
            }))}
            error={tried && !studentId ? 'Choose a student.' : undefined}
          />
          <Select label="Comes by" value={commuteMode} onChange={(e) => setCommuteMode(e.target.value as CommuteMode)} options={COMMUTE_MODES} />
          <TextField label="Guardian phone" type="tel" inputMode="tel" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
          <TextArea className="is-wide" label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Remove ${removing?.name || 'student'} from the list?`}
        description="Only the self-commute record goes. The student's profile is not touched."
        footer={
          <>
            <Button onClick={() => setRemoving(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>
              Remove
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default TrnstSelfStudents
