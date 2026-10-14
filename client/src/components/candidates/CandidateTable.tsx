import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Entity,
  formatDate,
  type DataTableColumn,
  Pagination,
} from '@/components/ui'
import '@/components/exmcl/centre-candidates.css'

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
  photoUrl?: string
  subjects?: Array<{ _id: string; name: string; code: string }>
  subjectCodes?: Array<{ code: string; medium?: string }> | string[]
  importedFrom?: {
    fileName: string
    uploadDate: string
    cloudinaryUrl: string
  }
  createdAt: string
  updatedAt: string
}

interface Pagination {
  page: number
  pages: number
  total: number
  limit: number
}

type SortableField = 'rollNumber' | 'name' | 'class'

interface CandidateTableProps {
  candidates: Candidate[]
  loading: boolean
  pagination: Pagination
  onPageChange: (page: number) => void
  pageSizeOptions?: { value: number; label: string }[]
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  sortField?: SortableField
  sortDirection?: 'asc' | 'desc'
  onSortChange?: (field: SortableField) => void
  /** Kept for compatibility: the table always renders flush, so the parent Card provides the frame. */
  noCard?: boolean
}

const MEDIUM_LABEL: Record<string, string> = { '1': 'English', '2': 'Hindi' }

const SubjectCodes: React.FC<{ candidate: Candidate }> = ({ candidate }) => {
  if (candidate.subjectCodes && candidate.subjectCodes.length > 0) {
    return (
      <div className="cx-cand-codes">
        {candidate.subjectCodes.map((item, index) => {
          const code = typeof item === 'string' ? item : item.code
          const medium = typeof item === 'object' && item.medium ? MEDIUM_LABEL[item.medium] || '' : ''
          return (
            <Badge size="sm" dot={false} key={`${code}-${index}`} title={medium ? `Medium: ${medium}` : undefined}>
              {code}
              {medium ? ` · ${medium[0]}` : ''}
            </Badge>
          )
        })}
      </div>
    )
  }
  if (candidate.subjects && candidate.subjects.length > 0) {
    return (
      <div className="cx-cand-codes">
        {candidate.subjects.map((subject) => (
          <Badge size="sm" dot={false} key={subject._id}>{subject.code}</Badge>
        ))}
      </div>
    )
  }
  return <Badge tone="warning">No subjects</Badge>
}

const CandidateTable: React.FC<CandidateTableProps> = ({
  candidates,
  loading,
  pagination,
  onPageChange,
  pageSizeOptions,
  pageSize,
  onPageSizeChange,
  sortField,
  sortDirection,
  onSortChange,
}) => {
  const navigate = useNavigate()

  const columns: DataTableColumn<Candidate>[] = [
    {
      key: 'rollNumber',
      header: 'Roll no.',
      sortable: true,
      mobile: 'aside',
      render: (c) => <Entity primary={<span className="cb-strong">{c.rollNumber}</span>} secondary={c.flc ? `FLC ${c.flc}` : undefined} />,
    },
    {
      key: 'name',
      header: 'Candidate',
      sortable: true,
      mobile: 'title',
      render: (c) => {
        const meta = [c.dateOfBirth ? `Born ${formatDate(c.dateOfBirth)}` : '', c.sex ? `Sex ${c.sex}` : '']
          .filter(Boolean)
          .join(' · ')
        return (
          <div className="cx-cand-name">
            <Avatar name={c.name} src={c.photoUrl} size="md" />
            <Entity primary={c.name} secondary={meta || undefined} />
          </div>
        )
      },
    },
    {
      key: 'class',
      header: 'Class',
      sortable: true,
      mobile: 'subtitle',
      render: (c) => (c.class ? <Badge dot={false}>Class {c.class}</Badge> : '—'),
    },
    {
      key: 'parents',
      header: 'Parents',
      render: (c) =>
        c.motherName || c.fatherName ? (
          <Entity
            primary={c.motherName ? `Mother: ${c.motherName}` : `Father: ${c.fatherName}`}
            secondary={c.motherName && c.fatherName ? `Father: ${c.fatherName}` : undefined}
          />
        ) : (
          '—'
        ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (c) =>
        c.category || c.pwd || c.consession ? (
          <span className="cx-cand-kv">
            {c.category ? <span><span className="cb-muted">Category</span> {c.category}</span> : null}
            {c.pwd ? <span><span className="cb-muted">PwD</span> {c.pwd}</span> : null}
            {c.consession ? <span><span className="cb-muted">Concession</span> {c.consession}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'subjects',
      header: 'School and subject codes',
      headerLabel: 'Subject codes',
      render: (c) => (
        <div className="cx-cand-schoolcell">
          {c.schoolName ? (
            <span className="cx-cand-school" title={`${c.schoolCode ? `${c.schoolCode} ` : ''}${c.schoolName}`}>
              {c.schoolCode ? <span className="cb-strong">{c.schoolCode}</span> : null} {c.schoolName}
            </span>
          ) : null}
          <SubjectCodes candidate={c} />
        </div>
      ),
    },
  ]

  const footer =
    candidates.length > 0 ? (
      <Pagination
        page={pagination.page}
        pages={pagination.pages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={onPageChange}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={onPageSizeChange}
      />
    ) : undefined

  return (
    <DataTable
      caption="Candidates"
      columns={columns}
      rows={loading ? [] : candidates}
      getRowKey={(c) => c._id}
      onRowClick={(c) => navigate(`/candidate-details/${c._id}`)}
      loading={loading}
      loadingLabel="Loading candidates…"
      sort={sortField ? { key: sortField, direction: sortDirection || 'asc' } : null}
      onSort={onSortChange ? (key) => onSortChange(key as SortableField) : undefined}
      footer={loading ? undefined : footer}
      empty={
        <EmptyState
          icon={Users}
          title="No candidates found"
          body="Import candidates from the CBSE PDF, or add them one at a time."
          action={
            <Button size="sm" icon={Plus} onClick={() => navigate('/candidate-details/new')}>
              Add first candidate
            </Button>
          }
        />
      }
    />
  )
}

export default CandidateTable
