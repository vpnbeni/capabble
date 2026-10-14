import React, { useEffect, useRef, useState } from 'react'
import { FileText, RotateCcw, Save, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import exmclAdmitCardService, {
  DEFAULT_ADMIT_CARD_DESIGN,
  type AdmitCardDesign,
} from '@/services/exmclAdmitCardService'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import AdmitCardPreview from '@/components/exmcl/AdmitCardPreview'
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
  TextArea,
  TextField,
  Menu,
} from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/admit-cards.css'

const PREVIEW_SCHOOL = {
  name: 'INTL BHARTI SCHOOL, ROHTAK',
  address: 'Gohana Road, Rohtak, Haryana',
  schoolCode: '40291',
}

const ExmclAdmitCardFormat: React.FC = () => {
  const navigate = useNavigate()
  const [design, setDesign] = useState<AdmitCardDesign>(DEFAULT_ADMIT_CARD_DESIGN)
  const [school, setSchool] = useState<Partial<SchoolProfile>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingRole, setUploadingRole] = useState<'principal' | 'examIncharge' | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [saved, profile] = await Promise.all([
          exmclAdmitCardService.getDesign(),
          schoolProfileService.getProfile().catch(() => null),
        ])
        if (cancelled) return
        setDesign(saved)
        if (profile) setSchool(profile)
      } catch (error) {
        if (!cancelled) toast.error(errorMessage(error, 'The admit card format didn’t load. Refresh the page to try again.'))
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
  const schoolCode = String(school.schoolCode || '').trim() || PREVIEW_SCHOOL.schoolCode
  const twoUp = design.copiesPerSheet === 2
  const canvas = useFormatCanvas(
    design.canvasItems || [],
    (canvasItems) => setDesign((prev) => ({ ...prev, canvasItems })),
    (file) => exmclAdmitCardService.uploadCanvasImage(file)
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
            : 'Admit card'

  const updateField = (key: keyof AdmitCardDesign['fields'], value: boolean) => {
    setDesign((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }))
  }

  const updateSignature = (key: keyof AdmitCardDesign['signatures'], value: boolean) => {
    setDesign((prev) => ({ ...prev, signatures: { ...prev.signatures, [key]: value } }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await exmclAdmitCardService.saveDesign(design)
      setDesign(saved)
      toast.success('Admit card format saved. New admit cards will use this layout.')
    } catch (error) {
      toast.error(errorMessage(error, 'The format didn’t save. Try again in a moment.'))
    } finally {
      setSaving(false)
    }
  }

  const handleSignatureUpload = async (role: 'principal' | 'examIncharge', file?: File) => {
    if (!file) return
    setUploadingRole(role)
    try {
      const saved = await exmclAdmitCardService.uploadSignature(role, file)
      setDesign((prev) => ({
        ...prev,
        signatures: {
          ...prev.signatures,
          ...saved.signatures,
          [`${role}Digital`]: true,
        },
      }))
      toast.success(`${role === 'principal' ? 'Principal' : 'Exam in-charge'} signature uploaded.`)
    } catch (error) {
      toast.error(errorMessage(error, 'The signature didn’t upload. Use a PNG, JPG or WebP image and try again.'))
    } finally {
      setUploadingRole(null)
    }
  }

  const set = (patch: Partial<AdmitCardDesign>) => setDesign((prev) => ({ ...prev, ...patch }))

  const resetToTemplate = () => {
    setDesign(DEFAULT_ADMIT_CARD_DESIGN)
    canvas.setSelectedId(null)
    setResetOpen(false)
    toast.success('Format reset to the CBSE-style template. Save it to keep the change.')
  }

  const previewSubtitle = [
    design.pageSize === 'legal' ? 'Legal' : 'A4',
    design.orientation === 'landscape' ? 'Landscape' : 'Portrait',
    twoUp ? '2 cards per sheet' : '1 card per sheet',
  ].join(' · ')

  return (
    <Page>
      <div className="cb-designer">
        <div className="cb-stack">
          <Card title="Page" subtitle="The top heading uses the school name. Type {exam} in the title to insert the exam name.">
            <div className="cb-form-section">
              <TextField
                label="Title"
                value={design.title}
                onChange={(e) => set({ title: e.target.value })}
                disabled={loading}
              />
              <RadioGroup
                label="Page size"
                orientation="horizontal"
                value={design.pageSize}
                onChange={(value) => set({ pageSize: value as AdmitCardDesign['pageSize'] })}
                options={[
                  { value: 'A4', label: 'A4' },
                  { value: 'legal', label: 'Legal' },
                ]}
              />
              <RadioGroup
                label="Orientation"
                orientation="horizontal"
                value={design.orientation}
                onChange={(value) => set({ orientation: value as AdmitCardDesign['orientation'] })}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
              />
              <Checkbox
                label="Print 2 admit cards on one sheet"
                checked={twoUp}
                onChange={(value) => set({ copiesPerSheet: value ? 2 : 1 })}
              />
            </div>
          </Card>

          <Card title="Header">
            <div className="cb-form-section">
              <div className="cb-check-grid">
                <Checkbox label="School name" checked={design.showHeader} onChange={(value) => set({ showHeader: value })} />
                <Checkbox label="School logos" checked={design.showSchoolLogo} onChange={(value) => set({ showSchoolLogo: value })} />
                <Checkbox label="School address" checked={design.showSchoolAddress} onChange={(value) => set({ showSchoolAddress: value })} />
                <Checkbox label="Entry note" checked={design.showEntryNote} onChange={(value) => set({ showEntryNote: value })} />
              </div>
              {design.showEntryNote ? (
                <TextArea
                  label="Entry note"
                  rows={2}
                  value={design.entryNote}
                  onChange={(e) => set({ entryNote: e.target.value })}
                />
              ) : null}
            </div>
          </Card>

          <Card title="Fields" subtitle="Choose what prints on each card.">
            <div className="cb-check-grid">
              {FIELD_OPTIONS.map(([key, label]) => (
                <Checkbox key={key} label={label} checked={design.fields[key]} onChange={(value) => updateField(key, value)} />
              ))}
            </div>
          </Card>

          <Card title="Instructions">
            <div className="cb-form-section">
              <Checkbox
                label="Show instructions"
                checked={design.showInstructions}
                onChange={(value) => set({ showInstructions: value })}
              />
              {design.showInstructions ? (
                <TextArea
                  label="Instructions"
                  rows={6}
                  value={design.instructions}
                  onChange={(e) => set({ instructions: e.target.value })}
                />
              ) : null}
              <Checkbox
                label="Confirmation line"
                checked={design.showConfirmation}
                onChange={(value) => set({ showConfirmation: value })}
              />
              <Checkbox label="Disclaimer" checked={design.showDisclaimer} onChange={(value) => set({ showDisclaimer: value })} />
            </div>
          </Card>

          <Card title="Signatures">
            <div className="cb-form-section">
              <Checkbox label="Candidate" checked={design.signatures.candidate} onChange={(value) => updateSignature('candidate', value)} />
              <Checkbox label="Parent" checked={design.signatures.parent} onChange={(value) => updateSignature('parent', value)} />
              <Checkbox
                label="Exam in-charge"
                checked={design.signatures.examIncharge}
                onChange={(value) => updateSignature('examIncharge', value)}
              />
              {design.signatures.examIncharge ? (
                <div className="ex-ac-nested">
                  <Checkbox
                    label="Print digital signature"
                    checked={design.signatures.examInchargeDigital}
                    onChange={(value) => updateSignature('examInchargeDigital', value)}
                  />
                  {design.signatures.examInchargeDigital ? (
                    <SignatureUpload
                      who="Exam in-charge"
                      url={design.signatures.examInchargeSignatureUrl}
                      uploading={uploadingRole === 'examIncharge'}
                      disabled={uploadingRole !== null}
                      onFile={(file) => void handleSignatureUpload('examIncharge', file)}
                    />
                  ) : null}
                </div>
              ) : null}
              <Checkbox label="Principal" checked={design.signatures.principal} onChange={(value) => updateSignature('principal', value)} />
              {design.signatures.principal ? (
                <div className="ex-ac-nested">
                  <Checkbox
                    label="Print digital signature"
                    checked={design.signatures.principalDigital}
                    onChange={(value) => updateSignature('principalDigital', value)}
                  />
                  {design.signatures.principalDigital ? (
                    <SignatureUpload
                      who="Principal"
                      url={design.signatures.principalSignatureUrl}
                      uploading={uploadingRole === 'principal'}
                      disabled={uploadingRole !== null}
                      onFile={(file) => void handleSignatureUpload('principal', file)}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>

        </div>

        <div className="cb-designer__preview">
          <Card
            flush
            title="Preview"
            subtitle={previewSubtitle}
            action={
              <div className="cb-card-actions">
                <Button size="sm" icon={FileText} onClick={() => navigate('/exmcl/admit-cards')}>
                  Generate admit cards
                </Button>
                <Button variant="primary" size="sm" icon={Save} onClick={handleSave} disabled={loading} loading={saving}>
                  Save format
                </Button>
                <Menu
                  label="More format actions"
                  items={[{ label: 'Reset to template', icon: RotateCcw, onSelect: () => setResetOpen(true) }]}
                />
              </div>
            }
          >
            <FormatToolbar
              label="Admit card canvas tools"
              selectionLabel={selectionLabel}
              style={activeStyle}
              styleDisabled={!canvas.selected || canvas.selected.type !== 'text'}
              canvasItem={canvas.selected}
              uploadingImage={canvas.uploading}
              disabled={loading}
              onStyleChange={canvas.applyStyle}
              onAddText={() => canvas.addItem('text')}
              onAddImage={canvas.addImage}
              onAddRect={() => canvas.addItem('rect')}
              onAddLine={() => canvas.addItem('line')}
              onPatchCanvas={canvas.patchItem}
              onDelete={canvas.removeSelected}
            />
            <PaperStage flush state={loading ? <CardLoading label="Loading admit card format…" /> : undefined}>
              <Paper pageSize={design.pageSize} orientation={design.orientation} caption>
                <PaperCopies count={twoUp ? 2 : 1}>
                  <AdmitCardPreview
                    design={design}
                    compact={twoUp}
                    data={{
                      schoolName,
                      schoolAddress,
                      schoolCode,
                      logoUrl: school.logoUrl,
                      examName: 'SECONDARY EXAMINATION',
                      student: {
                        name: 'Aarav Sharma',
                        fatherName: 'Rajesh Sharma',
                        gender: 'Male',
                        motherName: 'Manisha Sharma',
                        className: '10th',
                        section: 'A',
                        rollNo: 12,
                        admissionNo: '3361',
                        dateOfBirth: '24.10.2010',
                        admitCardId: 'ACUT12',
                      },
                    }}
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
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        tone="danger"
        title="Reset to the standard template?"
        description="Your changes to fields, text, signatures and added boxes are replaced with the default layout. Nothing is saved until you choose Save format."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Keep my changes
            </Button>
            <Button variant="danger" onClick={resetToTemplate}>
              Reset to template
            </Button>
          </>
        }
      />
    </Page>
  )
}

const FIELD_OPTIONS: Array<[keyof AdmitCardDesign['fields'], string]> = [
  ['photo', 'Photo'],
  ['rollNo', 'Roll no.'],
  ['dob', 'Date of birth'],
  ['schoolNo', 'School no.'],
  ['centreNo', 'Centre no.'],
  ['rollNoInWords', 'Roll no. in words'],
  ['exam', 'Examination'],
  ['name', 'Candidate name'],
  ['motherName', 'Mother’s name'],
  ['fatherName', 'Father’s name'],
  ['gender', 'Gender'],
  ['schoolName', 'Name of school'],
  ['examCentre', 'Exam centre'],
  ['pwdCategory', 'PwD category'],
  ['admitCardId', 'Admit card ID'],
  ['qr', 'QR code'],
  ['subjects', 'Subject table'],
  ['section', 'Section'],
  ['admissionNo', 'Admission no.'],
]

/** Shows the uploaded signature and a button that opens the file picker. */
const SignatureUpload: React.FC<{
  who: string
  url?: string
  uploading: boolean
  disabled: boolean
  onFile: (file?: File) => void
}> = ({ who, url, uploading, disabled, onFile }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="ex-ac-signature">
      {url ? (
        <img src={url} alt={`${who} signature`} />
      ) : (
        <span className="ex-ac-signature__hint">Upload a signature image to print on every card.</span>
      )}
      <Button
        variant="secondary"
        size="sm"
        icon={Upload}
        loading={uploading}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {url ? 'Replace signature' : 'Upload signature'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="ex-ac-file"
        tabIndex={-1}
        aria-label={`${who} signature image`}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          onFile(file)
        }}
      />
    </div>
  )
}

export default ExmclAdmitCardFormat
