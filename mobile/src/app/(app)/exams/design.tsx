import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { FileSearch, Palette } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { pickImage } from '@/lib/pickFile'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { designService, type Design, type DesignKind } from '@/services/designService'
import { DESIGNS, REPORT_FONTS, getPath, setPath, type DesignItem } from '@/staff/designSpecs'
import { staffKeys, useClassSections, useExams } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Avatar, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, Switch, haptic, useToast } from '@/ui'

type Style = { fontFamily: string; fontSize: number; bold: boolean; italic: boolean; underline: boolean }
type Editing =
  | { item: Extract<DesignItem, { kind: 'text' | 'number' }>; value: string }
  | { item: Extract<DesignItem, { kind: 'choice' }> }
  | { item: Extract<DesignItem, { kind: 'style' }>; style: Style; pickingFont: boolean }

const DEFAULT_STYLE: Style = { fontFamily: 'Arial', fontSize: 11, bold: false, italic: false, underline: false }

const styleText = (style: Style) =>
  [style.fontFamily, `${style.fontSize} pt`, style.bold ? 'bold' : null, style.italic ? 'italic' : null, style.underline ? 'underlined' : null].filter(Boolean).join(' · ')

/**
 * A printed exam design (the website's Performas: admit card, award list, report card) as settings:
 * paper and page, what is printed, the words, signatures and, for report cards, text styles and
 * column widths. "See a sample" makes the real PDF for a class. Items placed by hand on the page
 * are set on the website and kept as they are; the whole design is saved at once, as there.
 */
export default function ExamDesignScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const queryClient = useQueryClient()
  const { kind = 'admit' } = useLocalSearchParams<{ kind: DesignKind }>()
  const spec = DESIGNS[kind]
  const canWrite = staff.can('exam.setup.write')
  const key = [...staffKeys.all, 'exam-design', kind]
  const loaded = useQuery({ queryKey: key, queryFn: () => designService.get(kind) })
  const [edited, setDesign] = useState<Design | null>(null)
  const design = edited ?? loaded.data ?? null
  const dirty = Boolean(edited && loaded.data && JSON.stringify(edited) !== JSON.stringify(loaded.data))
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [saving, setSaving] = useState(false)
  const allowLeaving = usePreventRemove(dirty && !saving, ({ repeat }) => setLeaving(() => repeat))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState<Extract<DesignItem, { kind: 'signature' }> | null>(null)
  const [sample, setSample] = useState<{ examId: string | null } | null>(null)
  const [making, setMaking] = useState(false)
  const exams = useExams(Boolean(sample))
  const sections = useClassSections(true, Boolean(sample?.examId))
  const placed = Array.isArray(design?.canvasItems) ? design.canvasItems.length : 0

  const set = (path: string, value: unknown) => design && setDesign(setPath(design, path, value))

  const save = async () => {
    if (!design) return
    setSaving(true)
    try {
      const saved = await designService.save(kind, design)
      queryClient.setQueryData(key, saved && typeof saved === 'object' && Object.keys(saved).length ? saved : design)
      haptic.success()
      allowLeaving()
      setDesign(null)
      toast(`${spec.title} design saved`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It didn't save. Try again.", 'danger')
    } finally {
      setSaving(false)
    }
  }

  const finishEdit = () => {
    if (!editing) return
    if (editing.item.kind === 'text') set(editing.item.path, 'value' in editing ? editing.value : '')
    if (editing.item.kind === 'number' && 'value' in editing) {
      const n = Number(editing.value)
      if (!Number.isInteger(n) || n < editing.item.min || n > editing.item.max) return setError(`A whole number from ${editing.item.min} to ${editing.item.max}.`)
      set(editing.item.path, n)
    }
    if (editing.item.kind === 'style' && 'style' in editing) {
      if (!Number.isFinite(editing.style.fontSize) || editing.style.fontSize < 6 || editing.style.fontSize > 72) return setError('A size from 6 to 72.')
      set(editing.item.path, editing.style)
    }
    setError(null)
    setEditing(null)
  }

  const uploadSignature = async (camera: boolean) => {
    const item = signing
    setSigning(null)
    if (!item || !design) return
    const picked = await pickImage({ camera })
    if (!picked) return
    try {
      const saved = await designService.signature(item.role, picked)
      // The server saves the image on the design; keep this screen's other changes.
      const signatures = { ...((design.signatures as Design) ?? {}), ...((saved.signatures as Design) ?? {}) }
      setDesign({ ...design, signatures })
      queryClient.setQueryData(key, { ...(loaded.data ?? {}), signatures: { ...((loaded.data?.signatures as Design) ?? {}), ...((saved.signatures as Design) ?? {}) } })
      haptic.success()
      toast('Signature uploaded')
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The signature didn't upload. Use a PNG or JPG photo.", 'danger')
    }
  }

  const makeSample = async (examId: string, className: string, section: string) => {
    setSample(null)
    if (!design || making) return
    setMaking(true)
    try {
      const bytes = await designService.sample(kind, design, examId, className, section)
      haptic.success()
      await sharePdf(bytes, `${spec.title} sample ${classLabel(className, section)}.pdf`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The sample didn't come. Try again.", 'danger')
    } finally {
      setMaking(false)
    }
  }

  const openSample = () => {
    if (kind === 'report' && dirty) return toast('Save first: report cards print from the saved design.', 'danger')
    setSample({ examId: null })
  }

  const rows = useMemo(
    () =>
      design
        ? spec.sections.map((section) => ({
            ...section,
            rows: section.items.map((item) => {
              const value = getPath(design, item.path)
              if (item.kind === 'toggle') return { title: item.label, accessory: <Switch label={item.label} value={Boolean(value)} disabled={!canWrite} onChange={(on) => set(item.path, on)} /> }
              if (item.kind === 'signature')
                return {
                  title: item.label,
                  avatar: value ? <Avatar name={item.label} src={String(value)} square size={36} /> : undefined,
                  value: value ? 'Change' : 'Add',
                  chevron: canWrite,
                  onPress: canWrite ? () => setSigning(item) : undefined,
                }
              const shown =
                item.kind === 'choice'
                  ? (item.options.find((option) => String(option.value) === String(value))?.label ?? String(value ?? ''))
                  : item.kind === 'style'
                    ? styleText({ ...DEFAULT_STYLE, ...((value as Partial<Style>) ?? {}) })
                    : String(value ?? '')
              return {
                title: item.label,
                subtitle: item.kind === 'text' || item.kind === 'style' ? shown || 'Empty' : undefined,
                value: item.kind === 'text' || item.kind === 'style' ? undefined : shown,
                lines: 2 as const,
                chevron: canWrite,
                onPress: !canWrite
                  ? undefined
                  : () => {
                      setError(null)
                      if (item.kind === 'choice') setEditing({ item })
                      else if (item.kind === 'style') setEditing({ item, pickingFont: false, style: { ...DEFAULT_STYLE, ...((value as Partial<Style>) ?? {}) } })
                      else setEditing({ item, value: String(value ?? '') })
                    },
              }
            }),
          }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, spec, canWrite],
  )

  const current = editing && design ? getPath(design, editing.item.path) : null

  return (
    <MobileScreen
      refreshing={loaded.isRefetching}
      onRefresh={loaded.refetch}
      nav={<NavBar title={`${spec.title} design`} back={{ label: 'Back', onPress: router.back }} actions={[{ icon: FileSearch, label: making ? 'Making…' : 'See a sample', onPress: openSample }]} />}
      actionBar={dirty ? <ActionBar icon={Palette} summary={`${spec.title} design`} detail="Changed" label={saving ? 'Saving…' : 'Save'} onPress={save} /> : undefined}
      overlay={
        <>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your changes?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
          <ActionSheet
            open={Boolean(signing)}
            onClose={() => setSigning(null)}
            title={signing?.label ?? ''}
            message="A photo of the signature on white paper; it is saved at once."
            actions={[
              { label: 'Choose a photo', onSelect: () => uploadSignature(false) },
              { label: 'Take a photo', onSelect: () => uploadSignature(true) },
            ]}
          />
          <BottomSheet
            open={Boolean(editing)}
            onClose={() => (editing && 'pickingFont' in editing && editing.pickingFont ? setEditing({ ...editing, pickingFont: false }) : setEditing(null))}
            title={editing?.item.label ?? ''}
            detent={editing && (editing.item.kind === 'choice' || ('pickingFont' in editing && editing.pickingFont) || (editing.item.kind === 'text' && editing.item.long)) ? 'large' : 'medium'}
            footer={
              editing && editing.item.kind !== 'choice' && !('pickingFont' in editing && editing.pickingFont) ? (
                <MobileButton fullWidth onPress={finishEdit}>
                  Done
                </MobileButton>
              ) : undefined
            }
          >
            {!editing ? null : editing.item.kind === 'choice' ? (
              <OptionList
                label={editing.item.label}
                value={String(current ?? '')}
                onChange={(picked) => {
                  const option = (editing.item as Extract<DesignItem, { kind: 'choice' }>).options.find((entry) => String(entry.value) === picked)
                  if (option) set(editing.item.path, option.value)
                  setEditing(null)
                }}
                options={editing.item.options.map((option) => ({ value: String(option.value), label: option.label }))}
              />
            ) : 'style' in editing ? (
              editing.pickingFont ? (
                <OptionList
                  label="Font"
                  value={editing.style.fontFamily}
                  onChange={(fontFamily) => setEditing({ ...editing, pickingFont: false, style: { ...editing.style, fontFamily } })}
                  options={REPORT_FONTS.map((font) => ({ value: font, label: font }))}
                />
              ) : (
                <View style={{ gap: space['space-4'] }}>
                  <ListGroup
                    items={[
                      { title: 'Font', value: editing.style.fontFamily, chevron: true, onPress: () => setEditing({ ...editing, pickingFont: true }) },
                      { title: 'Bold', accessory: <Switch label="Bold" value={editing.style.bold} onChange={(bold) => setEditing({ ...editing, style: { ...editing.style, bold } })} /> },
                      { title: 'Italic', accessory: <Switch label="Italic" value={editing.style.italic} onChange={(italic) => setEditing({ ...editing, style: { ...editing.style, italic } })} /> },
                      {
                        title: 'Underlined',
                        accessory: <Switch label="Underlined" value={editing.style.underline} onChange={(underline) => setEditing({ ...editing, style: { ...editing.style, underline } })} />,
                      },
                    ]}
                  />
                  <MobileTextField
                    label="Size (pt)"
                    type="number"
                    value={String(editing.style.fontSize || '')}
                    onChangeText={(text) => setEditing({ ...editing, style: { ...editing.style, fontSize: Number(text.replace(/\D/g, '')) || 0 } })}
                    maxLength={2}
                    error={error ?? undefined}
                  />
                </View>
              )
            ) : (
              <MobileTextField
                label={editing.item.label}
                type={editing.item.kind === 'number' ? 'number' : 'text'}
                multiline={editing.item.kind === 'text' && editing.item.long}
                value={'value' in editing ? editing.value : ''}
                onChangeText={(value) => setEditing({ ...editing, value: editing.item.kind === 'number' ? value.replace(/\D/g, '') : value } as Editing)}
                hint={'hint' in editing.item ? editing.item.hint : undefined}
                error={error ?? undefined}
                maxLength={editing.item.kind === 'number' ? 3 : 2000}
              />
            )}
          </BottomSheet>
          <BottomSheet
            open={Boolean(sample)}
            onClose={() => (sample?.examId ? setSample({ examId: null }) : setSample(null))}
            title={sample?.examId ? 'For which class' : 'For which exam'}
            detent="large"
          >
            {!sample ? null : !sample.examId ? (
              <OptionList label="Exam" value={null} onChange={(examId) => setSample({ examId })} options={(exams.data ?? []).map((exam) => ({ value: exam._id, label: exam.name, meta: exam.code }))} />
            ) : (
              <OptionList
                label="Class"
                value={null}
                onChange={(picked) => {
                  const [className, section] = picked.split('|')
                  void makeSample(sample.examId as string, className, section)
                }}
                options={(sections.data ?? []).map((row) => ({ value: `${row.className}|${row.section}`, label: classLabel(row.className, row.section), meta: `${row.students} students` }))}
              />
            )}
          </BottomSheet>
        </>
      }
    >
      {loaded.isPending ? (
        <CardSkeleton rows={8} />
      ) : loaded.isError || !design ? (
        <LoadFailed what="The design" error={loaded.error} onRetry={loaded.refetch} />
      ) : (
        <>
          {placed ? (
            <Callout tone="info" title={`${placed} ${placed === 1 ? 'item' : 'items'} placed on the page`}>
              Text, pictures or lines placed by hand on the website stay as they are; move them there.
            </Callout>
          ) : null}
          {rows.map((section) => (
            <ListGroup key={section.title} header={section.title} footer={section.footer} items={section.rows} />
          ))}
        </>
      )}
    </MobileScreen>
  )
}
