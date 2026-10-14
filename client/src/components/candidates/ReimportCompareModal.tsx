import React, { useState, useCallback, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { FileSearch, FileText, Upload } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  Icon,
  Sheet,
  Tabs,
  cx,
  type DataTableColumn,
  type DataTableSelection,
} from '@/components/ui'
import { useReimportCompare, useReimportImpact, useReimportApply } from '../../hooks/useReimport'
import type { ComparisonResult, ImpactResult, ReimportChange } from '../../services/candidateService'
import '@/components/exmcl/centre-candidates.css'

interface ReimportCompareModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'upload' | 'review' | 'impact'

type MismatchRow = { key: string; rollNumber: string; name: string; code: string; kind: 'remove' | 'add' }
type NewRow = ComparisonResult['newCandidates'][number]
type MissingRow = ComparisonResult['missingFromPdf'][number]
type ImpactRow = ImpactResult['impacts'][number] & { _idx: number }

const STEP_COPY: Record<Step, string> = {
  upload: 'Step 1 of 3 · Upload a candidate PDF to compare with the candidates on file.',
  review: 'Step 2 of 3 · Choose which subject differences to fix.',
  impact: 'Step 3 of 3 · Check what the fixes touch, then apply them.',
}

const SEVERITY: Record<string, { tone: 'danger' | 'warning' | 'success'; label: string }> = {
  high: { tone: 'danger', label: 'High impact' },
  low: { tone: 'warning', label: 'Low impact' },
  none: { tone: 'success', label: 'No impact' },
}

const ReimportCompareModal: React.FC<ReimportCompareModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set())
  const [cascadeCleanup, setCascadeCleanup] = useState(true)
  const [impact, setImpact] = useState<ImpactResult | null>(null)
  const [activeTab, setActiveTab] = useState<'mismatches' | 'new' | 'missing'>('mismatches')

  const compareMutation = useReimportCompare()
  const impactMutation = useReimportImpact()
  const applyMutation = useReimportApply()

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: compareMutation.isPending,
  })

  const handleCompare = async () => {
    if (!selectedFile) return
    try {
      const result = await compareMutation.mutateAsync(selectedFile)
      setComparison(result)
      // Auto-select all removed (phantom) subjects
      const autoSelected = new Set<string>()
      for (const diff of result.differences) {
        for (const removed of diff.subjectChanges.removed) {
          autoSelected.add(`${diff.rollNumber}:remove:${removed.code}`)
        }
      }
      setSelectedChanges(autoSelected)
      setStep('review')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to compare')
    }
  }

  const toggleChange = (key: string) => {
    setSelectedChanges((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const buildChanges = (): ReimportChange[] => {
    if (!comparison) return []
    const changeMap = new Map<string, ReimportChange>()

    for (const key of selectedChanges) {
      const [rollNumber, action, code] = key.split(':')
      const mapKey = `${rollNumber}:${action === 'remove' ? 'remove_subjects' : 'add_subjects'}`
      if (!changeMap.has(mapKey)) {
        changeMap.set(mapKey, {
          rollNumber,
          action: action === 'remove' ? 'remove_subjects' : 'add_subjects',
          subjectCodes: [],
          cascadeCleanup,
        })
      }
      changeMap.get(mapKey)!.subjectCodes.push(code)
    }

    return Array.from(changeMap.values())
  }

  const handleCheckImpact = async () => {
    const changes = buildChanges()
    if (changes.length === 0) {
      toast.error('No changes selected')
      return
    }
    try {
      const result = await impactMutation.mutateAsync(changes)
      setImpact(result)
      setStep('impact')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to check impact')
    }
  }

  const handleApply = async () => {
    const changes = buildChanges()
    try {
      const result = await applyMutation.mutateAsync(changes)
      toast.success(`Applied ${result.successCount} change(s)`)
      handleClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to apply changes')
    }
  }

  const handleClose = () => {
    if (compareMutation.isPending || applyMutation.isPending) return
    setStep('upload')
    setSelectedFile(null)
    setComparison(null)
    setSelectedChanges(new Set())
    setImpact(null)
    onClose()
  }

  const mismatchRows = useMemo<MismatchRow[]>(() => {
    if (!comparison) return []
    return comparison.differences.flatMap((diff) => [
      ...diff.subjectChanges.removed.map((s) => ({
        key: `${diff.rollNumber}:remove:${s.code}`,
        rollNumber: diff.rollNumber,
        name: diff.candidateName,
        code: s.code,
        kind: 'remove' as const,
      })),
      ...diff.subjectChanges.added.map((s) => ({
        key: `${diff.rollNumber}:add:${s.code}`,
        rollNumber: diff.rollNumber,
        name: diff.candidateName,
        code: s.code,
        kind: 'add' as const,
      })),
    ])
  }, [comparison])

  const totalPhantom = comparison?.differences.reduce((sum, d) => sum + d.subjectChanges.removed.length, 0) ?? 0
  const totalMissing = comparison?.differences.reduce((sum, d) => sum + d.subjectChanges.added.length, 0) ?? 0

  const selectedOnScreen = mismatchRows.filter((r) => selectedChanges.has(r.key)).length
  const selection: DataTableSelection<MismatchRow> = {
    isSelected: (r) => selectedChanges.has(r.key),
    onToggle: (r) => toggleChange(r.key),
    allSelected: mismatchRows.length > 0 && selectedOnScreen === mismatchRows.length,
    someSelected: selectedOnScreen > 0,
    onToggleAll: () =>
      setSelectedChanges((prev) => {
        const next = new Set(prev)
        const all = mismatchRows.length > 0 && mismatchRows.every((r) => next.has(r.key))
        mismatchRows.forEach((r) => (all ? next.delete(r.key) : next.add(r.key)))
        return next
      }),
    rowLabel: (r) => `${r.kind === 'remove' ? 'Remove' : 'Add'} ${r.code} for ${r.rollNumber}`,
  }

  const mismatchColumns: DataTableColumn<MismatchRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', mobile: 'aside', render: (r) => <span className="cb-strong">{r.rollNumber}</span> },
    { key: 'name', header: 'Name', mobile: 'title' },
    { key: 'code', header: 'Subject', render: (r) => <Badge dot={false}>{r.code}</Badge> },
    {
      key: 'kind',
      header: 'Difference',
      mobile: 'subtitle',
      render: (r) =>
        r.kind === 'remove' ? (
          <Badge tone="danger">Not in PDF · remove</Badge>
        ) : (
          <Badge tone="warning">Missing on file · add</Badge>
        ),
    },
  ]

  const newColumns: DataTableColumn<NewRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', mobile: 'aside', render: (c) => <span className="cb-strong">{c.rollNumber}</span> },
    { key: 'name', header: 'Name', mobile: 'title' },
    { key: 'class', header: 'Class', render: (c) => c.class || '—' },
    { key: 'schoolCode', header: 'School', render: (c) => c.schoolCode || '—' },
    {
      key: 'subjects',
      header: 'Subjects',
      render: (c) =>
        c.subjectCodes.length ? (
          <div className="cx-cand-codes">
            {c.subjectCodes.map((s) => (
              <Badge key={s.code}>{s.code}</Badge>
            ))}
          </div>
        ) : (
          '—'
        ),
    },
  ]

  const missingColumns: DataTableColumn<MissingRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', mobile: 'aside', render: (c) => <span className="cb-strong">{c.rollNumber}</span> },
    { key: 'name', header: 'Name', mobile: 'title' },
    { key: 'class', header: 'Class', render: (c) => c.class || '—' },
  ]

  const impactRows: ImpactRow[] = (impact?.impacts ?? []).map((item, _idx) => ({ ...item, _idx }))
  const impactColumns: DataTableColumn<ImpactRow>[] = [
    { key: 'rollNumber', header: 'Roll no.', mobile: 'title', render: (r) => <span className="cb-strong">{r.rollNumber}</span> },
    { key: 'subjectCode', header: 'Subject', mobile: 'subtitle', render: (r) => <Badge>{r.subjectCode}</Badge> },
    { key: 'seatingPlanAllocations', header: 'Seating', numeric: true, align: 'right' },
    { key: 'form66Records', header: 'Form 66', numeric: true, align: 'right' },
    { key: 'answerSheetLinks', header: 'Answer sheets', numeric: true, align: 'right' },
    {
      key: 'severity',
      header: 'Impact',
      mobile: 'aside',
      render: (r) => {
        const s = SEVERITY[r.severity] || SEVERITY.none
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
    },
  ]

  const busy = compareMutation.isPending || applyMutation.isPending

  return (
    <Sheet
      open={isOpen}
      onClose={handleClose}
      size="xl"
      icon={FileSearch}
      title="Re-import and compare"
      description={STEP_COPY[step]}
      footer={
        <>
          <Button
            onClick={step === 'upload' ? handleClose : () => setStep(step === 'impact' ? 'review' : 'upload')}
            disabled={busy}
          >
            {step === 'upload' ? 'Cancel' : 'Back'}
          </Button>
          {step === 'upload' ? (
            <Button
              variant="primary"
              loading={compareMutation.isPending}
              disabled={!selectedFile}
              onClick={() => void handleCompare()}
            >
              {compareMutation.isPending ? 'Comparing…' : 'Compare'}
            </Button>
          ) : null}
          {step === 'review' ? (
            <Button
              variant="primary"
              loading={impactMutation.isPending}
              disabled={selectedChanges.size === 0}
              onClick={() => void handleCheckImpact()}
            >
              {impactMutation.isPending ? 'Checking…' : `Check impact (${selectedChanges.size})`}
            </Button>
          ) : null}
          {step === 'impact' ? (
            <Button variant="danger" loading={applyMutation.isPending} onClick={() => void handleApply()}>
              {applyMutation.isPending ? 'Applying…' : 'Apply selected fixes'}
            </Button>
          ) : null}
        </>
      }
    >
      {step === 'upload' ? (
        <>
          <div
            {...getRootProps({
              className: cx('cx-drop', isDragActive && 'is-active', compareMutation.isPending && 'is-disabled'),
            })}
          >
            <input {...getInputProps()} />
            <Icon icon={Upload} size={20} />
            <span className="cx-drop__title">{isDragActive ? 'Drop the PDF here' : 'Drag a candidate PDF here'}</span>
            <span>or click to choose a file</span>
          </div>
          {selectedFile ? (
            <div className="cx-file">
              <Icon icon={FileText} size={16} />
              <span className="cx-file__name" title={selectedFile.name}>
                {selectedFile.name}
              </span>
              <span className="cx-file__size">{(selectedFile.size / 1024).toFixed(0)} KB</span>
            </div>
          ) : null}
        </>
      ) : null}

      {step === 'review' && comparison ? (
        <>
          <Banner tone={totalPhantom > 0 ? 'warning' : 'info'} title={`${comparison.parseStats.totalParsed} candidates read from the PDF (class ${comparison.parseStats.pdfClass})`}>
            {comparison.parseStats.matchedCount} matched candidates on file.
            {totalPhantom > 0 ? ` ${totalPhantom} subject(s) on file are not in the PDF.` : ''}
            {totalMissing > 0 ? ` ${totalMissing} subject(s) in the PDF are missing on file.` : ''}
            {comparison.newCandidates.length > 0 ? ` ${comparison.newCandidates.length} new candidate(s).` : ''}
          </Banner>

          <Tabs
            label="Comparison results"
            value={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
            items={[
              { id: 'mismatches', label: 'Subject mismatches', count: mismatchRows.length },
              { id: 'new', label: 'New candidates', count: comparison.newCandidates.length },
              { id: 'missing', label: 'Missing from PDF', count: comparison.missingFromPdf.length },
            ]}
          />

          {activeTab === 'mismatches' ? (
            <DataTable
              caption="Subject mismatches"
              columns={mismatchColumns}
              rows={mismatchRows}
              getRowKey={(r) => r.key}
              onRowClick={(r) => toggleChange(r.key)}
              selection={selection}
              empty={<EmptyState compact title="No subject mismatches" body="Every matched candidate has the same subjects as the PDF." />}
            />
          ) : null}

          {activeTab === 'new' ? (
            <DataTable
              caption="New candidates"
              columns={newColumns}
              rows={comparison.newCandidates}
              getRowKey={(c) => c.rollNumber}
              empty={<EmptyState compact title="No new candidates in the PDF" />}
            />
          ) : null}

          {activeTab === 'missing' ? (
            <>
              {comparison.missingFromPdf.length > 0 ? (
                <p className="cb-muted">
                  These candidates are on file but weren’t found in the uploaded PDF. Nothing is changed for them.
                </p>
              ) : null}
              <DataTable
                caption="Missing from PDF"
                columns={missingColumns}
                rows={comparison.missingFromPdf}
                getRowKey={(c) => c.rollNumber}
                empty={<EmptyState compact title="Every candidate on file is in the PDF" />}
              />
            </>
          ) : null}
        </>
      ) : null}

      {step === 'impact' && impact ? (
        <>
          {impact.summary.overallSeverity === 'high' ? (
            <Banner tone="danger" title="High impact">
              {impact.summary.totalForm66Affected} Form 66 record(s) and {impact.summary.totalAnswerSheetsAffected} answer
              sheet(s) are affected.
            </Banner>
          ) : impact.summary.overallSeverity === 'low' ? (
            <Banner tone="warning" title="Low impact">
              {impact.summary.totalSeatingAllocationsAffected} seating allocation(s) will be affected.
            </Banner>
          ) : (
            <Banner tone="success" title="No downstream data affected">
              Safe to apply.
            </Banner>
          )}

          {impactRows.length > 0 ? (
            <DataTable caption="Impact by change" columns={impactColumns} rows={impactRows} getRowKey={(r) => String(r._idx)} />
          ) : null}

          <Checkbox
            checked={cascadeCleanup}
            onChange={setCascadeCleanup}
            label="Also clean up affected seating plan allocations"
          />
        </>
      ) : null}
    </Sheet>
  )
}

export default ReimportCompareModal
