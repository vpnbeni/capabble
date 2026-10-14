import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { CalendarX2, Check, Download, ExternalLink, FileText, Upload, Users } from 'lucide-react'
import { useCandidates } from '../hooks/useCandidates'
import { useCentreDatesheetEntries } from '../hooks/useSeatingPlan'
import {
  useAbsenteeReportMutation,
  useAttendanceAbsentees,
  useSaveAbsenteesMutation,
  useUploadAttendanceMutation,
} from '../hooks/useAttendance'
import {
  Banner,
  Button,
  Card,
  CardToolbar,
  EmptyState,
  FilterBar,
  Page,
  Sheet,
  Tabs,
  cx,
  PdfFrame,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-attendance.css'

type ClassTab = 'classX' | 'classXII'

interface ExamColumn {
  date: string
  subjectCode: string
  key: string // unique key: date|subjectCode
}

interface DateGroup {
  date: string
  columns: ExamColumn[]
}

const Attendance: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ClassTab>('classX')
  // Tracks absent candidates: absentees[candidateId][colKey] = true means ABSENT
  const [absentees, setAbsentees] = useState<Record<string, Record<string, boolean>>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch candidates for both classes (Candidate model stores '10th'/'12th')
  const { data: classXData, isLoading: loadingX } = useCandidates({ class: '10th', limit: 1000 })
  const { data: classXIIData, isLoading: loadingXII } = useCandidates({ class: '12th', limit: 1000 })

  // Fetch centre datesheet entries
  const { data: datesheetEntries = [], isLoading: loadingDatesheet } = useCentreDatesheetEntries()
  const {
    data: absenteeRecords = [],
    isFetched: loadedAbsentees,
  } = useAttendanceAbsentees()
  const saveAbsenteesMutation = useSaveAbsenteesMutation()
  const uploadAttendanceMutation = useUploadAttendanceMutation()
  const absenteeReportMutation = useAbsenteeReportMutation()

  const classXCandidates = classXData?.data ?? []
  const classXIICandidates = classXIIData?.data ?? []

  // Build columns: one per (date, subjectCode) pair, grouped by date for header spanning
  const classXDateGroups = useMemo(() => buildDateGroups(datesheetEntries, '10'), [datesheetEntries])
  const classXIIDateGroups = useMemo(() => buildDateGroups(datesheetEntries, '12'), [datesheetEntries])

  // Flat list of all columns for iteration
  const classXColumns = useMemo(() => classXDateGroups.flatMap(g => g.columns), [classXDateGroups])
  const classXIIColumns = useMemo(() => classXIIDateGroups.flatMap(g => g.columns), [classXIIDateGroups])

  // Current tab data
  const candidates = activeTab === 'classX' ? classXCandidates : classXIICandidates
  const dateGroups = activeTab === 'classX' ? classXDateGroups : classXIIDateGroups
  const columns = activeTab === 'classX' ? classXColumns : classXIIColumns
  const isLoading = activeTab === 'classX' ? loadingX : loadingXII

  const saving = saveAbsenteesMutation.isPending
  const uploading = uploadAttendanceMutation.isPending
  const previewLoading = absenteeReportMutation.isPending

  // Sync absentee records into local toggle map
  useEffect(() => {
    const map: Record<string, Record<string, boolean>> = {}
    absenteeRecords.forEach((record) => {
      const key = `${record.examDate}|${record.subjectCode}`
      if (!map[record.candidateId]) map[record.candidateId] = {}
      map[record.candidateId][key] = true
    })
    setAbsentees(map)
  }, [absenteeRecords])

  // Filter by search
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates
    const q = searchQuery.toLowerCase()
    return candidates.filter(c =>
      c.rollNumber?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q)
    )
  }, [candidates, searchQuery])

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const day = date.getDate().toString().padStart(2, '0')
    const month = date.toLocaleString('en-US', { month: 'short' })
    return `${day} ${month}`
  }

  const formatDay = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', { weekday: 'short' })
  }

  const activeClassValue = activeTab === 'classX' ? 'X' : 'XII'

  const getAbsenteeReportFilename = () =>
    `attendance-absentee-list-${activeClassValue.toLowerCase()}.pdf`

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewError(null)
    setPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return null
    })
  }

  const openPreview = useCallback(async () => {
    setPreviewOpen(true)
    setPreviewError(null)
    setPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return null
    })

    try {
      const blob = await absenteeReportMutation.mutateAsync(activeClassValue)
      const contentType = blob.type || ''

      if (typeof blob === 'object' && blob !== null && contentType.toLowerCase().includes('application/pdf')) {
        const objectUrl = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
        setPreviewUrl(objectUrl)
      } else {
        const text = await (blob instanceof Blob ? blob.text() : Promise.resolve(String(blob)))
        let message = 'Failed to generate preview'
        try {
          const json = JSON.parse(text)
          if (typeof json?.error === 'string') message = json.error
        } catch (_) {
          // Ignore invalid JSON error bodies here.
        }
        setPreviewError(message)
      }
    } catch (error: any) {
      console.error('Failed to load absentee report preview:', error)
      setPreviewError(error?.serverMessage ?? error?.message ?? 'Failed to load absentee report preview')
    }
  }, [absenteeReportMutation, activeClassValue])

  // Toggle absent status
  const toggleAbsent = (candidateId: string, colKey: string) => {
    setAbsentees(prev => ({
      ...prev,
      [candidateId]: {
        ...prev[candidateId],
        [colKey]: !prev[candidateId]?.[colKey],
      },
    }))
  }

  // Save absentees to API
  const handleSave = useCallback(async () => {
    try {
      // Collect ALL candidate+column pairs into a flat array
      const allCandidates = [...classXCandidates, ...classXIICandidates]

      const payload: { candidateId: string; examDate: string; subjectCode: string; class: string; isAbsent: boolean }[] = []

      allCandidates.forEach(candidate => {
        const candidateClass = candidate.class === '10th' ? 'X' : 'XII'
        const relevantColumns = candidateClass === 'X' ? classXColumns : classXIIColumns

        relevantColumns.forEach(col => {
          // Check if candidate has this subject
          const hasSubject = candidate.subjectCodes?.some((item: any) => {
            const code = typeof item === 'string' ? item : item.code
            return code === col.subjectCode
          }) ?? false

          if (!hasSubject) return

          const isAbsent = absentees[candidate._id]?.[col.key] ?? false
          payload.push({
            candidateId: candidate._id,
            examDate: col.date,
            subjectCode: col.subjectCode,
            class: candidateClass,
            isAbsent,
          })
        })
      })

      await saveAbsenteesMutation.mutateAsync(payload)
    } catch {
      // API interceptor already shows message.
    }
  }, [absentees, classXCandidates, classXIICandidates, classXColumns, classXIIColumns, saveAbsenteesMutation])

  // Upload attendance sheet
  const handleUpload = useCallback(async (file: File) => {
    const classValue = activeTab === 'classX' ? 'X' : 'XII'
    try {
      await uploadAttendanceMutation.mutateAsync({ file, classValue })
    } catch {
      // API interceptor already shows message.
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [activeTab, uploadAttendanceMutation])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  const tabs = [
    { id: 'classX', label: 'Class X', count: classXCandidates.length || undefined },
    { id: 'classXII', label: 'Class XII', count: classXIICandidates.length || undefined },
  ]
  const className = activeTab === 'classX' ? 'Class X' : 'Class XII'

  // Count present per column (candidates with subject minus absent)
  const getPresentCount = (col: ExamColumn) => {
    const candidatesWithSubject = filteredCandidates.filter(c =>
      c.subjectCodes?.some((item: any) => {
        const code = typeof item === 'string' ? item : item.code
        return code === col.subjectCode
      })
    )
    const absentCount = candidatesWithSubject.filter(c => absentees[c._id]?.[col.key]).length
    return { present: candidatesWithSubject.length - absentCount, total: candidatesWithSubject.length }
  }

  const hasSubjectCode = (candidate: (typeof candidates)[number], subjectCode: string) =>
    candidate.subjectCodes?.some((item: any) => {
      const code = typeof item === 'string' ? item : item.code
      return code === subjectCode
    }) ?? false

  const startsGroup = (idx: number) => {
    const col = columns[idx]
    const isFirstInGroup = idx === 0 || columns[idx - 1].date !== col.date
    return isFirstInGroup && idx > 0
  }

  const ready = !(isLoading || loadingDatesheet || !loadedAbsentees)

  return (
    <Page>
      <Card flush title="Exam attendance" subtitle="Mark candidates absent per paper. Everyone else counts as present.">
        <CardToolbar>
          <FilterBar
            filters={
              <Tabs
                variant="segmented"
                label="Class"
                items={tabs}
                value={activeTab}
                onChange={(id) => setActiveTab(id as ClassTab)}
              />
            }
            search={{ placeholder: 'Search roll number or name', value: searchQuery, onChange: setSearchQuery, label: 'Search candidates' }}
            actions={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={onFileChange}
                  hidden
                />
                <Button
                  icon={FileText}
                  onClick={openPreview}
                  loading={previewLoading}
                  title={`Preview absentee list PDF for ${activeClassValue}`}
                >
                  Absentee list
                </Button>
                <Button
                  icon={Upload}
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploading}
                  title={`Upload attendance sheet for ${className}`}
                >
                  Upload sheet
                </Button>
                <Button variant="primary" icon={Check} onClick={handleSave} loading={saving}>
                  Save attendance
                </Button>
              </>
            }
          />
        </CardToolbar>

        {!ready ? (
          <CardLoading label="Loading attendance…" />
        ) : filteredCandidates.length === 0 || columns.length === 0 ? (
          filteredCandidates.length === 0 ? (
            <EmptyState
              icon={Users}
              title={searchQuery.trim() ? 'No candidates match this search' : `No ${className} candidates yet`}
              body={searchQuery.trim() ? undefined : 'Import candidates first, then mark attendance here.'}
              action={
                searchQuery.trim() ? (
                  <Button size="sm" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              icon={CalendarX2}
              title={`No ${className} papers on the datesheet`}
              body="Import the datesheet first, then mark attendance here."
            />
          )
        ) : (
          <div className="cb-att cx-att">
            <div className="cb-att__scroll">
              <table className="cb-att__table">
                <caption className="cb-visually-hidden">{className} attendance by paper</caption>
                <thead>
                  <tr>
                    <th rowSpan={2} scope="col" className="cb-att__who">
                      Candidate
                    </th>
                    {dateGroups.map((group, gi) => (
                      <th
                        key={group.date}
                        colSpan={group.columns.length}
                        scope="colgroup"
                        className={cx(gi > 0 && 'cx-att__group')}
                      >
                        <span className="cb-att__dnum">{formatDate(group.date)}</span>
                        <span className="cb-att__dwk">{formatDay(group.date)}</span>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {columns.map((col, idx) => (
                      <th key={col.key} scope="col" className={cx('cx-att__code', startsGroup(idx) && 'cx-att__group')}>
                        {col.subjectCode}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((candidate) => (
                    <tr key={candidate._id}>
                      <th scope="row" className="cb-att__who">
                        <span className="cb-att__name">{candidate.name}</span>
                        <span className="cb-att__meta">{candidate.rollNumber}</span>
                      </th>
                      {columns.map((col, idx) => {
                        const isAbsent = absentees[candidate._id]?.[col.key] ?? false
                        const groupCls = cx(startsGroup(idx) && 'cx-att__group')
                        if (!hasSubjectCode(candidate, col.subjectCode)) {
                          return (
                            <td key={col.key} className={groupCls} title="Candidate does not take this paper">
                              <span className="cb-att__empty" aria-label="Not taking this paper">—</span>
                            </td>
                          )
                        }
                        return (
                          <td key={col.key} className={groupCls}>
                            <button
                              type="button"
                              className="cb-att__cellbtn"
                              onClick={() => toggleAbsent(candidate._id, col.key)}
                              aria-pressed={isAbsent}
                              aria-label={`${candidate.name}, ${col.subjectCode} on ${formatDate(col.date)}: ${isAbsent ? 'absent' : 'present'}. ${isAbsent ? 'Mark present' : 'Mark absent'}`}
                              title={isAbsent ? 'Mark present' : 'Mark absent'}
                            >
                              <span className={cx('cb-att__mark', isAbsent ? 'cb-att__mark--danger' : 'cb-att__mark--success')}>
                                {isAbsent ? 'A' : 'P'}
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className="cb-att__who">
                      Present
                    </th>
                    {columns.map((col, idx) => {
                      const { present, total } = getPresentCount(col)
                      return (
                        <td key={col.key} className={cx('cx-att__total', startsGroup(idx) && 'cx-att__group')}>
                          <span className="cb-strong">{present}</span>
                          <span className="cb-subtle">/{total}</span>
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="cb-att__legend">
              <span className="cb-att__legenditem">
                <span className="cb-att__mark cb-att__mark--success">P</span> Present
              </span>
              <span className="cb-att__legenditem">
                <span className="cb-att__mark cb-att__mark--danger">A</span> Absent — select a cell to switch
              </span>
              <span className="cb-att__legenditem">
                <span className="cb-att__empty">—</span> Doesn’t take this paper
              </span>
            </div>
          </div>
        )}
      </Card>

      <Sheet
        open={previewOpen && Boolean(previewUrl || previewLoading || previewError)}
        onClose={closePreview}
        size="xl"
        icon={FileText}
        title="Absentee list"
        description={`${className} · PDF preview`}
        footer={
          <>
            <Button onClick={closePreview}>Close</Button>
            {previewUrl ? (
              <>
                <Button icon={ExternalLink} onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
                  Open in new tab
                </Button>
                <Button
                  variant="primary"
                  icon={Download}
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = previewUrl
                    link.download = getAbsenteeReportFilename()
                    link.click()
                  }}
                >
                  Download PDF
                </Button>
              </>
            ) : null}
          </>
        }
      >
        {previewLoading ? (
          <CardLoading label="Generating preview…" />
        ) : previewError ? (
          <Banner tone="warning" title="The preview couldn’t be generated">
            {previewError}
          </Banner>
        ) : previewUrl ? (
          <PdfFrame src={previewUrl} title="Absentee list PDF preview" />
        ) : null}
      </Sheet>
    </Page>
  )
}

/** Build date groups with individual subject columns, sorted by date then subject code */
function buildDateGroups(
  entries: { examDate: string; subjectCode: string; class: string }[],
  classFilter: string
): DateGroup[] {
  const map = new Map<string, Set<string>>()

  entries
    .filter(e => e.class === classFilter)
    .forEach(e => {
      if (!map.has(e.examDate)) map.set(e.examDate, new Set())
      map.get(e.examDate)!.add(e.subjectCode)
    })

  const sortedDates = [...map.keys()].sort()

  return sortedDates.map(date => {
    const codes = [...map.get(date)!].sort()
    return {
      date,
      columns: codes.map(code => ({
        date,
        subjectCode: code,
        key: `${date}|${code}`,
      })),
    }
  })
}

export default Attendance
