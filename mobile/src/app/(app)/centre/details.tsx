import { usePreventRemove, useRouter } from 'expo-router'
import { Building2 } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { CENTRE_FIELDS, type CentreDetails } from '@/services/centreService'
import { useCentreDetails, useSaveCentreDetails } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Callout, MobileScreen, MobileTextField, NavBar, Section, haptic, useToast } from '@/ui'

type Key = (typeof CENTRE_FIELDS)[number]

const fromServer = (data: Partial<CentreDetails> | null | undefined): CentreDetails =>
  Object.fromEntries(CENTRE_FIELDS.map((key) => [key, String(data?.[key] ?? (key === 'dispatchSlipInsuredAmount' ? '1000' : ''))])) as unknown as CentreDetails

/**
 * The centre as the board knows it (the website's Centre details): number, name and school code,
 * the superintendent, deputy and clerk with their phones, the packing cloth and marker colours, and
 * the dispatch slip's addresses. They print on the seating plans, duty record and dispatch slip.
 * The server keeps one record and replaces it whole, so every field is sent with each save.
 */
export default function CentreDetailsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('exam.setup.write')
  const details = useCentreDetails()
  const save = useSaveCentreDetails()
  const [edited, setForm] = useState<CentreDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const start = details.data !== undefined ? fromServer(details.data) : null
  const form = edited ?? start
  const count = form && start ? CENTRE_FIELDS.filter((key) => form[key].trim() !== start[key].trim()).length : 0
  const allowLeaving = usePreventRemove(count > 0 && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const submit = async () => {
    if (!form) return
    const trimmed = Object.fromEntries(CENTRE_FIELDS.map((key) => [key, form[key].trim()])) as unknown as CentreDetails
    if (Boolean(trimmed.centreName) !== Boolean(trimmed.centreSchoolCode)) {
      haptic.error()
      setError('Fill the centre name and its school code together, or leave both empty.')
      return
    }
    try {
      await save.mutateAsync(trimmed)
      haptic.success()
      allowLeaving()
      setForm(null)
      setError(null)
      toast('Centre details saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const field = (key: Key, label: string, extra: Partial<Parameters<typeof MobileTextField>[0]> = {}) =>
    form ? <MobileTextField label={label} value={form[key]} onChangeText={(value: string) => setForm({ ...form, [key]: value })} disabled={!canWrite} maxLength={120} {...extra} /> : null

  return (
    <MobileScreen
      nav={<NavBar title="Centre details" back={{ label: 'Centre', onPress: router.back }} />}
      actionBar={
        count ? (
          <ActionBar
            icon={Building2}
            summary={form?.centreName.trim() || 'Centre'}
            detail={`${count} ${count === 1 ? 'change' : 'changes'}`}
            label={save.isPending ? 'Saving…' : 'Save'}
            onPress={submit}
          />
        ) : undefined
      }
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
      {details.isPending ? (
        <CardSkeleton rows={6} />
      ) : details.isError || !form ? (
        <LoadFailed what="Centre details" error={details.error} onRetry={details.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          <Section title="The centre">
            <View style={{ gap: space['space-4'] }}>
              {field('centreNo', 'Centre number', { maxLength: 100 })}
              {field('centreName', 'Centre name', { maxLength: 200, hint: 'With the school code, or neither.' })}
              {field('centreSchoolCode', 'School code', { maxLength: 100 })}
            </View>
          </Section>
          <Section title="People">
            <View style={{ gap: space['space-4'] }}>
              {field('centreSuperintendent', 'Centre superintendent')}
              {field('centreSuperintendentContact', 'Superintendent’s phone', { type: 'tel', maxLength: 20 })}
              {field('deputyCentreSuperintendent', 'Deputy superintendent')}
              {field('deputyCentreSuperintendentContact', 'Deputy’s phone', { type: 'tel', maxLength: 20 })}
              {field('centreClerk', 'Centre clerk')}
              {field('centreClerkContact', 'Clerk’s phone', { type: 'tel', maxLength: 20 })}
            </View>
          </Section>
          <Section title="Packing">
            <View style={{ gap: space['space-4'] }}>
              {field('packingClothColor', 'Cloth colour', { maxLength: 80 })}
              {field('packingMarker', 'Marker colour', { maxLength: 80 })}
              {field('packingClothColorClass10', 'Cloth colour, class 10', { maxLength: 80 })}
              {field('packingMarkerClass10', 'Marker colour, class 10', { maxLength: 80 })}
              {field('packingClothColorClass12', 'Cloth colour, class 12', { maxLength: 80 })}
              {field('packingMarkerClass12', 'Marker colour, class 12', { maxLength: 80 })}
            </View>
          </Section>
          <Section title="Dispatch slip">
            <View style={{ gap: space['space-4'] }}>
              {field('dispatchSlipToAddress', 'To', { multiline: true, maxLength: 2000 })}
              {field('dispatchSlipFromAddress', 'From', { multiline: true, maxLength: 2000 })}
              {field('dispatchSlipInsuredAmount', 'Insured for (₹)', { type: 'number', maxLength: 50 })}
            </View>
          </Section>
        </>
      )}
    </MobileScreen>
  )
}
