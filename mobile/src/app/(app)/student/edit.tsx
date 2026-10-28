import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { UserRoundPen } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { StudentAddress, StudentInput, StudentRecord } from '@/services/studentService'
import { useClassSections, useSaveStudent, useStudentRecord } from '@/staff/queries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, OptionList, haptic, useToast } from '@/ui'

const GENDERS = ['Boy', 'Girl', 'Other'] as const
const PHONE = /^[6-9]\d{9}$/
const ADMISSION_NO = /^[A-Z0-9]{1,20}$/

type Form = {
  rollNumber: string
  name: string
  classKey: string
  gender: string
  dateOfBirth: string
  admissionDate: string
  fatherName: string
  motherName: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  phone: string
  email: string
  street: string
  city: string
  state: string
  pincode: string
  busNo: string
  notes: string
}
type Errors = Partial<Record<keyof Form | 'form', string>>

/** "2014-05-12T00:00:00Z" → "12/05/2014", the way the office writes dates. */
const toDisplayDate = (iso?: string | null) => {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}
/** "12/05/2014" → "2014-05-12", or null when it isn't a real date. */
const toIsoDate = (text: string) => {
  const match = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (!match) return null
  const [, d, m, y] = match
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? null : iso
}

const fromRecord = (record: StudentRecord): Form => ({
  rollNumber: record.rollNumber ?? '',
  name: record.name ?? '',
  classKey: `${record.class}|${record.section}`,
  gender: record.gender && record.gender !== 'Unspecified' ? record.gender : '',
  dateOfBirth: toDisplayDate(record.dateOfBirth),
  admissionDate: toDisplayDate(record.admissionDate),
  fatherName: record.fatherName ?? '',
  motherName: record.motherName ?? '',
  guardianName: record.guardianName ?? '',
  guardianPhone: record.guardianPhone ?? '',
  guardianEmail: record.guardianEmail ?? '',
  phone: record.phone ?? '',
  email: record.email ?? '',
  street: record.address?.street ?? '',
  city: record.address?.city ?? '',
  state: record.address?.state ?? '',
  pincode: record.address?.pincode ?? '',
  busNo: record.busNo ?? '',
  notes: record.notes ?? '',
})

const blank = (classKey: string): Form => ({
  ...fromRecord({ _id: '', name: '', rollNumber: '', class: '', section: '', isActive: true }),
  classKey,
  state: 'Haryana',
})

/** What the server needs for each field, with the words the office sees. */
const check = (form: Form, adding: boolean): Errors => {
  const errors: Errors = {}
  if (adding && !ADMISSION_NO.test(form.rollNumber.trim().toUpperCase())) errors.rollNumber = 'Enter the admission number: letters and numbers, up to 20'
  if (form.name.trim().length < 2) errors.name = "Enter the student's full name"
  if (!form.classKey) errors.classKey = 'Choose the class'
  if (!toIsoDate(form.dateOfBirth)) errors.dateOfBirth = 'Enter the date of birth as DD/MM/YYYY'
  if (!toIsoDate(form.admissionDate)) errors.admissionDate = 'Enter the admission date as DD/MM/YYYY'
  if (form.fatherName.trim().length < 2) errors.fatherName = "Enter the father's name"
  if (form.motherName.trim().length < 2) errors.motherName = "Enter the mother's name"
  if (!PHONE.test(form.guardianPhone.trim())) errors.guardianPhone = 'Enter a 10-digit mobile number'
  if (form.phone.trim() && !PHONE.test(form.phone.trim())) errors.phone = 'Enter a 10-digit mobile number, or leave it empty'
  if (form.street.trim().length < 5) errors.street = 'Enter the house and street'
  if (form.city.trim().length < 2) errors.city = 'Enter the town or city'
  if (form.state.trim().length < 2) errors.state = 'Enter the state'
  if (!/^\d{6}$/.test(form.pincode.trim())) errors.pincode = 'Enter the 6-digit PIN code'
  return errors
}

const toInput = (form: Form): StudentInput => {
  const [className, section] = form.classKey.split('|')
  const address: StudentAddress = { street: form.street.trim(), city: form.city.trim(), state: form.state.trim(), pincode: form.pincode.trim() }
  return {
    rollNumber: form.rollNumber.trim().toUpperCase(),
    name: form.name.trim(),
    class: className,
    section,
    gender: form.gender || 'Unspecified',
    dateOfBirth: toIsoDate(form.dateOfBirth) ?? undefined,
    admissionDate: toIsoDate(form.admissionDate) ?? undefined,
    fatherName: form.fatherName.trim(),
    motherName: form.motherName.trim(),
    guardianName: form.guardianName.trim(),
    guardianPhone: form.guardianPhone.trim(),
    guardianEmail: form.guardianEmail.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    address,
    busNo: form.busNo.trim(),
    notes: form.notes.trim(),
  }
}

/**
 * Add a student, or (with `?id=`) change one's record, section by section. An edit sends only what
 * changed, plus the three fields the server would otherwise reset (gender, nationality, active).
 */
export default function StudentFormScreen() {
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ id?: string; className?: string; section?: string }>()
  const adding = !params.id
  const existing = useStudentRecord(params.id)
  const sections = useClassSections(true)
  const save = useSaveStudent()
  const [edited, setForm] = useState<Form | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [sheet, setSheet] = useState<'class' | 'gender' | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  const start = adding ? blank(params.className && params.section ? `${params.className}|${params.section}` : '') : existing.data ? fromRecord(existing.data) : null
  const form = edited ?? start
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })
  const changes = form && start && !adding ? diff(toInput(start), toInput(form)) : {}
  const changed = adding ? Boolean(edited) : Object.keys(changes).length > 0
  const allowLeaving = usePreventRemove(!done && changed && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const submit = async () => {
    if (!form) return
    // An edit only checks what changed (an imported record may lack, say, an address).
    const touched = new Set(
      Object.keys(changes).flatMap((key) => (key === 'address' ? ['street', 'city', 'state', 'pincode'] : key === 'class' || key === 'section' ? ['classKey'] : [key])),
    )
    const problems = Object.fromEntries(Object.entries(check(form, adding)).filter(([key]) => adding || touched.has(key))) as Errors
    setErrors(problems)
    if (Object.keys(problems).length) {
      haptic.error()
      return
    }
    try {
      const record = existing.data
      const input = adding
        ? { ...toInput(form), nationality: 'Indian', isActive: true }
        : { ...changes, gender: changes.gender ?? (record?.gender || 'Unspecified'), nationality: record?.nationality || 'Indian', isActive: record?.isActive ?? true }
      const saved = await save.mutateAsync({ id: params.id, input })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(adding ? `${saved.name ?? form.name.trim()} added to ${classLabel(...(form.classKey.split('|') as [string, string]))}` : 'Changes saved')
      if (adding && saved?._id) router.replace({ pathname: '/student/[id]', params: { id: saved._id } })
      else router.back()
    } catch (failure) {
      haptic.error()
      setErrors({ form: failure instanceof ApiError ? failure.message : "It didn't save. Check your connection and try again." })
    }
  }

  const field = (key: keyof Form, label: string, extra: Partial<Parameters<typeof MobileTextField>[0]> = {}) =>
    form ? (
      <MobileTextField
        label={label}
        value={form[key]}
        onChangeText={(text: string) => {
          set({ [key]: text } as Partial<Form>)
          if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
        }}
        error={errors[key]}
        {...extra}
      />
    ) : null

  const [className, section] = (form?.classKey ?? '').split('|')
  const firstProblem = Object.entries(errors).find(([key]) => key !== 'form')?.[1]

  return (
    <MobileScreen
      nav={<NavBar title={adding ? 'Add a student' : 'Edit student'} back={{ label: adding ? 'Students' : 'Student', onPress: router.back }} />}
      actionBar={
        form && (adding || changed) ? (
          <ActionBar
            icon={UserRoundPen}
            summary={form.name.trim() || 'New student'}
            detail={form.classKey ? classLabel(className, section) : 'Choose a class'}
            label={save.isPending ? 'Saving…' : adding ? 'Add student' : 'Save changes'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'class' ? 'Class' : 'Gender'} detent={sheet === 'class' ? 'large' : 'medium'}>
            {sheet === 'class' ? (
              <OptionList
                label="Class"
                value={form?.classKey ?? null}
                onChange={(classKey) => {
                  set({ classKey })
                  setSheet(null)
                }}
                options={(sections.data ?? []).map((entry) => ({ value: `${entry.className}|${entry.section}`, label: classLabel(entry.className, entry.section) }))}
              />
            ) : sheet === 'gender' ? (
              <OptionList
                label="Gender"
                value={form?.gender || null}
                onChange={(gender) => {
                  set({ gender })
                  setSheet(null)
                }}
                options={GENDERS.map((value) => ({ value, label: value }))}
              />
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title={adding ? 'Discard this student?' : 'Discard your changes?'}
            message={adding ? "They haven't been added." : 'The record stays as it was.'}
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {!adding && existing.isPending ? (
        <CardSkeleton rows={6} />
      ) : !adding && (existing.isError || !form) ? (
        <LoadFailed what="The student" error={existing.error} onRetry={existing.refetch} />
      ) : form ? (
        <>
          {errors.form || firstProblem ? (
            <Callout tone="danger" title={errors.form ? "It wasn't saved" : 'Check the record'}>
              {errors.form ?? firstProblem}
            </Callout>
          ) : null}

          <View style={{ gap: space['space-4'] }}>
            {field('name', 'Full name', { maxLength: 100, autoCapitalize: 'words' })}
          </View>
          <ListGroup
            header="Class"
            footer={errors.classKey}
            items={[
              { title: 'Class', value: form.classKey ? classLabel(className, section) : 'Choose', onPress: () => setSheet('class') },
              { title: 'Gender', value: form.gender || 'Choose', onPress: () => setSheet('gender') },
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            {adding ? field('rollNumber', 'Admission number', { autoCapitalize: 'characters', maxLength: 20 }) : null}
            {field('dateOfBirth', 'Date of birth', { hint: 'DD/MM/YYYY', keyboardType: 'numbers-and-punctuation', maxLength: 10 })}
            {field('admissionDate', 'Admission date', { hint: 'DD/MM/YYYY', keyboardType: 'numbers-and-punctuation', maxLength: 10 })}
          </View>

          <View style={{ gap: space['space-4'] }}>
            {field('fatherName', "Father's name", { maxLength: 100, autoCapitalize: 'words' })}
            {field('motherName', "Mother's name", { maxLength: 100, autoCapitalize: 'words' })}
            {field('guardianName', 'Guardian (if not a parent)', { maxLength: 100, autoCapitalize: 'words' })}
            {field('guardianPhone', "Guardian's mobile", { type: 'tel', maxLength: 10, hint: 'Families sign in and get calls on this number.' })}
            {field('guardianEmail', "Guardian's email (optional)", { type: 'email', maxLength: 120 })}
          </View>

          <View style={{ gap: space['space-4'] }}>
            {field('street', 'House and street', { maxLength: 200 })}
            {field('city', 'Town or city', { maxLength: 50 })}
            {field('state', 'State', { maxLength: 50 })}
            {field('pincode', 'PIN code', { type: 'number', maxLength: 6 })}
          </View>

          <View style={{ gap: space['space-4'] }}>
            {field('phone', "Student's mobile (optional)", { type: 'tel', maxLength: 10 })}
            {field('email', "Student's email (optional)", { type: 'email', maxLength: 120 })}
            {field('busNo', 'Bus (optional)', { maxLength: 20 })}
            {field('notes', 'Notes (optional)', { multiline: true, maxLength: 1000 })}
          </View>
        </>
      ) : null}
    </MobileScreen>
  )
}

/** The fields that changed; the address goes whole when any part of it changed. */
function diff(before: StudentInput, after: StudentInput): StudentInput {
  const out: StudentInput = {}
  ;(Object.keys(after) as (keyof StudentInput)[]).forEach((key) => {
    if (key === 'rollNumber') return
    if (JSON.stringify(after[key] ?? '') !== JSON.stringify(before[key] ?? '')) (out as Record<string, unknown>)[key] = after[key]
  })
  return out
}
