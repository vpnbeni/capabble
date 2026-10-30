import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { HeartPulse } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton } from '@/portal/states'
import type { ClinicVisitInput } from '@/services/clinicService'
import { useClinicVisits, useSaveClinicVisit, useStudentSearch } from '@/staff/queries'
import { studentRow } from '@/staff/StudentsBrowser'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileScreen,
  MobileTextField,
  NavBar,
  SearchBar,
  StatusView,
  Surface,
  haptic,
  useToast,
  type MobileTextFieldRef,
} from '@/ui'

/**
 * Log a clinic visit (or add to one): the student, what they came with, and what was done.
 * Same fields as the website's Clinic → Cases form.
 */
export default function ClinicVisitScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const visits = useClinicVisits()
  const save = useSaveClinicVisit()
  const today = schoolToday()
  const existing = id ? visits.data?.find((visit) => visit._id === id) : undefined
  const complaintRef = useRef<MobileTextFieldRef>(null)

  const blank: ClinicVisitInput = {
    date: today,
    studentName: '',
    className: '',
    section: '',
    complaint: '',
    firstAid: '',
    treatment: '',
    suppliesUsed: '',
    attendedBy: staff.user?.displayName || staff.user?.name || '',
    notes: '',
  }
  const [form, setForm] = useState<ClinicVisitInput | null>(null)
  const start: ClinicVisitInput | null = id ? (existing ? { ...blank, ...existing } : null) : blank
  const value = form ?? start
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const search = useStudentSearch(query.trim())
  const [errors, setErrors] = useState<{ student?: string; complaint?: string; form?: string }>({})
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)
  const allowLeaving = usePreventRemove(!done && form !== null && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const set = (patch: Partial<ClinicVisitInput>) => value && setForm({ ...value, ...patch })

  const submit = async () => {
    if (!value) return
    const problems: typeof errors = {}
    if (!value.studentName.trim()) problems.student = 'Choose the student'
    if (!value.complaint.trim()) problems.complaint = 'Say what they came with, such as "Headache since morning"'
    setErrors(problems)
    if (problems.student || problems.complaint) {
      haptic.error()
      if (!problems.student) complaintRef.current?.focus()
      return
    }
    try {
      const { _id: _ignored, ...visit } = value as ClinicVisitInput & { _id?: string }
      await save.mutateAsync({ id, visit })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(id ? 'Visit updated' : `Visit logged for ${value.studentName}`)
      router.back()
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : "The visit didn't save. Check your connection and try again." })
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title={id ? 'Clinic visit' : 'Log a visit'} back={{ label: 'Clinic', onPress: router.back }} />}
      actionBar={
        value ? (
          <ActionBar
            icon={HeartPulse}
            summary={value.studentName || 'Clinic visit'}
            detail={value.date === today ? 'Today' : formatDayKey(value.date, { weekday: 'short' })}
            label={save.isPending ? 'Saving…' : id ? 'Save changes' : 'Log visit'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={picking} onClose={() => setPicking(false)} detent="large" title="Student">
            <SearchBar placeholder="Search by name or admission no." value={query} onChange={setQuery} onCancel={() => setQuery('')} />
            {query.trim().length < 2 ? null : search.isPending ? (
              <CardSkeleton rows={3} />
            ) : search.data?.length ? (
              <ListGroup
                items={search.data.map((student) =>
                  studentRow(
                    student,
                    () => {
                      set({ studentName: student.name, className: student.class, section: student.section })
                      setErrors((current) => ({ ...current, student: undefined }))
                      setPicking(false)
                    },
                    { withClass: true },
                  ),
                )}
              />
            ) : (
              <Surface padded={false}>
                <StatusView compact kind="empty" title={`No student matches "${query.trim()}"`} body="Search by name or admission no." />
              </Surface>
            )}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard this visit?"
            message="It isn't saved yet."
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {!value ? (
        <CardSkeleton rows={5} />
      ) : (
        <>
          {errors.form ? (
            <Callout tone="danger" title="The visit wasn't saved">
              {errors.form}
            </Callout>
          ) : errors.student ? (
            <Callout tone="danger" title="Choose the student">
              Search by name or admission no.
            </Callout>
          ) : null}
          <ListGroup
            items={[
              {
                title: 'Student',
                value: value.studentName ? `${value.studentName}${value.className ? ` · ${classLabel(value.className, value.section)}` : ''}` : 'Choose',
                onPress: () => setPicking(true),
              },
            ]}
          />
          <View style={{ gap: space['space-4'] }}>
            <MobileTextField
              ref={complaintRef}
              label="What they came with"
              value={value.complaint}
              onChangeText={(complaint) => set({ complaint })}
              error={errors.complaint}
              placeholder="Headache since morning"
              multiline
              maxLength={2000}
            />
            <MobileTextField label="First aid given (optional)" value={value.firstAid ?? ''} onChangeText={(firstAid) => set({ firstAid })} multiline maxLength={2000} />
            <MobileTextField label="Treatment (optional)" value={value.treatment ?? ''} onChangeText={(treatment) => set({ treatment })} multiline maxLength={2000} />
            <MobileTextField
              label="Supplies used (optional)"
              hint="Such as: 1 paracetamol, 2 bandages."
              value={value.suppliesUsed ?? ''}
              onChangeText={(suppliesUsed) => set({ suppliesUsed })}
              maxLength={500}
            />
            <MobileTextField label="Attended by" value={value.attendedBy ?? ''} onChangeText={(attendedBy) => set({ attendedBy })} maxLength={120} />
            <MobileTextField label="Notes (optional)" hint="Sent home, parent called, follow up." value={value.notes ?? ''} onChangeText={(notes) => set({ notes })} multiline maxLength={2000} />
          </View>
        </>
      )}
    </MobileScreen>
  )
}
