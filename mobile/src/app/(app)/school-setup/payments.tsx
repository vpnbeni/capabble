import { usePreventRemove, useRouter } from 'expo-router'
import { CreditCard } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { shareText } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { PaymentInput } from '@/services/schoolSetupService'
import { usePaymentSettings, useSavePayments, useTestPayments } from '@/staff/schoolSetupQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, Section, Switch, haptic, useToast } from '@/ui'

/**
 * Settings → Payments: the school's own Razorpay account, so families pay fees in the app and the
 * receipt is made when the money arrives. The key secret and webhook secret are never shown;
 * typing one replaces it. "Check the keys" asks Razorpay with the saved keys. The webhook address
 * goes into Razorpay's dashboard; share it to copy it there.
 */
export default function OnlinePaymentsScreen() {
  const router = useRouter()
  const toast = useToast()
  const settings = usePaymentSettings()
  const save = useSavePayments()
  const test = useTestPayments()
  const [edited, setForm] = useState<PaymentInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const data = settings.data
  const start: PaymentInput | null = data ? { enabled: data.enabled, keyId: data.keyId, keySecret: '', webhookSecret: '' } : null
  const form = edited ?? start
  const dirty = Boolean(form && start && (form.enabled !== start.enabled || form.keyId.trim() !== start.keyId || form.keySecret || form.webhookSecret))
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const set = (patch: Partial<PaymentInput>) => form && setForm({ ...form, ...patch })

  const submit = async () => {
    if (!form) return
    try {
      await save.mutateAsync({ enabled: form.enabled, keyId: form.keyId.trim(), keySecret: form.keySecret.trim(), webhookSecret: form.webhookSecret.trim() })
      haptic.success()
      allowLeaving()
      setForm(null)
      setError(null)
      toast(form.enabled ? 'Online payments saved and on' : 'Online payments saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const check = async () => {
    try {
      await test.mutateAsync()
      haptic.success()
      toast('Razorpay accepted the keys')
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The keys couldn't be checked. Try again.", 'danger')
    }
  }

  const status = !data?.lastTestAt ? null : data.lastTestOk ? `Keys checked ${formatDate(data.lastTestAt)}` : `Check failed ${formatDate(data.lastTestAt)}: ${data.lastError}`

  return (
    <MobileScreen
      refreshing={settings.isRefetching}
      onRefresh={settings.refetch}
      nav={<NavBar title="Online payments" back={{ label: 'Setup', onPress: router.back }} />}
      actionBar={
        dirty ? (
          <ActionBar icon={CreditCard} summary={form?.keyId.trim() || 'Razorpay'} detail={form?.enabled ? 'On' : 'Off'} label={save.isPending ? 'Saving…' : 'Save'} onPress={submit} />
        ) : data?.keyId && data.hasKeySecret ? (
          <ActionBar
            icon={CreditCard}
            summary={data.mode === 'live' ? 'Live keys' : 'Test keys'}
            detail={data.connected && data.enabled ? 'Families can pay in the app' : 'Off'}
            label={test.isPending ? 'Checking…' : 'Check the keys'}
            onPress={check}
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
      {settings.isPending ? (
        <CardSkeleton rows={5} />
      ) : settings.isError || !form || !data ? (
        <LoadFailed what="Online payments" error={settings.error} onRetry={settings.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {status && !dirty ? (
            <Callout tone={data.lastTestOk ? 'success' : 'danger'} title={data.lastTestOk ? 'Keys work' : 'Keys not working'}>
              {status}
            </Callout>
          ) : null}
          {data.needsReview ? (
            <Callout tone="warning" title={`${data.needsReview} ${data.needsReview === 1 ? 'payment needs' : 'payments need'} a look`}>
              Paid online but not matched to dues. Check them on the fee counter.
            </Callout>
          ) : null}
          <ListGroup
            footer={data.mode === 'test' && form.enabled ? 'Test keys take no real money. Change to live keys before families pay.' : undefined}
            items={[{ title: 'Take fees online', accessory: <Switch label="Take fees online" value={form.enabled} onChange={(enabled) => set({ enabled })} /> }]}
          />
          <Section title="Razorpay keys">
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField
                label="Key ID"
                value={form.keyId}
                onChangeText={(keyId) => set({ keyId })}
                placeholder="rzp_live_…"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={60}
                hint="Razorpay → Account & Settings → API keys."
              />
              <MobileTextField
                label="Key secret"
                value={form.keySecret}
                onChangeText={(keySecret) => set({ keySecret })}
                secureTextEntry
                autoCapitalize="none"
                maxLength={200}
                placeholder={data.hasKeySecret ? 'Saved. Type to replace it' : 'Shown once when the key is made'}
              />
              <MobileTextField
                label="Webhook secret"
                value={form.webhookSecret}
                onChangeText={(webhookSecret) => set({ webhookSecret })}
                secureTextEntry
                autoCapitalize="none"
                maxLength={200}
                placeholder={data.hasWebhookSecret ? 'Saved. Type to replace it' : 'The secret you set on the webhook'}
              />
            </View>
          </Section>
          <ListGroup
            header="Webhook"
            footer="In Razorpay → Account & Settings → Webhooks, add this address with the events payment.captured, payment.failed and order.paid. Tap it to copy or send it."
            items={[
              { title: data.webhookUrl, lines: 3, onPress: () => shareText(data.webhookUrl, 'webhook.txt', 'text/plain') },
              ...(data.lastWebhookAt ? [{ title: 'Last heard from Razorpay', value: formatDate(data.lastWebhookAt) }] : []),
            ]}
          />
        </>
      )}
    </MobileScreen>
  )
}
