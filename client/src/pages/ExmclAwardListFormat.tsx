import React, { useEffect, useState } from 'react'
import { FileText, RotateCcw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import exmclAwardListService, {
  DEFAULT_AWARD_LIST_DESIGN,
  type AwardListDesign,
} from '@/services/exmclAwardListService'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import { CanvasOverlay, type FormatTextStyle } from '@/components/format-editor'
import { useFormatCanvas } from '@/hooks/useFormatCanvas'
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  FormatToolbar,
  Page,
  Paper,
  PaperCopies,
  PaperStage,
  RadioGroup,
  TextField,
  Menu,
} from '@/components/ui'
import { errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/award-list.css'

const SAMPLE_SUBJECTS = ['English', 'Mathematics', 'Science']
const PREVIEW_SCHOOL = {
  name: 'DELHI PUBLIC SCHOOL, ROHTAK',
  address: '0.5 Km Mile Stone, Jind Road, Rohtak',
}

type PreviewSample = {
  className: string
  section: string
  exam: string
  date: string
  subject: string
  mm: string
}

const FillLine = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) => (
  <label className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-slate-800">
    <span className="w-14 shrink-0 font-semibold">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={`Sample ${label.replace(':', '').toLowerCase()}`}
      className="min-h-[16px] min-w-0 flex-1 border-0 border-b border-slate-800 bg-transparent px-1 text-[11px] outline-none"
    />
  </label>
)

const AwardListCopy = ({
  design,
  schoolName,
  schoolAddress,
  logoUrl,
  sample,
  onSampleChange,
  compact,
}: {
  design: AwardListDesign
  schoolName: string
  schoolAddress: string
  logoUrl?: string
  sample: PreviewSample
  onSampleChange: (key: keyof PreviewSample, value: string) => void
  compact: boolean
}) => {
  const previewSubjects = design.columns.subjects
    ? (sample.subject.trim() ? [sample.subject.trim()] : SAMPLE_SUBJECTS)
    : []
  const extraMarks = Array.from({ length: design.extraMarkColumns }, (_, index) => `Marks ${index + 1}`)
  const textScale = compact ? 'text-[9px]' : 'text-[11px]'

  return (
    <div className={`min-w-0 ${compact ? 'px-1' : ''}`}>
      {design.showHeader ? (
        <div className="mb-1 text-center">
          {design.showSchoolLogo ? (
            logoUrl ? (
              <img src={logoUrl} alt="School logo" className={`mx-auto mb-1 object-contain ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} />
            ) : (
              <div className={`mx-auto mb-1 border border-slate-300 ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} />
            )
          ) : null}
          <p className={`font-bold uppercase tracking-wide text-slate-900 ${compact ? 'text-[11px]' : 'text-sm'}`}>
            {schoolName}
          </p>
          {design.showSchoolAddress ? (
            <p className={`mt-0.5 text-slate-700 ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{schoolAddress}</p>
          ) : null}
          <p className={`mt-1.5 font-bold uppercase tracking-wide text-slate-900 ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
            {design.title}
          </p>
        </div>
      ) : (
        <p className="mb-1 text-center text-[12px] font-bold uppercase text-slate-900">{design.title}</p>
      )}

      {design.showInfoRow ? (
        <div className={`mb-3 mt-2 grid grid-cols-2 ${compact ? 'gap-x-4 gap-y-1' : 'gap-x-8 gap-y-1.5'}`}>
          <div className="space-y-1.5">
            {design.headerFields.class ? <FillLine label="Class:" value={sample.className} onChange={(value) => onSampleChange('className', value)} /> : null}
            {design.headerFields.section ? <FillLine label="Section:" value={sample.section} onChange={(value) => onSampleChange('section', value)} /> : null}
            {design.headerFields.exam ? <FillLine label="Exam:" value={sample.exam} onChange={(value) => onSampleChange('exam', value)} /> : null}
          </div>
          <div className="space-y-1.5">
            {design.headerFields.date ? <FillLine label="Date:" value={sample.date} onChange={(value) => onSampleChange('date', value)} /> : null}
            {design.headerFields.subject ? <FillLine label="Subject:" value={sample.subject} onChange={(value) => onSampleChange('subject', value)} /> : null}
            {design.headerFields.mm ? <FillLine label="M.M.:" value={sample.mm} onChange={(value) => onSampleChange('mm', value)} /> : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className={`min-w-full border-collapse ${textScale}`}>
          <thead>
            <tr className="bg-slate-50 text-left uppercase text-slate-600">
              {design.columns.srNo ? <th className="border border-slate-300 px-1 py-0.5">S.No</th> : null}
              {design.columns.rollNumber ? <th className="border border-slate-300 px-1 py-0.5">Adm No</th> : null}
              {design.columns.rollNo ? <th className="border border-slate-300 px-1 py-0.5">Roll No</th> : null}
              {design.columns.name ? <th className="border border-slate-300 px-1 py-0.5">Student Name</th> : null}
              {design.columns.fatherName ? <th className="border border-slate-300 px-1 py-0.5">Father Name</th> : null}
              {previewSubjects.map((subject) => (
                <th key={subject} className="border border-slate-300 px-1 py-0.5">{subject}</th>
              ))}
              {extraMarks.map((label) => (
                <th key={label} className="border border-slate-300 px-1 py-0.5">{label}</th>
              ))}
              {design.columns.total ? <th className="border border-slate-300 px-1 py-0.5">M.O.</th> : null}
              {design.columns.grade ? <th className="border border-slate-300 px-1 py-0.5">Grade</th> : null}
              {design.columns.checkerSign ? <th className="border border-slate-300 px-1 py-0.5">Checker Sign</th> : null}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4].map((row) => (
              <tr key={row}>
                {design.columns.srNo ? <td className="border border-slate-300 px-1 py-1.5">{row}</td> : null}
                {design.columns.rollNumber ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
                {design.columns.rollNo ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
                {design.columns.name ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
                {design.columns.fatherName ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
                {previewSubjects.map((subject) => (
                  <td key={`${row}-${subject}`} className="border border-slate-300 px-1 py-1.5"></td>
                ))}
                {extraMarks.map((label) => (
                  <td key={`${row}-${label}`} className="border border-slate-300 px-1 py-1.5"></td>
                ))}
                {design.columns.total ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
                {design.columns.grade ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
                {design.columns.checkerSign ? <td className="border border-slate-300 px-1 py-1.5"></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`mt-10 grid grid-cols-2 gap-y-10 font-semibold text-slate-800 ${compact ? 'text-[8px]' : 'text-[11px]'}`}>
        <span className="pt-6 text-left">{design.signatures.subjectTeacher ? 'Subject Teacher' : ''}</span>
        <span className="pt-6 text-right">{design.signatures.hod ? 'HOD' : ''}</span>
        <span className="pt-2 text-left">{design.signatures.examIncharge ? 'Exam Incharge' : ''}</span>
        <span className="pt-2 text-right">{design.signatures.principal ? 'Principal' : ''}</span>
      </div>
    </div>
  )
}

const ExmclAwardListFormat: React.FC = () => {
  const navigate = useNavigate()
  const [design, setDesign] = useState<AwardListDesign>(DEFAULT_AWARD_LIST_DESIGN)
  const [school, setSchool] = useState<Partial<SchoolProfile>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [sample, setSample] = useState<PreviewSample>({
    className: '10th',
    section: 'A',
    exam: 'Unit Test',
    date: '',
    subject: '',
    mm: '80',
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [saved, profile] = await Promise.all([
          exmclAwardListService.getDesign(),
          schoolProfileService.getProfile().catch(() => null),
        ])
        if (cancelled) return
        setDesign(saved)
        if (profile) setSchool(profile)
      } catch {
        if (!cancelled) toast.error('The saved format didn’t load. Check your connection and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const schoolName = String(school.name || '').trim() || PREVIEW_SCHOOL.name
  const schoolAddress = String(school.address || '').trim() || PREVIEW_SCHOOL.address
  const twoUp = design.copiesPerSheet === 2
  const canvas = useFormatCanvas(
    design.canvasItems || [],
    (canvasItems) => setDesign((prev) => ({ ...prev, canvasItems })),
    (file) => exmclAwardListService.uploadCanvasImage(file)
  )
  const defaultStyle: FormatTextStyle = { fontFamily: 'Arial', fontSize: 12, bold: false, italic: false, underline: false }
  const activeStyle: FormatTextStyle =
    canvas.selected?.type === 'text'
      ? {
          fontFamily: canvas.selected.fontFamily,
          fontSize: canvas.selected.fontSize,
          bold: canvas.selected.bold,
          italic: canvas.selected.italic,
          underline: canvas.selected.underline,
        }
      : defaultStyle
  const selectionLabel =
    canvas.selected?.type === 'text'
      ? 'Text box'
      : canvas.selected?.type === 'image'
        ? 'Image'
        : canvas.selected?.type === 'rect'
          ? 'Box'
          : canvas.selected?.type === 'line'
            ? 'Line'
            : 'Award list'

  const updateColumn = (key: keyof AwardListDesign['columns'], value: boolean) => {
    setDesign((prev) => ({ ...prev, columns: { ...prev.columns, [key]: value } }))
  }

  const updateSignature = (key: keyof AwardListDesign['signatures'], value: boolean) => {
    setDesign((prev) => ({ ...prev, signatures: { ...prev.signatures, [key]: value } }))
  }

  const updateHeaderField = (key: keyof AwardListDesign['headerFields'], value: boolean) => {
    setDesign((prev) => ({ ...prev, headerFields: { ...prev.headerFields, [key]: value } }))
  }

  const handleSampleChange = (key: keyof PreviewSample, value: string) => {
    setSample((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await exmclAwardListService.saveDesign(design)
      setDesign(saved)
      toast.success('Format saved. New award lists will use this layout.')
    } catch (error) {
      toast.error(errorMessage(error, 'The format wasn’t saved. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const resetToTemplate = () => {
    setDesign(DEFAULT_AWARD_LIST_DESIGN)
    canvas.setSelectedId(null)
    setConfirmReset(false)
    toast.success('Reset to the landscape award list template. Save to keep it.')
  }

  const previewSubtitle = [
    design.pageSize === 'legal' ? 'Legal' : 'A4',
    design.orientation === 'portrait' ? 'Portrait' : 'Landscape',
    twoUp ? '2 per sheet' : '1 per sheet',
  ].join(' · ')

  return (
    <Page width="full">
      <div className="cb-designer">
        <div className="cb-stack">
          <Card title="Layout" subtitle="School name and address come from Centre details.">
            <div className="cb-form-section">
              <TextField
                label="Heading"
                value={design.title}
                disabled={loading}
                onChange={(event) => setDesign((prev) => ({ ...prev, title: event.target.value }))}
              />
              <div className="cb-form-grid">
                <RadioGroup
                  label="Page size"
                  orientation="horizontal"
                  value={design.pageSize}
                  options={[
                    { value: 'A4', label: 'A4' },
                    { value: 'legal', label: 'Legal' },
                  ]}
                  onChange={(value) => setDesign((prev) => ({ ...prev, pageSize: value as AwardListDesign['pageSize'] }))}
                />
                <RadioGroup
                  label="Orientation"
                  orientation="horizontal"
                  value={design.orientation}
                  options={[
                    { value: 'landscape', label: 'Landscape' },
                    { value: 'portrait', label: 'Portrait' },
                  ]}
                  onChange={(value) => setDesign((prev) => ({ ...prev, orientation: value as AwardListDesign['orientation'] }))}
                />
              </div>
              <Checkbox
                label="Two award lists on one sheet"
                description="Prints two copies side by side to save paper."
                checked={twoUp}
                onChange={(value) => setDesign((prev) => ({ ...prev, copiesPerSheet: value ? 2 : 1 }))}
              />
            </div>
          </Card>

          <Card title="Header">
            <div className="cb-form-section">
              <div className="cb-check-grid">
                <Checkbox label="School name" checked={design.showHeader} onChange={(value) => setDesign((prev) => ({ ...prev, showHeader: value }))} />
                <Checkbox label="School address" checked={design.showSchoolAddress} onChange={(value) => setDesign((prev) => ({ ...prev, showSchoolAddress: value }))} />
                <Checkbox label="School logo" checked={design.showSchoolLogo} onChange={(value) => setDesign((prev) => ({ ...prev, showSchoolLogo: value }))} />
                <Checkbox
                  label="Header fields"
                  description="Lines for class, exam, date and the like."
                  checked={design.showInfoRow}
                  onChange={(value) => setDesign((prev) => ({ ...prev, showInfoRow: value }))}
                />
              </div>
            </div>
            {design.showInfoRow ? (
              <div className="cb-form-section">
                <p className="cb-form-section__title">Header fields</p>
                <div className="cb-check-grid">
                  <Checkbox label="Class" checked={design.headerFields.class} onChange={(value) => updateHeaderField('class', value)} />
                  <Checkbox label="Section" checked={design.headerFields.section} onChange={(value) => updateHeaderField('section', value)} />
                  <Checkbox label="Exam" checked={design.headerFields.exam} onChange={(value) => updateHeaderField('exam', value)} />
                  <Checkbox label="Date" checked={design.headerFields.date} onChange={(value) => updateHeaderField('date', value)} />
                  <Checkbox label="Subject" checked={design.headerFields.subject} onChange={(value) => updateHeaderField('subject', value)} />
                  <Checkbox label="Maximum marks (M.M.)" checked={design.headerFields.mm} onChange={(value) => updateHeaderField('mm', value)} />
                </div>
              </div>
            ) : null}
          </Card>

          <Card title="Columns">
            <div className="cb-form-section">
              <div className="cb-check-grid">
                <Checkbox label="Serial no." checked={design.columns.srNo} onChange={(value) => updateColumn('srNo', value)} />
                <Checkbox label="Admission no." checked={design.columns.rollNumber} onChange={(value) => updateColumn('rollNumber', value)} />
                <Checkbox label="Roll no." checked={design.columns.rollNo} onChange={(value) => updateColumn('rollNo', value)} />
                <Checkbox label="Student name" checked={design.columns.name} onChange={(value) => updateColumn('name', value)} />
                <Checkbox label="Father’s name" checked={design.columns.fatherName} onChange={(value) => updateColumn('fatherName', value)} />
                <Checkbox
                  label="Subject mark columns"
                  description="One column per subject, or the subject typed when generating."
                  checked={design.columns.subjects}
                  onChange={(value) => updateColumn('subjects', value)}
                />
                <Checkbox label="Marks obtained (M.O.)" checked={design.columns.total} onChange={(value) => updateColumn('total', value)} />
                <Checkbox label="Grade" checked={design.columns.grade} onChange={(value) => updateColumn('grade', value)} />
                <Checkbox label="Checker’s signature" checked={design.columns.checkerSign} onChange={(value) => updateColumn('checkerSign', value)} />
              </div>
              <TextField
                label="Extra blank mark columns"
                type="number"
                inputMode="numeric"
                min={0}
                max={8}
                hint="0 to 8 columns."
                value={design.extraMarkColumns}
                onChange={(event) =>
                  setDesign((prev) => ({
                    ...prev,
                    extraMarkColumns: Math.min(8, Math.max(0, Number(event.target.value) || 0)),
                  }))
                }
              />
            </div>
          </Card>

          <Card title="Signatures">
            <div className="cb-check-grid">
              <Checkbox label="Subject teacher" checked={design.signatures.subjectTeacher} onChange={(value) => updateSignature('subjectTeacher', value)} />
              <Checkbox label="HOD" checked={design.signatures.hod} onChange={(value) => updateSignature('hod', value)} />
              <Checkbox label="Exam in-charge" checked={design.signatures.examIncharge} onChange={(value) => updateSignature('examIncharge', value)} />
              <Checkbox label="Principal" checked={design.signatures.principal} onChange={(value) => updateSignature('principal', value)} />
            </div>
          </Card>
        </div>

        <div className="cb-designer__preview">
          <Card
            flush
            title="Preview"
            subtitle={`${previewSubtitle}. Type on the header lines to try sample values.`}
            action={
              <div className="ex-al-actions">
                <Button size="sm" icon={FileText} onClick={() => navigate('/exmcl/award-list')}>
                  Generate award list
                </Button>
                <Button variant="primary" size="sm" icon={Save} loading={saving} disabled={loading} onClick={() => void handleSave()}>
                  Save format
                </Button>
                <Menu
                  label="More format actions"
                  items={[{ label: 'Reset to template', icon: RotateCcw, disabled: loading, onSelect: () => setConfirmReset(true) }]}
                />
              </div>
            }
          >
            <FormatToolbar
              label="Award list canvas tools"
              selectionLabel={selectionLabel}
              style={activeStyle}
              styleDisabled={!canvas.selected || canvas.selected.type !== 'text'}
              canvasItem={canvas.selected}
              uploadingImage={canvas.uploading}
              onStyleChange={canvas.applyStyle}
              onAddText={() => canvas.addItem('text')}
              onAddImage={canvas.addImage}
              onAddRect={() => canvas.addItem('rect')}
              onAddLine={() => canvas.addItem('line')}
              onPatchCanvas={canvas.patchItem}
              onDelete={canvas.removeSelected}
            />
            <PaperStage flush>
              <Paper pageSize={design.pageSize} orientation={design.orientation} width={520} caption>
                <PaperCopies count={twoUp ? 2 : 1}>
                  <AwardListCopy
                    design={design}
                    schoolName={schoolName}
                    schoolAddress={schoolAddress}
                    logoUrl={school.logoUrl}
                    sample={sample}
                    onSampleChange={handleSampleChange}
                    compact={twoUp}
                  />
                </PaperCopies>
                <CanvasOverlay
                  items={design.canvasItems || []}
                  selectedId={canvas.selectedId}
                  onSelect={canvas.setSelectedId}
                  onChange={(canvasItems) => setDesign((prev) => ({ ...prev, canvasItems }))}
                />
              </Paper>
            </PaperStage>
          </Card>
        </div>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        tone="danger"
        size="sm"
        title="Reset to the standard template?"
        description="Your unsaved changes and any text boxes, images, boxes and lines on the sheet are cleared. The saved format stays until you save again."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
            <Button variant="danger" onClick={resetToTemplate}>
              Reset to template
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ExmclAwardListFormat
