import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { UserRoundPen } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { StaffInput, StaffRecord } from '@/services/staffService'
import { useStaffRecord, useUpdateStaff } from '@/staff/queries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, Switch, haptic, useToast } from '@/ui'

const PHONE = /^[6-9]\d{9}$/
type Form = { name: string; designation: string; department: string; mobileNo: string; email: string; qualification: string; notes: string; isActive: boolean }

const fromRecord = (record: StaffRecord): Form => ({
  name: record.name ?? '',
  designation: record.designation ?? '',
  department: record.department ?? '',
  mobileNo: record.mobileNo ?? '',
  email: record.email ?? '',
  qualification: record.qualification ?? '',
  notes: record.notes ?? '',
  isActive: record.isActive !== false,
})

/**
 * Change a staff member's role and contact details (the office). Only what changed is sent; bank,
 * ID and exam-centre details stay on the website with the rest of the record.
 */
export default function ColleagueEditScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const record = useStaffRecord(id)
  const save = useUpdateStaff()
  const [edited, setForm] = useState<Form | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({})
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  const start = record.data ? fromRecord(record.data) : null
  const form = edited ?? start
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })
  const changes: StaffInput = form && start ? (Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== start[key as keyof Form])) as StaffInput) : {}
  const count = Object.keys(changes).length
  const allowLeaving = usePreventRemove(!done && count > 0 && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const submit = async () => {
    if (!form) return
    const problems: typeof errors = {}
    if ('name' in changes && form.name.trim().length < 2) problems.name = 'Enter their full name'
    if ('designation' in changes && !form.designation.trim()) problems.designation = 'Enter their designation, such as TGT English'
    if ('mobileNo' in changes && !PHONE.test(form.mobileNo.trim())) problems.mobileNo = 'Enter a 10-digit mobile number'
    setErrors(problems)
    if (Object.keys(problems).length) {
      haptic.error()
      return
    }
    try {
      const trimmed = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
      await save.mutateAsync({ id, input: trimmed })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast('Changes saved')
      router.back()
    } catch (failure) {
      haptic.error()
      setErrors({ form: failure instanceof ApiError ? failure.message : "It didn't save. Check your connection and try again." })
    }
  }

  const text = (key: Exclude<keyof Form, 'isActive'>, label: string, extra: Partial<Parameters<typeof MobileTextField>[0]> = {}) =>
    form ? <MobileTextField label={label} value={form[key]} onChangeText={(value: string) => set({ [key]: value } as Partial<Form>)} error={errors[key]} {...extra} /> : null

  return (
    <MobileScreen
      nav={<NavBar title="Edit staff record" back={{ label: 'Staff', onPress: router.back }} />}
      actionBar={
        count && form ? (
          <ActionBar icon={UserRoundPen} summary={form.name.trim() || 'Staff'} detail={`${count} ${count === 1 ? 'change' : 'changes'}`} label={save.isPending ? 'Saving…' : 'Save changes'} onPress={submit} />
        ) : undefined
      }
      overlay={
        <ActionSheet
          open={Boolean(leaving)}
          onClose={() => setLeaving(null)}
          title="Discard your changes?"
          message="The record stays as it was."
          actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
          cancelLabel="Keep editing"
        />
      }
    >
      {record.isPending ? (
        <CardSkeleton rows={5} />
      ) : record.isError || !form ? (
        <LoadFailed what="The staff record" error={record.error} onRetry={record.refetch} />
      ) : (
        <>
          {errors.form ? (
            <Callout tone="danger" title="It wasn't saved">
              {errors.form}
            </Callout>
          ) : null}
          <View style={{ gap: space['space-4'] }}>
            {text('name', 'Full name', { maxLength: 100, autoCapitalize: 'words' })}
            {text('designation', 'Designation', { maxLength: 100 })}
            {text('department', 'Department (optional)', { maxLength: 50 })}
            {text('mobileNo', 'Mobile', { type: 'tel', maxLength: 10 })}
            {text('email', 'Email (optional)', { type: 'email', maxLength: 120 })}
            {text('qualification', 'Qualification (optional)', { maxLength: 200 })}
            {text('notes', 'Notes (optional)', { multiline: true, maxLength: 500 })}
          </View>
          <ListGroup
            footer={form.isActive ? 'Turn off when they leave: they drop out of attendance, timetables and the directory.' : 'They no longer show in attendance, timetables or the directory.'}
            items={[{ title: 'Works here', accessory: <Switch label="Works here" value={form.isActive} onChange={(isActive) => set({ isActive })} /> }]}
          />
        </>
      )}
    </MobileScreen>
  )
}
