import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { FileText, RotateCcw, Save } from 'lucide-react'
import exmclReportCardService, {
  DEFAULT_REPORT_CARD_DESIGN,
  mergeDesign,
  type ReportCardDesign,
  type ReportCardOrientation,
  type ReportCardPageSize,
  type ReportCardStyleKey,
  type ReportCardTextStyle,
} from '@/services/exmclReportCardService'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import ReportCardPreview from '@/components/exmcl/ReportCardPreview'
import { CanvasOverlay, getFormatDefinition, type FormatTextStyle } from '@/components/format-editor'
import { useFormatCanvas } from '@/hooks/useFormatCanvas'
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  FormatToolbar,
  Menu,
  Page,
  Paper,
  PaperStage,
  TextArea,
  TextField,
  RadioGroup,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'
import '@/components/exmcl/report-card.css'

const STYLE_LABELS: Record<ReportCardStyleKey, string> = {
  schoolName: 'School name',
  tagline: 'Tagline',
  meta: 'Address and contact',
  examTitle: 'Exam title',
  sectionHeading: 'Section heading',
  studentFields: 'Student details',
  tableHeader: 'Table header',
  tableBody: 'Table body',
  footer: 'Footer',
  signatures: 'Signatures',
}

const SAMPLE_SUBJECTS = [
  { name: 'English', maxMarks: 40, marksObtained: 34, grade: 'A2' },
  { name: 'Hindi', maxMarks: 40, marksObtained: 31, grade: 'B1' },
  { name: 'Mathematics', maxMarks: 40, marksObtained: 36, grade: 'A2' },
]

const FORMAT = getFormatDefinition('report-card')

const PAGE_SIZE_OPTIONS: Array<{ value: ReportCardPageSize; label: string }> = [
  { value: 'A4', label: 'A4' },
  { value: 'legal', label: 'Legal' },
  { value: 'letter', label: 'Letter' },
]

const ORIENTATION_OPTIONS: Array<{ value: ReportCardOrientation; label: string }> = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
]

const SCHOOL_FIELDS: Array<{ key: keyof ReportCardDesign; label: string; wide?: boolean; type?: string }> = [
  { key: 'schoolName', label: 'School name', wide: true },
  { key: 'tagline', label: 'Tagline', wide: true },
  { key: 'schoolCode', label: 'School code' },
  { key: 'affiliationNo', label: 'CBSE affiliation no.' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'contact', label: 'Contact no.', type: 'tel' },
]

type BoolKey = {
  [K in keyof ReportCardDesign]-?: ReportCardDesign[K] extends boolean ? K : never
}[keyof ReportCardDesign]

const HEADER_TOGGLES: Array<{ key: BoolKey; label: string }> = [
  { key: 'showHeader', label: 'School header' },
  { key: 'showSchoolLogo', label: 'School logo' },
  { key: 'showCbseLogo', label: 'CBSE logo' },
  { key: 'showTagline', label: 'Tagline' },
  { key: 'showSchoolCode', label: 'School code' },
  { key: 'showAddress', label: 'Address' },
  { key: 'showAffiliation', label: 'CBSE affiliation no.' },
  { key: 'showEmail', label: 'Email' },
  { key: 'showContact', label: 'Contact no.' },
]

const FOOTER_TOGGLES: Array<{ key: BoolKey; label: string }> = [
  { key: 'showAttendance', label: 'Attendance' },
  { key: 'showRemarks', label: 'Remarks' },
  { key: 'showDate', label: 'Date' },
]

/* ---------- Page ---------- */

const ExmclReportCardFormat: React.FC = () => {
  const navigate = useNavigate()
  const [design, setDesign] = useState<ReportCardDesign>(DEFAULT_REPORT_CARD_DESIGN)
  const [school, setSchool] = useState<Partial<SchoolProfile>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [selectedStyleKey, setSelectedStyleKey] = useState<ReportCardStyleKey>('schoolName')

  const patchDesign = (patch: Partial<ReportCardDesign>) => {
    setDesign((prev) =>
      mergeDesign({
        ...prev,
        ...patch,
        signatures: { ...prev.signatures, ...(patch.signatures || {}) },
        labels: { ...prev.labels, ...(patch.labels || {}) },
        styles: { ...prev.styles, ...(patch.styles || {}) },
        columnWidths: { ...prev.columnWidths, ...(patch.columnWidths || {}) },
        canvasItems: patch.canvasItems || prev.canvasItems,
      })
    )
  }

  const canvas = useFormatCanvas(
    design.canvasItems,
    (canvasItems) => patchDesign({ canvasItems }),
    (file) => exmclReportCardService.uploadCanvasImage(file)
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [saved, profile] = await Promise.all([
          exmclReportCardService.getDesign(),
          schoolProfileService.getProfile().catch(() => null),
        ])
        if (cancelled) return
        setDesign(saved)
        if (profile) setSchool(profile)
      } catch {
        if (!cancelled) toast.error('The saved report card format didn’t load. The default template is shown instead.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const boundStyle: ReportCardTextStyle = design.styles[selectedStyleKey]
  const activeStyle: FormatTextStyle =
    canvas.selected?.type === 'text'
      ? {
          fontFamily: canvas.selected.fontFamily,
          fontSize: canvas.selected.fontSize,
          bold: canvas.selected.bold,
          italic: canvas.selected.italic,
          underline: canvas.selected.underline,
        }
      : boundStyle

  const selectionLabel =
    canvas.selected?.type === 'text'
      ? 'Text box'
      : canvas.selected?.type === 'image'
        ? 'Image'
        : canvas.selected?.type === 'rect'
          ? 'Box'
          : canvas.selected?.type === 'line'
            ? 'Line'
            : STYLE_LABELS[selectedStyleKey]

  const handleStyleChange = (partial: Partial<FormatTextStyle>) => {
    if (canvas.selected?.type === 'text') {
      canvas.patchItem(partial)
      return
    }
    patchDesign({
      styles: {
        ...design.styles,
        [selectedStyleKey]: { ...design.styles[selectedStyleKey], ...partial },
      },
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await exmclReportCardService.saveDesign(design)
      setDesign(saved)
      toast.success('Report card format saved. New report cards use this layout.')
    } catch (error: any) {
      toast.error(String(error?.message || 'The report card format wasn’t saved. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  const resetTemplate = () => {
    setDesign(DEFAULT_REPORT_CARD_DESIGN)
    canvas.setSelectedId(null)
    setConfirmReset(false)
    toast.success('Reset to the IB-style template. Save the format to keep it.')
  }

  return (
    <Page width="full">
      <div className="cb-designer">
        <div className="cb-stack">
          <Card title="Page" subtitle="Paper the report card prints on.">
            <div className="cb-form-grid">
              <RadioGroup
                label="Page size"
                orientation="horizontal"
                value={design.pageSize}
                onChange={(value) => patchDesign({ pageSize: value as ReportCardPageSize })}
                options={PAGE_SIZE_OPTIONS.map((o) => ({ ...o, disabled: loading }))}
              />
              <RadioGroup
                label="Orientation"
                orientation="horizontal"
                value={design.orientation}
                onChange={(value) => patchDesign({ orientation: value as ReportCardOrientation })}
                options={ORIENTATION_OPTIONS.map((o) => ({ ...o, disabled: loading }))}
              />
            </div>
          </Card>

          <Card title="School details" subtitle="Printed in the report card header.">
            <div className="cb-form-grid">
              {SCHOOL_FIELDS.map(({ key, label, wide, type }) => (
                <TextField
                  key={key}
                  className={wide ? 'is-wide' : undefined}
                  label={label}
                  type={type}
                  value={String(design[key] || '')}
                  disabled={loading}
                  onChange={(event) => patchDesign({ [key]: event.target.value } as Partial<ReportCardDesign>)}
                />
              ))}
              <TextArea
                className="is-wide"
                label="Address"
                rows={2}
                value={design.address}
                disabled={loading}
                onChange={(event) => patchDesign({ address: event.target.value })}
              />
            </div>
          </Card>

          <Card
            title="Show on the report card"
            footer={
              <p className="ex-rcf-merge">
                Merge fields for text boxes:{' '}
                {FORMAT.mergeFields.map((field, index) => (
                  <React.Fragment key={field}>
                    {index ? ' ' : null}
                    <code>{field}</code>
                  </React.Fragment>
                ))}
              </p>
            }
          >
            <div className="cb-form-section">
              <p className="cb-form-section__title">Header</p>
              <div className="cb-check-grid">
                {HEADER_TOGGLES.map(({ key, label }) => (
                  <Checkbox
                    key={key}
                    label={label}
                    checked={Boolean(design[key])}
                    disabled={loading}
                    onChange={(value) => patchDesign({ [key]: value } as Partial<ReportCardDesign>)}
                  />
                ))}
              </div>
            </div>
            <div className="cb-form-section">
              <p className="cb-form-section__title">Footer</p>
              <div className="cb-check-grid">
                {FOOTER_TOGGLES.map(({ key, label }) => (
                  <Checkbox
                    key={key}
                    label={label}
                    checked={Boolean(design[key])}
                    disabled={loading}
                    onChange={(value) => patchDesign({ [key]: value } as Partial<ReportCardDesign>)}
                  />
                ))}
                <Checkbox
                  label="Class teacher’s signature"
                  checked={design.signatures.classTeacher}
                  disabled={loading}
                  onChange={(value) => patchDesign({ signatures: { ...design.signatures, classTeacher: value } })}
                />
                <Checkbox
                  label="Principal’s signature"
                  checked={design.signatures.principal}
                  disabled={loading}
                  onChange={(value) => patchDesign({ signatures: { ...design.signatures, principal: value } })}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="cb-designer__preview">
          <Card
            flush
            title="Preview"
            subtitle="Select any part of the card to style it, or add text, images, boxes and lines."
            action={
              <>
                <Button size="sm" icon={FileText} onClick={() => navigate(FORMAT.generatePath)}>
                  {FORMAT.generateLabel}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Save}
                  loading={saving}
                  disabled={loading}
                  onClick={() => void handleSave()}
                >
                  Save format
                </Button>
                <Menu
                  label="More format actions"
                  items={[{ label: 'Reset to template', icon: RotateCcw, onSelect: () => setConfirmReset(true) }]}
                />
              </>
            }
          >
            <FormatToolbar
              label="Report card canvas tools"
              selectionLabel={selectionLabel}
              style={activeStyle}
              styleDisabled={
                canvas.selected?.type === 'image' || canvas.selected?.type === 'rect' || canvas.selected?.type === 'line'
              }
              canvasItem={canvas.selected}
              uploadingImage={canvas.uploading}
              disabled={loading}
              onStyleChange={handleStyleChange}
              onAddText={() => canvas.addItem('text')}
              onAddImage={canvas.addImage}
              onAddRect={() => canvas.addItem('rect')}
              onAddLine={() => canvas.addItem('line')}
              onPatchCanvas={canvas.patchItem}
              onDelete={canvas.removeSelected}
            />
            <PaperStage flush state={loading ? <CardLoading label="Loading report card format…" /> : undefined}>
              <Paper
                pageSize={design.pageSize}
                orientation={design.orientation}
                width={design.orientation === 'portrait' ? 720 : 980}
                fixed
                caption
              >
                  <ReportCardPreview
                    editable
                    design={design}
                    selectedStyleKey={canvas.selectedId ? null : selectedStyleKey}
                    onSelectStyle={(key) => {
                      canvas.setSelectedId(null)
                      setSelectedStyleKey(key)
                    }}
                    onChange={patchDesign}
                    data={{
                      examTitle: 'PERIODIC TEST – 2 (2026-27)',
                      logoUrl: school.logoUrl,
                      student: {
                        name: 'Amayra',
                        motherName: 'Unknown',
                        admNo: '4323',
                        classSection: '4th - Lily',
                        fatherName: 'Mr. Sumit',
                        gender: 'Female',
                      },
                      subjects: SAMPLE_SUBJECTS,
                      grandMax: 120,
                      grandObtained: 101,
                      percentage: '84.17',
                      overallGrade: 'A2',
                    }}
                  />
                <CanvasOverlay
                  items={design.canvasItems}
                  selectedId={canvas.selectedId}
                  onSelect={canvas.setSelectedId}
                  onChange={(canvasItems) => patchDesign({ canvasItems })}
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
        description="Your changes on this page are replaced by the IB-style report card template, including any text boxes, images, boxes and lines. Nothing is saved until you select Save format."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
            <Button variant="danger" icon={RotateCcw} onClick={resetTemplate}>
              Reset to template
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ExmclReportCardFormat
