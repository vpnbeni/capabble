import { GST_STATES, GSTIN_PATTERN, stateName } from '@capabble/shared/gstStates'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePreventRemove, useRouter } from 'expo-router'
import { Building2 } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { billingService, type BillingAccount, type BillingProfile } from '@/services/billingService'
import { staffKeys } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, OptionList, Section, StatusView, haptic, useToast } from '@/ui'

type Form = Omit<BillingProfile, 'gstin' | 'stateCode'> & { gstin: string; stateCode: string }

const fromAccount = (account: BillingAccount): Form => ({
  legalName: account.legalName || account.tenantName,
  gstin: account.gstin ?? '',
  billingEmail: account.billingEmail ?? '',
  addressLine1: account.addressLine1 ?? '',
  addressLine2: account.addressLine2 ?? '',
  city: account.city ?? '',
  postalCode: account.postalCode ?? '',
  stateCode: account.stateCode ?? '',
})

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Billing → On your invoices: the school's legal name, GSTIN, billing email and address that
 * Capabble's invoices carry (the website's Billing profile). Changes apply to invoices issued from
 * now on. A GSTIN fixes the state, which decides CGST and SGST or IGST.
 */
export default function BillingDetailsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const client = useQueryClient()
  const me = useQuery({ queryKey: [...staffKeys.all, 'billing', 'me'], queryFn: billingService.me })
  const save = useMutation({
    mutationFn: billingService.saveProfile,
    onSuccess: () => client.invalidateQueries({ queryKey: [...staffKeys.all, 'billing'] }),
  })
  const [edited, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [pickingState, setPickingState] = useState(false)
  const account = me.data?.account
  const start = account ? fromAccount(account) : null
  const form = edited ?? start
  const dirty = Boolean(form && start && (Object.keys(form) as (keyof Form)[]).some((key) => form[key].trim() !== start[key].trim()))
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })

  const gstin = form?.gstin.trim().toUpperCase() ?? ''
  const gstinError = gstin && !GSTIN_PATTERN.test(gstin) ? 'A GSTIN has 15 characters, like 07AAACC1234D1Z5.' : undefined
  const pinError = form?.postalCode && !/^[0-9]{6}$/.test(form.postalCode) ? 'A PIN code has 6 digits.' : undefined
  const emailError = form?.billingEmail.trim() && !EMAIL.test(form.billingEmail.trim()) ? 'Enter an email like accounts@school.in.' : undefined
  const gstinState = gstin && !gstinError ? gstin.slice(0, 2) : null
  const state = gstinState || form?.stateCode || ''

  const submit = async () => {
    if (!form) return
    if (!form.legalName.trim()) return setError('Enter the legal name.')
    if (!form.billingEmail.trim()) return setError('Enter the billing email.')
    if (gstinError || pinError || emailError) return setError(gstinError || pinError || emailError || null)
    try {
      await save.mutateAsync({
        legalName: form.legalName.trim(),
        gstin: gstin || null,
        billingEmail: form.billingEmail.trim(),
        addressLine1: form.addressLine1.trim(),
        addressLine2: form.addressLine2.trim(),
        city: form.city.trim(),
        postalCode: form.postalCode.trim(),
        stateCode: state || null,
      })
      haptic.success()
      allowLeaving()
      setForm(null)
      setError(null)
      toast('Billing details saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  if (!staff.can('core.billing.manage')) {
    return (
      <MobileScreen nav={<NavBar title="Billing details" back={{ label: 'Billing', onPress: router.back }} />}>
        <StatusView kind="empty" icon={Building2} title="Only billing managers change these" body="Ask your school's administrator." />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      refreshing={me.isRefetching}
      onRefresh={me.refetch}
      nav={<NavBar title="Billing details" back={{ label: 'Billing', onPress: router.back }} />}
      actionBar={
        dirty && form ? (
          <ActionBar icon={Building2} summary={form.legalName.trim() || 'Billing details'} detail="For new invoices" label={save.isPending ? 'Saving…' : 'Save'} onPress={submit} />
        ) : undefined
      }
      overlay={
        <>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your changes?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
          <BottomSheet open={pickingState} onClose={() => setPickingState(false)} title="State" detent="large">
            <OptionList
              label="State"
              options={GST_STATES}
              value={form?.stateCode ?? ''}
              onChange={(stateCode) => {
                set({ stateCode })
                setPickingState(false)
              }}
            />
          </BottomSheet>
        </>
      }
    >
      {me.isPending ? (
        <CardSkeleton rows={6} />
      ) : me.isError || !form ? (
        <LoadFailed what="Billing details" error={me.error} onRetry={me.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          <Section title="The school">
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Legal name" value={form.legalName} onChangeText={(legalName) => set({ legalName })} maxLength={200} hint="As registered for GST, if you are registered." />
              <MobileTextField
                label="GSTIN (optional)"
                value={form.gstin}
                onChangeText={(value) => set({ gstin: value.toUpperCase().replace(/\s/g, '') })}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={15}
                error={gstinError}
                placeholder="Leave empty if not registered"
              />
              <MobileTextField
                label="Billing email"
                type="email"
                value={form.billingEmail}
                onChangeText={(billingEmail) => set({ billingEmail })}
                maxLength={200}
                error={emailError}
                hint="Invoices and receipts are emailed here."
              />
            </View>
          </Section>
          <Section title="Address">
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Address" value={form.addressLine1} onChangeText={(addressLine1) => set({ addressLine1 })} maxLength={200} />
              <MobileTextField label="Address line 2" value={form.addressLine2} onChangeText={(addressLine2) => set({ addressLine2 })} maxLength={200} />
              <MobileTextField label="City" value={form.city} onChangeText={(city) => set({ city })} maxLength={100} />
              <MobileTextField label="PIN code" type="number" value={form.postalCode} onChangeText={(value) => set({ postalCode: value.replace(/\D/g, '') })} maxLength={6} error={pinError} />
              <ListGroup
                footer={gstinState ? 'Taken from the GSTIN.' : 'Decides whether CGST and SGST or IGST is charged.'}
                items={[{ title: 'State', value: stateName(state) ?? 'Choose', chevron: !gstinState, onPress: gstinState ? undefined : () => setPickingState(true) }]}
              />
            </View>
          </Section>
          <Callout tone="info" title="For new invoices">
            Invoices already issued keep the details they were made with.
          </Callout>
        </>
      )}
    </MobileScreen>
  )
}
