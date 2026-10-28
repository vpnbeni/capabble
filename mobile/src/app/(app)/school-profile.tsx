import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePreventRemove, useRouter } from 'expo-router'
import { School } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { schoolProfileService, type SchoolProfile, type SchoolProfileInput } from '@/services/schoolProfileService'
import { staffKeys } from '@/staff/queries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Avatar, Callout, MobileScreen, MobileTextField, NavBar, haptic, useToast } from '@/ui'

type Form = { schoolName: string; tagline: string; address: string; contact: string; email: string; affiliationNo: string; udiseCode: string }
const fromProfile = (profile: SchoolProfile): Form => ({
  schoolName: profile.name,
  tagline: profile.tagline,
  address: profile.address,
  contact: profile.contact,
  email: profile.email,
  affiliationNo: profile.affiliationNo,
  udiseCode: profile.udiseCode,
})

/**
 * The school's name, address and contact, as printed on receipts, report cards and emails. The
 * logo and colour stay on the website (an image upload and a brand choice at a desk).
 */
export default function SchoolProfileScreen() {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const profile = useQuery({ queryKey: [...staffKeys.all, 'school-profile'], queryFn: schoolProfileService.get })
  const save = useMutation({
    mutationFn: (input: SchoolProfileInput) => schoolProfileService.update(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'school-profile'] }),
  })
  const [edited, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const start = profile.data ? fromProfile(profile.data) : null
  const form = edited ?? start
  const changes = form && start ? (Object.fromEntries(Object.entries(form).filter(([key, value]) => value.trim() !== start[key as keyof Form])) as SchoolProfileInput) : {}
  const count = Object.keys(changes).length
  const allowLeaving = usePreventRemove(count > 0 && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })

  const submit = async () => {
    if (form && 'schoolName' in changes && form.schoolName.trim().length < 2) {
      haptic.error()
      setError("Enter the school's name.")
      return
    }
    try {
      await save.mutateAsync(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, String(value).trim()])))
      haptic.success()
      allowLeaving()
      setForm(null)
      setError(null)
      toast('School details saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const field = (key: keyof Form, label: string, extra: Partial<Parameters<typeof MobileTextField>[0]> = {}) =>
    form ? <MobileTextField label={label} value={form[key]} onChangeText={(value: string) => set({ [key]: value } as Partial<Form>)} {...extra} /> : null

  return (
    <MobileScreen
      nav={<NavBar title="School details" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={count ? <ActionBar icon={School} summary={form?.schoolName.trim() || 'School'} detail={`${count} ${count === 1 ? 'change' : 'changes'}`} label={save.isPending ? 'Saving…' : 'Save'} onPress={submit} /> : undefined}
      overlay={
        <ActionSheet
          open={Boolean(leaving)}
          onClose={() => setLeaving(null)}
          title="Discard your changes?"
          actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
          cancelLabel="Keep editing"
        />
      }
    >
      {profile.isPending ? (
        <CardSkeleton rows={5} />
      ) : profile.isError || !form ? (
        <LoadFailed what="School details" error={profile.error} onRetry={profile.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          <View style={{ alignItems: 'center' }}>
            <Avatar name={form.schoolName} src={profile.data?.logoUrl || undefined} size={72} />
          </View>
          <View style={{ gap: space['space-4'] }}>
            {field('schoolName', 'School name', { maxLength: 200 })}
            {field('tagline', 'Motto (optional)', { maxLength: 200 })}
            {field('address', 'Address', { multiline: true, maxLength: 500 })}
            {field('contact', 'Phone', { type: 'tel', maxLength: 60 })}
            {field('email', 'Email', { type: 'email', maxLength: 120 })}
            {field('affiliationNo', 'Affiliation number', { maxLength: 60 })}
            {field('udiseCode', 'UDISE code', { maxLength: 20 })}
          </View>
        </>
      )}
    </MobileScreen>
  )
}
