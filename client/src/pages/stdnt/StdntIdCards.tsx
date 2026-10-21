import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Contact, Printer, RotateCcw, Save, Upload } from 'lucide-react'
import idCardService, { DEFAULT_ID_CARD_DESIGN, type IdCardClassRow, type IdCardDesign } from '@/services/idCardService'
import schoolProfileService, { type SchoolProfile } from '@/services/schoolProfileService'
import IdCardPreview from '@/components/stdnt/IdCardPreview'
import { CanvasOverlay, type FormatTextStyle } from '@/components/format-editor'
import { useFormatCanvas } from '@/hooks/useFormatCanvas'
import { usePermissions } from '@/hooks/usePermissions'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FormatToolbar,
  Menu,
  Page,
  RadioGroup,
  Skeleton,
  Tabs,
  TextArea,
  TextField,
  type DataTableColumn,
} from '@/components/ui'

const errorText = (error: any, fallback: string) => String(error?.response?.data?.message || error?.message || fallback)

const SAMPLE = {
  name: 'Aarav Sharma',
  admissionNo: '2024/0412',
  classSection: '7 - B',
  rollNo: '12',
  dob: '14.03.2013',
  bloodGroup: 'B+',
  fatherName: 'Mr. Rakesh Sharma',
  motherName: 'Mrs. Neha Sharma',
  guardianPhone: '98765 43210',
  address: '12 Park Street, Jaipur',
  bus: 'Bus 4 · Malviya Nagar',
}

const FRONT_FIELDS: Array<[keyof IdCardDesign['fields'], string]> = [
  ['photo', 'Photo'],
  ['admissionNo', 'Admission no.'],
  ['classSection', 'Class and section'],
  ['rollNo', 'Roll no.'],
  ['dob', 'Date of birth'],
  ['bloodGroup', 'Blood group'],
  ['fatherName', 'Father’s name'],
  ['motherName', 'Mother’s name'],
  ['guardianPhone', 'Parent’s phone'],
  ['bus', 'Bus and stop'],
  ['qr', 'QR code (for the school bus)'],
]

const currentSessionLabel = () => {
  const now = new Date()
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${start}–${String(start + 1).slice(-2)}`
}

const DesignTab: React.FC<{
  design: IdCardDesign
  setDesign: React.Dispatch<React.SetStateAction<IdCardDesign>>
  school: Partial<SchoolProfile>
  loading: boolean
  canWrite: boolean
}> = ({ design, setDesign, school, loading, canWrite }) => {
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<IdCardDesign>) => setDesign((prev) => ({ ...prev, ...patch }))

  const canvas = useFormatCanvas(
    design.canvasItems,
    (canvasItems) => setDesign((prev) => ({ ...prev, canvasItems })),
    (file) => idCardService.uploadCanvasImage(file)
  )
  const defaultStyle: FormatTextStyle = { fontFamily: 'Arial', fontSize: 8, bold: false, italic: false, underline: false }
  const activeStyle: FormatTextStyle = canvas.selected?.type === 'text'
    ? { fontFamily: canvas.selected.fontFamily, fontSize: canvas.selected.fontSize, bold: canvas.selected.bold, italic: canvas.selected.italic, underline: canvas.selected.underline }
    : defaultStyle

  const save = async () => {
    setSaving(true)
    try {
      setDesign(await idCardService.saveDesign(design))
      toast.success('ID card design saved.')
    } catch (error) {
      toast.error(errorText(error, 'The design didn’t save. Try again in a moment.'))
    } finally {
      setSaving(false)
    }
  }

  const uploadSignature = async (file?: File) => {
    if (!file) return
    setUploading(true)
    try {
      const saved = await idCardService.uploadSignature(file)
      setDesign((prev) => ({ ...prev, signatures: { ...prev.signatures, ...saved.signatures } }))
      toast.success('Principal’s signature uploaded.')
    } catch (error) {
      toast.error(errorText(error, 'The signature didn’t upload. Use a PNG, JPG or WebP image.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="cb-designer">
      <div className="cb-stack">
        <Card title="Card">
          <div className="cb-form-section">
            <TextField label="Title" value={design.title} disabled={loading} onChange={(e) => set({ title: e.target.value })} />
            <RadioGroup
              label="Shape"
              orientation="horizontal"
              value={design.orientation}
              onChange={(value) => set({ orientation: value as IdCardDesign['orientation'] })}
              options={[
                { value: 'portrait', label: 'Upright' },
                { value: 'landscape', label: 'Wide' },
              ]}
            />
            <div className="idc-colour">
              <input type="color" aria-label="Card colour" value={design.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
              <TextField
                label="Card colour"
                value={design.accentColor}
                onChange={(e) => set({ accentColor: e.target.value })}
                error={/^#[0-9a-f]{6}$/i.test(design.accentColor) ? undefined : 'Use a colour like #1e3a8a'}
              />
            </div>
            <TextField
              label="Valid for"
              placeholder={currentSessionLabel()}
              hint="Leave empty to print the current session."
              value={design.validity}
              onChange={(e) => set({ validity: e.target.value })}
            />
          </div>
        </Card>

        <Card title="Front" subtitle="Choose what prints on each card.">
          <div className="cb-check-grid">
            <Checkbox label="School logo" checked={design.showSchoolLogo} onChange={(value) => set({ showSchoolLogo: value })} />
            <Checkbox label="School address" checked={design.showSchoolAddress} onChange={(value) => set({ showSchoolAddress: value })} />
            {FRONT_FIELDS.map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={design.fields[key]}
                onChange={(value) => setDesign((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }))}
              />
            ))}
          </div>
        </Card>

        <Card title="Back">
          <div className="cb-form-section">
            <Checkbox label="Print a back side" checked={design.showBack} onChange={(value) => set({ showBack: value })} />
            {design.showBack ? (
              <>
                <Checkbox
                  label="Home address"
                  checked={design.fields.address}
                  onChange={(value) => setDesign((prev) => ({ ...prev, fields: { ...prev.fields, address: value } }))}
                />
                <TextArea label="Notes" rows={4} hint="One line each." value={design.backText} onChange={(e) => set({ backText: e.target.value })} />
                <TextField
                  label="School phone"
                  placeholder={school.contact || ''}
                  hint="Leave empty to use the phone number in the school profile."
                  value={design.emergencyContact}
                  onChange={(e) => set({ emergencyContact: e.target.value })}
                />
              </>
            ) : null}
          </div>
        </Card>

        <Card title="Signature">
          <div className="cb-form-section">
            <Checkbox
              label="Principal’s signature line"
              checked={design.signatures.principal}
              onChange={(value) => setDesign((prev) => ({ ...prev, signatures: { ...prev.signatures, principal: value } }))}
            />
            {design.signatures.principal ? (
              <div className="cb-logo-field">
                {design.signatures.principalSignatureUrl ? (
                  <img className="cb-logo-preview" src={design.signatures.principalSignatureUrl} alt="Principal’s signature" />
                ) : null}
                <div className="cb-logo-field__body">
                  <span className="idc-print-note">
                    {design.signatures.principalSignatureUrl ? 'Printed on every card.' : 'Upload a signature image to print it on every card.'}
                  </span>
                  <Button size="sm" icon={Upload} loading={uploading} disabled={!canWrite} onClick={() => fileRef.current?.click()}>
                    {design.signatures.principalSignatureUrl ? 'Replace signature' : 'Upload signature'}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="cb-visually-hidden"
                    tabIndex={-1}
                    aria-label="Principal’s signature image"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      void uploadSignature(file)
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="cb-designer__preview">
        <Card
          flush
          title="Preview"
          subtitle="Actual card size is 85.6 × 54 mm. Drag added text and images on the front."
          action={
            canWrite ? (
              <div className="cb-card-actions">
                <Button variant="primary" size="sm" icon={Save} onClick={() => void save()} disabled={loading} loading={saving}>
                  Save design
                </Button>
                <Menu label="More design actions" items={[{ label: 'Reset to the standard design', icon: RotateCcw, onSelect: () => setResetOpen(true) }]} />
              </div>
            ) : undefined
          }
        >
          <FormatToolbar
            label="ID card canvas tools"
            selectionLabel={canvas.selected ? (canvas.selected.type === 'text' ? 'Text box' : canvas.selected.type === 'image' ? 'Image' : canvas.selected.type === 'rect' ? 'Box' : 'Line') : 'ID card'}
            style={activeStyle}
            styleDisabled={!canvas.selected || canvas.selected.type !== 'text'}
            canvasItem={canvas.selected}
            uploadingImage={canvas.uploading}
            disabled={loading || !canWrite}
            onStyleChange={canvas.applyStyle}
            onAddText={() => canvas.addItem('text', { fontSize: 8 })}
            onAddImage={canvas.addImage}
            onAddRect={() => canvas.addItem('rect')}
            onAddLine={() => canvas.addItem('line')}
            onPatchCanvas={canvas.patchItem}
            onDelete={canvas.removeSelected}
          />
          {loading ? (
            <div className="idc-previews"><Skeleton width={260} height={410} /></div>
          ) : (
            <IdCardPreview
              design={design}
              school={{ name: school.name || 'Your school', address: school.address, logoUrl: school.logoUrl, phone: school.contact }}
              validity={design.validity || currentSessionLabel()}
              sample={SAMPLE}
              overlay={
                <CanvasOverlay
                  items={design.canvasItems}
                  selectedId={canvas.selectedId}
                  onSelect={canvas.setSelectedId}
                  onChange={(canvasItems) => setDesign((prev) => ({ ...prev, canvasItems }))}
                />
              }
            />
          )}
        </Card>
      </div>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        tone="danger"
        title="Reset to the standard design?"
        description="Fields, colours, text and added boxes go back to the standard card. Nothing is saved until you choose Save design."
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Keep my changes</Button>
            <Button
              variant="danger"
              onClick={() => {
                setDesign((prev) => ({ ...DEFAULT_ID_CARD_DESIGN, signatures: prev.signatures }))
                canvas.setSelectedId(null)
                setResetOpen(false)
              }}
            >
              Reset design
            </Button>
          </>
        }
      />
    </div>
  )
}

const PrintTab: React.FC<{ design: IdCardDesign; setDesign: React.Dispatch<React.SetStateAction<IdCardDesign>>; canWrite: boolean }> = ({ design, setDesign, canWrite }) => {
  const [rows, setRows] = useState<IdCardClassRow[]>([])
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState<string | null>(null)
  const [reissue, setReissue] = useState<IdCardClassRow | null>(null)

  const load = async () => {
    try {
      setRows(await idCardService.getClasses())
    } catch (error) {
      toast.error(errorText(error, 'Could not load classes.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const print = async (row: IdCardClassRow, replace = false) => {
    const key = `${row.className}|${row.section}`
    setPrinting(key)
    try {
      const issued = await idCardService.downloadCards({ class: row.className, section: row.section, reissue: replace, design })
      toast.success(
        replace
          ? `New cards made for Class ${row.className}-${row.section}. The old cards no longer scan.`
          : issued
            ? `ID cards ready. ${issued} new card${issued === 1 ? '' : 's'} issued.`
            : 'ID cards ready.'
      )
      setReissue(null)
      await load()
    } catch (error) {
      toast.error(errorText(error, 'Could not make the ID cards.'))
    } finally {
      setPrinting(null)
    }
  }

  const columns: DataTableColumn<IdCardClassRow>[] = [
    { key: 'class', header: 'Class', mobile: 'title', render: (row) => `Class ${row.className}${row.section ? `-${row.section}` : ''}` },
    { key: 'students', header: 'Students', numeric: true, mobile: 'subtitle', render: (row) => row.students },
    {
      key: 'issued',
      header: 'Cards',
      mobile: 'aside',
      render: (row) =>
        row.issued === 0 ? (
          <Badge tone="neutral">Not printed</Badge>
        ) : row.issued < row.students ? (
          <Badge tone="warning">{row.issued} of {row.students} issued</Badge>
        ) : (
          <Badge tone="success">All issued</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (row) => (
        <div className="cb-card-actions">
          <Button size="sm" icon={Printer} disabled={!canWrite || Boolean(printing)} loading={printing === `${row.className}|${row.section}`} onClick={() => void print(row)}>
            Download cards
          </Button>
          {row.issued ? (
            <Menu
              label={`More for Class ${row.className}-${row.section}`}
              items={[{ label: 'Replace all cards (lost or damaged)', icon: RotateCcw, tone: 'danger', disabled: !canWrite, onSelect: () => setReissue(row) }]}
            />
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <div className="cb-stack">
      <Banner tone="info" title="Print at school or at any print shop">
        Download the PDF and print it on card stock, or send it to a PVC card printer. Ordering printed cards from print partners
        through Capabble is coming later.
      </Banner>
      <Card title="Paper">
        <RadioGroup
          value={design.layout}
          onChange={(value) => setDesign((prev) => ({ ...prev, layout: value as IdCardDesign['layout'] }))}
          options={[
            { value: 'sheet', label: 'A4 sheets', description: `${design.orientation === 'portrait' ? '9' : '10'} cards a page with cut lines. Backs print on the next page, lined up for two-sided printing.` },
            { value: 'single', label: 'One card a page', description: 'For PVC card printers that take card-sized pages.' },
          ]}
        />
      </Card>
      <Card flush title="Classes" subtitle="Each student’s QR stays the same when you print again. Replacing cards gives new QR codes.">
        <DataTable
          caption="Classes and ID cards"
          columns={columns}
          rows={rows}
          getRowKey={(row) => `${row.className}|${row.section}`}
          loading={loading}
          loadingLabel="Loading classes…"
          empty={<EmptyState icon={Contact} title="No students yet" body="Add students first, then print their ID cards here." />}
        />
      </Card>

      <Dialog
        open={Boolean(reissue)}
        onClose={() => setReissue(null)}
        tone="danger"
        size="sm"
        title={`Replace all cards for Class ${reissue?.className || ''}-${reissue?.section || ''}?`}
        description="Every student in this class gets a new QR. Their old cards stop working on the school bus."
        footer={
          <>
            <Button onClick={() => setReissue(null)} disabled={Boolean(printing)}>Keep old cards</Button>
            <Button variant="danger" loading={Boolean(printing)} onClick={() => reissue && void print(reissue, true)}>
              Replace cards
            </Button>
          </>
        }
      />
    </div>
  )
}

const StdntIdCards: React.FC = () => {
  const { can } = usePermissions()
  const canWrite = can('stdnt.idcards.write')
  const [tab, setTab] = useState<'design' | 'print'>('design')
  const [design, setDesign] = useState<IdCardDesign>(DEFAULT_ID_CARD_DESIGN)
  const [school, setSchool] = useState<Partial<SchoolProfile>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([idCardService.getDesign(), schoolProfileService.getProfile().catch(() => null)])
      .then(([saved, profile]) => {
        if (cancelled) return
        setDesign(saved)
        if (profile) setSchool(profile)
      })
      .catch((error) => toast.error(errorText(error, 'The ID card design didn’t load. Refresh the page to try again.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const tabs = useMemo(() => [{ id: 'design', label: 'Design' }, { id: 'print', label: 'Print' }], [])

  return (
    <Page>
      <div className="cb-stack">
        <Tabs items={tabs} value={tab} onChange={(value) => setTab(value as 'design' | 'print')} />
        {tab === 'design' ? (
          <DesignTab design={design} setDesign={setDesign} school={school} loading={loading} canWrite={canWrite} />
        ) : (
          <PrintTab design={design} setDesign={setDesign} canWrite={canWrite} />
        )}
      </div>
    </Page>
  )
}

export default StdntIdCards
