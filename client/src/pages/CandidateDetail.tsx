import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import candidateService from '../services/candidateService'
import { ExternalLink, Pencil, Plus, Search, Trash2, UserX } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Entity,
  Icon,
  Page,
  PageHeader,
  TextField,
  formatDate as formatShortDate,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-candidates.css'
import { useSubjectList } from '../hooks/useSubjects'
import { useUpdateCandidateMutation } from '../hooks/useCandidates'

interface Candidate {
  _id: string
  name: string
  rollNumber: string
  schoolName?: string
  schoolCode?: string
  class?: string
  motherName?: string
  fatherName?: string
  sex?: string
  category?: string
  pwd?: string
  consession?: string
  dateOfBirth?: string
  previousRoll?: string
  previousYear?: string
  flc?: string
  email?: string
  phone?: string
  course?: string
  semester?: number
  batch?: string
  department?: string
  status: 'active' | 'inactive' | 'graduated' | 'suspended'
  admissionDate?: string
  subjects?: Array<{
    _id: string
    name: string
    code: string
    class?: string
    credits?: number
    examDate?: string | null
    answerSheetType?: string
    serialNumber?: string
    roomNo?: string | null
    invigilator1?: { name: string; oasisId?: string } | null
    invigilator2?: { name: string; oasisId?: string } | null
  }>
  subjectCodes?: Array<{ code: string; medium?: string }> | string[]
  importedFrom?: {
    fileName: string
    uploadDate: string
    cloudinaryUrl: string
  }
  createdAt: string
  updatedAt: string
  photoUrl?: string
  createdBy?: { name: string; email: string }
  updatedBy?: { name: string; email: string }
}

const CandidateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [subjectSerials, setSubjectSerials] = useState<Record<string, string>>({})
  const [serialsLoading, setSerialsLoading] = useState(false)
  const [assignSubjectOpen, setAssignSubjectOpen] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [subjectToRemove, setSubjectToRemove] = useState<{ _id: string; name: string; code: string } | null>(null)

  const updateCandidateMutation = useUpdateCandidateMutation()

  const candidateClass = candidate?.class ?? ''
  const { data: subjectListData, isLoading: subjectsLoading } = useSubjectList(
    { limit: 200, ...(candidateClass ? { class: candidateClass } : {}) },
    { enabled: assignSubjectOpen }
  )

  useEffect(() => {
    if (id) {
      fetchCandidate()
    }
  }, [id])

  useEffect(() => {
    if (!id || !candidate?.subjects?.length) return
    let cancelled = false
    setSerialsLoading(true)
    candidateService
      .getCandidateSubjectSerials(id)
      .then((serials) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        serials.forEach((s) => {
          if (s.serialNumber) map[s.subjectId] = s.serialNumber
        })
        setSubjectSerials(map)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSerialsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, candidate?._id])

  const fetchCandidate = async () => {
    try {
      setLoading(true)
      setSubjectSerials({})
      const response = await candidateService.getCandidate(id!)
      setCandidate(response.data.data)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to fetch candidate details')
      navigate('/candidate-details')
    } finally {
      setLoading(false)
    }
  }

  const handleAssignSubject = async (subjectId: string) => {
    if (!candidate || !id) return
    const existingIds = candidate.subjects?.map((s) => s._id) ?? []
    try {
      await updateCandidateMutation.mutateAsync({
        id,
        data: { name: candidate.name, rollNumber: candidate.rollNumber, subjects: [...existingIds, subjectId] },
      })
      await fetchCandidate()
      toast.success('Subject assigned successfully')
      setAssignSubjectOpen(false)
      setAssignSearch('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to assign subject')
    }
  }

  const handleRemoveSubject = async () => {
    if (!candidate || !id || !subjectToRemove) return
    const remaining = candidate.subjects
      ?.filter((s) => s._id !== subjectToRemove._id)
      .map((s) => s._id) ?? []
    try {
      await updateCandidateMutation.mutateAsync({ id, data: { name: candidate.name, rollNumber: candidate.rollNumber, subjects: remaining } })
      await fetchCandidate()
      toast.success('Subject removed')
      setSubjectToRemove(null)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to remove subject')
    }
  }

  const STATUS: Record<string, { tone: 'success' | 'neutral' | 'info' | 'danger'; label: string }> = {
    active: { tone: 'success', label: 'Active' },
    inactive: { tone: 'neutral', label: 'Inactive' },
    graduated: { tone: 'info', label: 'Graduated' },
    suspended: { tone: 'danger', label: 'Suspended' },
  }

  const getStatusBadge = (status: string) => {
    const s = STATUS[status] || { tone: 'neutral' as const, label: status.charAt(0).toUpperCase() + status.slice(1) }
    return <Badge tone={s.tone}>{s.label}</Badge>
  }

  const formatDate = (dateString: string) => {
    const d = new Date(dateString)
    if (Number.isNaN(d.getTime())) return '—'
    return `${formatShortDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
  }

  const formatExamDate = (dateString?: string | null) => {
    if (!dateString) return 'TBD'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'TBD'
    return formatShortDate(date)
  }

  // CBSE lists arrive in capitals; show people and school names the way they're written.
  const displayName = (value?: string) =>
    value && value === value.toUpperCase()
      ? value.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
      : value

  const SEX: Record<string, string> = { F: 'Female', M: 'Male', T: 'Transgender' }
  const CATEGORY: Record<string, string> = { G: 'General', GEN: 'General', OBC: 'OBC', SC: 'SC', ST: 'ST' }
  const expand = (map: Record<string, string>, value?: string) =>
    value ? map[value.trim().toUpperCase()] ?? value : undefined

  const sortedSubjects = useMemo(() => {
    if (!candidate?.subjects || candidate.subjects.length === 0) return []

    return [...candidate.subjects].sort((a, b) => {
      const aTime = a.examDate ? new Date(a.examDate).getTime() : Number.POSITIVE_INFINITY
      const bTime = b.examDate ? new Date(b.examDate).getTime() : Number.POSITIVE_INFINITY
      if (aTime !== bTime) return aTime - bTime
      return String(a.code || '').localeCompare(String(b.code || ''))
    })
  }, [candidate?.subjects])

  const importedSubjectCodes = useMemo(() => {
    const codes = (candidate?.subjectCodes || []).map(sc =>
      typeof sc === 'string' ? sc : sc.code
    )
    return new Set(codes)
  }, [candidate?.subjectCodes])

  if (loading) {
    return (
      <Page>
        <Card>
          <CardLoading label="Loading candidate…" />
        </Card>
      </Page>
    )
  }

  if (!candidate) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={UserX}
            title="Candidate not found"
            body="The candidate may have been removed, or the link is out of date."
            action={
              <Button size="sm" onClick={() => navigate('/candidate-details')}>
                Back to candidates
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  type EnrolledSubject = NonNullable<Candidate['subjects']>[number]

  const invigilator = (person?: { name: string; oasisId?: string } | null) =>
    person ? <Entity primary={person.name} secondary={person.oasisId ? `OASIS ${person.oasisId}` : undefined} /> : '—'

  const subjectColumns: DataTableColumn<EnrolledSubject>[] = [
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      render: (subject) => <Entity primary={subject.name} secondary={`Code ${subject.code}`} />,
    },
    { key: 'examDate', header: 'Exam date', mobile: 'subtitle', render: (subject) => formatExamDate(subject.examDate) },
    { key: 'answerSheetType', header: 'Answer sheet', render: (subject) => subject.answerSheetType ?? '—' },
    {
      key: 'serial',
      header: 'Serial no.',
      numeric: true,
      render: (subject) =>
        subjectSerials[subject._id] ? (
          subjectSerials[subject._id]
        ) : serialsLoading ? (
          <span className="cb-spinner" role="status" aria-label="Loading serial number" />
        ) : (
          subject.serialNumber ?? '—'
        ),
    },
    { key: 'roomNo', header: 'Room no.', render: (subject) => subject.roomNo ?? '—' },
    {
      key: 'invigilators',
      header: 'Invigilators',
      render: (subject) =>
        subject.invigilator1 || subject.invigilator2 ? (
          <div className="cx-cand-invigilators">
            {subject.invigilator1 ? invigilator(subject.invigilator1) : null}
            {subject.invigilator2 ? invigilator(subject.invigilator2) : null}
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      width: 48,
      interactive: true,
      mobile: 'aside',
      render: (subject) =>
        !importedSubjectCodes.has(subject.code) ? (
          <Button
            size="sm"
            variant="tertiary"
            icon={Trash2}
            aria-label={`Remove ${subject.code}`}
            title="Remove manually assigned subject"
            onClick={() => setSubjectToRemove({ _id: subject._id, name: subject.name, code: subject.code })}
          />
        ) : null,
    },
  ]

  const present = <T extends { value: React.ReactNode }>(items: Array<T | false | null | undefined | '' | 0>) =>
    items.filter(Boolean) as T[]

  const personalItems = present([
    candidate.dateOfBirth && { label: 'Date of birth', value: formatShortDate(candidate.dateOfBirth) },
    candidate.sex && { label: 'Sex', value: expand(SEX, candidate.sex) },
    candidate.category && { label: 'Category', value: expand(CATEGORY, candidate.category) },
    candidate.pwd && { label: 'PwD', value: candidate.pwd },
    candidate.consession && { label: 'Concession', value: candidate.consession },
    candidate.flc && { label: 'FLC', value: candidate.flc },
  ])

  const familyItems = present([
    candidate.motherName && { label: 'Mother’s name', value: displayName(candidate.motherName) },
    candidate.fatherName && { label: 'Father’s name', value: displayName(candidate.fatherName) },
  ])

  const schoolItems = present([
    candidate.schoolCode && { label: 'School code', value: candidate.schoolCode },
    candidate.schoolName && { label: 'School name', value: displayName(candidate.schoolName), wide: !candidate.schoolCode },
  ])

  const contactItems = present([
    candidate.email && {
      label: 'Email',
      value: (
        <a className="cb-link" href={`mailto:${candidate.email}`}>
          {candidate.email}
        </a>
      ),
    },
    candidate.phone && {
      label: 'Phone',
      value: (
        <a className="cb-link" href={`tel:${candidate.phone}`}>
          {candidate.phone}
        </a>
      ),
    },
  ])

  const detailSections = [
    { title: 'Personal', items: personalItems, columns: 3 as const },
    { title: 'Family', items: familyItems, columns: 3 as const },
    { title: 'School', items: schoolItems, columns: 3 as const },
    { title: 'Contact', items: contactItems, columns: 3 as const },
  ].filter((section) => section.items.length > 0)

  const subtitleParts = [
    `Roll no. ${candidate.rollNumber}`,
    candidate.class ? `Class ${candidate.class}` : '',
    displayName(candidate.schoolName) || '',
  ].filter(Boolean)

  const enrolledIds = new Set(candidate.subjects?.map((s) => s._id) ?? [])
  const allSubjects: any[] = subjectListData?.data ?? []
  const availableSubjects = allSubjects.filter((s) => {
    if (enrolledIds.has(s._id)) return false
    if (!assignSearch.trim()) return true
    const q = assignSearch.trim().toLowerCase()
    return (s.name ?? '').toLowerCase().includes(q) || (s.code ?? '').toLowerCase().includes(q)
  })

  const closeAssign = () => {
    setAssignSubjectOpen(false)
    setAssignSearch('')
  }

  return (
    <Page>
      <PageHeader
        title={
          <span className="cx-cand-title">
            {displayName(candidate.name)}
            {getStatusBadge(candidate.status)}
          </span>
        }
        subtitle={subtitleParts.join(' · ')}
        actions={
          <Button icon={Pencil} onClick={() => navigate(`/candidate-details/${candidate._id}/edit`)}>
            Edit candidate
          </Button>
        }
      />

      <div className="cb-grid-8-4">
        <div className="cb-stack">
          <Card
            flush
            title="Exam schedule"
            subtitle={
              sortedSubjects.length
                ? `${sortedSubjects.length} ${sortedSubjects.length === 1 ? 'subject' : 'subjects'}, in exam date order`
                : undefined
            }
            action={
              <Button size="sm" icon={Plus} onClick={() => setAssignSubjectOpen(true)}>
                Assign subject
              </Button>
            }
          >
            <DataTable
              caption="Exam schedule"
              columns={subjectColumns}
              rows={sortedSubjects}
              getRowKey={(subject) => subject._id}
              empty={<EmptyState compact title="No subjects enrolled yet" body="Assign the subjects this candidate sits." />}
            />
          </Card>

          {detailSections.length ? (
            <Card title="Candidate details">
              <div className="cx-cand-sections">
                {detailSections.map((section) => (
                  <section key={section.title} className="cx-cand-section">
                    <h3 className="cb-subhead">{section.title}</h3>
                    <DetailList columns={section.columns} items={section.items} />
                  </section>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="cb-stack">
          {candidate.photoUrl ? (
            <Card title="Photo">
              <img src={candidate.photoUrl} alt={displayName(candidate.name)} className="cx-cand-photo" />
            </Card>
          ) : null}

          {candidate.subjectCodes && candidate.subjectCodes.length > 0 ? (
            <Card title="Subject codes" subtitle="As read from the CBSE list">
              <div className="cx-cand-codes">
                {candidate.subjectCodes.map((item, index) => {
                  const code = typeof item === 'string' ? item : item.code
                  const medium = typeof item === 'object' && item.medium ? item.medium : ''
                  const mediumLabel = medium === '2' ? 'Hindi' : medium === '1' ? 'English' : ''
                  return (
                    <Badge key={`${code}-${index}`} dot={false}>
                      {code}
                      {mediumLabel ? ` · ${mediumLabel}` : ''}
                    </Badge>
                  )
                })}
              </div>
            </Card>
          ) : null}

          <Card title="Record">
            <DetailList
              columns={1}
              items={present([
                candidate.importedFrom && {
                  label: 'Imported from',
                  value: (
                    <Entity
                      primary={
                        <a
                          className="cb-link cx-cand-file"
                          href={candidate.importedFrom.cloudinaryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {candidate.importedFrom.fileName}
                          <Icon icon={ExternalLink} size={14} />
                        </a>
                      }
                      secondary={formatDate(candidate.importedFrom.uploadDate)}
                    />
                  ),
                },
                {
                  label: 'Created',
                  value: (
                    <Entity
                      primary={formatDate(candidate.createdAt)}
                      secondary={candidate.createdBy?.name ? `by ${candidate.createdBy.name}` : undefined}
                    />
                  ),
                },
                {
                  label: 'Last updated',
                  value: (
                    <Entity
                      primary={formatDate(candidate.updatedAt)}
                      secondary={candidate.updatedBy?.name ? `by ${candidate.updatedBy.name}` : undefined}
                    />
                  ),
                },
              ])}
            />
          </Card>
        </div>
      </div>

      <Dialog
        open={assignSubjectOpen}
        onClose={closeAssign}
        title="Assign subject"
        description={candidate.class ? `Subjects for class ${candidate.class} that this candidate isn’t enrolled in.` : 'Subjects this candidate isn’t enrolled in.'}
        footer={<Button onClick={closeAssign}>Done</Button>}
      >
        <TextField
          size="sm"
          icon={Search}
          aria-label="Search subjects"
          placeholder="Search by name or code"
          value={assignSearch}
          onChange={(e) => setAssignSearch(e.target.value)}
          autoFocus
        />
        {subjectsLoading ? (
          <CardLoading label="Loading subjects…" />
        ) : availableSubjects.length === 0 ? (
          <EmptyState
            compact
            title={assignSearch ? 'No subjects match this search' : 'All available subjects are already enrolled'}
          />
        ) : (
          <ul className="cx-cand-picklist">
            {availableSubjects.map((subject) => (
              <li key={subject._id}>
                <button
                  type="button"
                  className="cx-cand-pick"
                  disabled={updateCandidateMutation.isPending}
                  onClick={() => handleAssignSubject(subject._id)}
                >
                  <Entity
                    primary={subject.name}
                    secondary={`Code ${subject.code}${subject.class ? ` · Class ${subject.class}` : ''}`}
                  />
                  {updateCandidateMutation.isPending ? <span className="cb-spinner" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog
        open={!!subjectToRemove}
        onClose={() => setSubjectToRemove(null)}
        tone="danger"
        size="md"
        title={`Remove ${subjectToRemove?.code || 'this subject'}?`}
        description={subjectToRemove ? `${subjectToRemove.name} (code ${subjectToRemove.code}) is taken off this candidate.` : undefined}
        footer={
          <>
            <Button onClick={() => setSubjectToRemove(null)} disabled={updateCandidateMutation.isPending}>
              Keep subject
            </Button>
            <Button variant="danger" loading={updateCandidateMutation.isPending} onClick={() => void handleRemoveSubject()}>
              Remove subject
            </Button>
          </>
        }
      >
        <Banner tone="warning" title="Check what else uses this subject">
          <ul className="cx-cand-help">
            <li>If a seating plan is already generated for this subject, this candidate’s room allocation stays. You may need to regenerate the seating plan.</li>
            <li>Answer sheet counts for this subject may become inaccurate.</li>
            <li>Dashboard exam filters may change if no other candidate is enrolled in this subject.</li>
          </ul>
        </Banner>
      </Dialog>
    </Page>
  )
}

export default CandidateDetail
