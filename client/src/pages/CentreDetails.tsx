import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays, School, Users } from 'lucide-react'
import {
  useCentreDetails,
  useCentreDetailsSummary,
  useUpdateCentreDetailsMutation,
} from '../hooks/useCentreDetails'
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Page,
  StatCard,
  TextField,
  type DataTableColumn,
} from '@/components/ui'

interface SchoolSummaryRow {
  srNo: number
  schoolCode: string
  schoolName: string
  classXRollFrom: string
  classXRollTo: string
  classX: number
  classXIIRollFrom: string
  classXIIRollTo: string
  classXII: number
  total: number
}

interface CentreForm {
  centreNo: string
  centreName: string
  centreSchoolCode: string
  centreSuperintendent: string
  centreSuperintendentContact: string
  deputyCentreSuperintendent: string
  deputyCentreSuperintendentContact: string
  centreClerk: string
  centreClerkContact: string
}

const defaultForm: CentreForm = {
  centreNo: '',
  centreName: '',
  centreSchoolCode: '',
  centreSuperintendent: '',
  centreSuperintendentContact: '',
  deputyCentreSuperintendent: '',
  deputyCentreSuperintendentContact: '',
  centreClerk: '',
  centreClerkContact: '',
}

const STAFF: Array<{ name: keyof CentreForm; contact: keyof CentreForm; label: string }> = [
  { name: 'centreSuperintendent', contact: 'centreSuperintendentContact', label: 'Centre superintendent' },
  { name: 'deputyCentreSuperintendent', contact: 'deputyCentreSuperintendentContact', label: 'Deputy centre superintendent' },
  { name: 'centreClerk', contact: 'centreClerkContact', label: 'Centre clerk' },
]

const sanitizePhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 10)

const compareRollNumbers = (a: string, b: string) => {
  const left = String(a || '').trim()
  const right = String(b || '').trim()
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1

  const leftNum = Number(left)
  const rightNum = Number(right)
  const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum) && /^\d+$/.test(left) && /^\d+$/.test(right)
  if (bothNumeric) return leftNum - rightNum

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

const rollRange = (from: string, to: string) => (from ? (to && to !== from ? `${from} – ${to}` : from) : '—')

const CentreDetails: React.FC = () => {
  const [form, setForm] = useState<CentreForm>(defaultForm)
  const [hasSavedCentreDetails, setHasSavedCentreDetails] = useState(false)
  const {
    data: centreDetails,
    isLoading: loadingCentre,
  } = useCentreDetails()
  const {
    data: summaryData,
    isLoading: loadingSummary,
  } = useCentreDetailsSummary()
  const updateCentreMutation = useUpdateCentreDetailsMutation()
  const candidates = summaryData?.candidates ?? []
  const examDays = summaryData?.examDays ?? 0
  const loading = loadingSummary

  const tableRows: SchoolSummaryRow[] = useMemo(() => {
    const grouped = new Map<string, SchoolSummaryRow>()

    for (const candidate of candidates) {
      const schoolCode = candidate.schoolCode || 'N/A'
      const schoolName = candidate.schoolName || 'N/A'
      const key = `${schoolCode}__${schoolName}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          srNo: 0,
          schoolCode,
          schoolName,
          classXRollFrom: '',
          classXRollTo: '',
          classX: 0,
          classXIIRollFrom: '',
          classXIIRollTo: '',
          classXII: 0,
          total: 0,
        })
      }

      const row = grouped.get(key)!
      if (candidate.class === '10th') {
        row.classX += 1
        if (!row.classXRollFrom || compareRollNumbers(candidate.rollNumber, row.classXRollFrom) < 0) {
          row.classXRollFrom = candidate.rollNumber
        }
        if (!row.classXRollTo || compareRollNumbers(candidate.rollNumber, row.classXRollTo) > 0) {
          row.classXRollTo = candidate.rollNumber
        }
      }
      if (candidate.class === '12th') {
        row.classXII += 1
        if (!row.classXIIRollFrom || compareRollNumbers(candidate.rollNumber, row.classXIIRollFrom) < 0) {
          row.classXIIRollFrom = candidate.rollNumber
        }
        if (!row.classXIIRollTo || compareRollNumbers(candidate.rollNumber, row.classXIIRollTo) > 0) {
          row.classXIIRollTo = candidate.rollNumber
        }
      }
      row.total += 1
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.schoolName.localeCompare(b.schoolName))
      .map((row, idx) => ({ ...row, srNo: idx + 1 }))
  }, [candidates])

  const totalCandidates = useMemo(
    () => tableRows.reduce((sum, row) => sum + row.total, 0),
    [tableRows]
  )

  const handleChange = (key: keyof CentreForm, value: string) => {
    const isContactField = key.toLowerCase().includes('contact')
    setForm((prev) => ({
      ...prev,
      [key]: isContactField ? sanitizePhoneInput(value) : value,
    }))
  }

  const handleSaveCentreInfo = async () => {
    try {
      await updateCentreMutation.mutateAsync(form)
      setHasSavedCentreDetails(true)
    } catch (error) {
      console.error('Failed to save centre details:', error)
    }
  }

  useEffect(() => {
    if (!centreDetails) return

    setForm({
      centreNo: centreDetails.centreNo || '',
      centreName: centreDetails.centreName || '',
      centreSchoolCode: centreDetails.centreSchoolCode || '',
      centreSuperintendent: centreDetails.centreSuperintendent || '',
      centreSuperintendentContact: centreDetails.centreSuperintendentContact || '',
      deputyCentreSuperintendent: centreDetails.deputyCentreSuperintendent || '',
      deputyCentreSuperintendentContact: centreDetails.deputyCentreSuperintendentContact || '',
      centreClerk: centreDetails.centreClerk || '',
      centreClerkContact: centreDetails.centreClerkContact || '',
    })

    const hasAnySavedField = [
      centreDetails.centreNo,
      centreDetails.centreName,
      centreDetails.centreSchoolCode,
      centreDetails.centreSuperintendent,
      centreDetails.centreSuperintendentContact,
      centreDetails.deputyCentreSuperintendent,
      centreDetails.deputyCentreSuperintendentContact,
      centreDetails.centreClerk,
      centreDetails.centreClerkContact,
    ].some((value) => String(value || '').trim().length > 0)

    setHasSavedCentreDetails(Boolean(centreDetails._id) || hasAnySavedField)
  }, [centreDetails])

  const columns: DataTableColumn<SchoolSummaryRow>[] = [
    { key: 'srNo', header: '#', width: 48, numeric: true, mobile: 'hidden' },
    {
      key: 'school',
      header: 'School',
      mobile: 'title',
      render: (row) => <span className="cb-strong">{row.schoolName}</span>,
    },
    { key: 'schoolCode', header: 'Code', mobile: 'subtitle', render: (row) => row.schoolCode },
    {
      key: 'classXRolls',
      header: 'Class X roll numbers',
      numeric: true,
      render: (row) => rollRange(row.classXRollFrom, row.classXRollTo),
    },
    { key: 'classX', header: 'Class X', numeric: true, align: 'right' },
    {
      key: 'classXIIRolls',
      header: 'Class XII roll numbers',
      numeric: true,
      render: (row) => rollRange(row.classXIIRollFrom, row.classXIIRollTo),
    },
    { key: 'classXII', header: 'Class XII', numeric: true, align: 'right' },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: (row) => <span className="cb-strong">{row.total}</span>,
    },
  ]

  const field = (key: keyof CentreForm, label: string, extra?: Partial<React.ComponentProps<typeof TextField>>) => (
    <TextField
      label={label}
      value={form[key]}
      onChange={(e) => handleChange(key, e.target.value)}
      disabled={loadingCentre}
      {...extra}
    />
  )

  return (
    <Page>
      <section className="cb-stats" aria-label="Centre totals">
        <StatCard label="Candidates" value={loading ? '…' : totalCandidates} icon={Users} hint="Appearing at this centre" />
        <StatCard label="Schools" value={loading ? '…' : tableRows.length} icon={School} hint="Sending candidates" />
        <StatCard label="Exam days" value={loading ? '…' : examDays} icon={CalendarDays} hint="From the datesheet" />
      </section>

      <Card
        title="Centre information"
        subtitle="Printed on seating plans, attendance sheets and dispatch records"
        footer={
          <div className="cb-card-actions">
            <Button
              variant="primary"
              onClick={handleSaveCentreInfo}
              loading={updateCentreMutation.isPending}
              disabled={loadingCentre}
            >
              {hasSavedCentreDetails ? 'Update details' : 'Save details'}
            </Button>
          </div>
        }
      >
        <div>
          <div className="cb-form-section">
            <h4 className="cb-form-section__title">Centre</h4>
            <div className="cb-form-grid cb-form-grid--3">
              {field('centreNo', 'Centre number', { hint: 'Used in seating plan generation' })}
              {field('centreName', 'Centre name', { hint: 'Used in seating plan generation' })}
              {field('centreSchoolCode', 'School code')}
            </div>
          </div>
          <div className="cb-form-section">
            <h4 className="cb-form-section__title">Centre staff</h4>
            <div className="cb-form-grid">
              {STAFF.map((s) => (
                <React.Fragment key={s.name}>
                  {field(s.name, s.label)}
                  {field(s.contact, 'Contact number', { inputMode: 'numeric', placeholder: '10-digit mobile' })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card flush title="Candidates appearing" subtitle={`School-wise split · ${totalCandidates} in all`}>
        <DataTable
          caption="Candidates appearing, by school"
          columns={columns}
          rows={tableRows}
          getRowKey={(row) => `${row.schoolCode}-${row.schoolName}`}
          loading={loading}
          loadingLabel="Loading candidate summary…"
          empty={
            <EmptyState
              icon={Users}
              title="No candidates imported yet"
              body="Import candidates from the CBSE list and the school-wise split appears here."
            />
          }
        />
      </Card>
    </Page>
  )
}

export default CentreDetails
