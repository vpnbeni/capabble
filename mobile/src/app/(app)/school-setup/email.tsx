import { usePreventRemove, useRouter } from 'expo-router'
import { Mail } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { MailInput, MailSettings } from '@/services/schoolSetupService'
import { useMailSettings, useSaveMail, useTestMail } from '@/staff/schoolSetupQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, Section, Switch, haptic, useToast } from '@/ui'

type Form = Omit<MailInput, 'port' | 'dailyLimit'> & { port: string; dailyLimit: string }

const PORTS = [
  { value: '587', label: '587', meta: 'Most providers (STARTTLS)' },
  { value: '465', label: '465', meta: 'Secure from the start (SSL)' },
  { value: '2525', label: '2525' },
  { value: '25', label: '25' },
]

const fromServer = (data: MailSettings): Form => ({
  enabled: data.enabled,
  host: data.host,
  port: String(data.port || 587),
  secure: data.secure,
  user: data.user,
  password: '',
  fromName: data.fromName,
  fromEmail: data.fromEmail,
  replyTo: data.replyTo,
  dailyLimit: String(data.dailyLimit || 1500),
})

/**
 * Settings → School email: the school's own mail account, so event emails and replies come from
 * the school's address. The password is never shown; typing one replaces it. "Send a test to me"
 * connects with the saved settings and emails the person testing. Without it, school emails go
 * from Capabble's events address with a daily share.
 */
export default function SchoolEmailScreen() {
  const router = useRouter()
  const toast = useToast()
  const mail = useMailSettings()
  const save = useSaveMail()
  const test = useTestMail()
  const [edited, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [pickingPort, setPickingPort] = useState(false)
  const start = mail.data ? fromServer(mail.data) : null
  const form = edited ?? start
  const dirty = Boolean(form && start && (Object.keys(form) as (keyof Form)[]).some((key) => String(form[key]).trim() !== String(start[key]).trim()))
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })

  const submit = async () => {
    if (!form) return
    const dailyLimit = Number(form.dailyLimit)
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1) return setError('The daily limit is a whole number, 1 or more.')
    try {
      await save.mutateAsync({
        enabled: form.enabled,
        host: form.host.trim(),
        port: Number(form.port),
        secure: form.secure,
        user: form.user.trim(),
        password: form.password,
        fromName: form.fromName.trim(),
        fromEmail: form.fromEmail.trim(),
        replyTo: form.replyTo.trim(),
        dailyLimit,
      })
      haptic.success()
      allowLeaving()
      setForm(null)
      setError(null)
      toast('School email saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't save. Try again.")
    }
  }

  const sendTest = async () => {
    try {
      const result = await test.mutateAsync()
      haptic.success()
      toast(`Test sent to ${result.sentTo}`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The test didn't send. Try again.", 'danger')
    }
  }

  const data = mail.data
  const status = !data?.lastTestAt ? null : data.lastTestOk ? `Last test worked, ${formatDate(data.lastTestAt)}` : `Last test failed, ${formatDate(data.lastTestAt)}: ${data.lastError}`

  return (
    <MobileScreen
      refreshing={mail.isRefetching}
      onRefresh={mail.refetch}
      nav={<NavBar title="School email" back={{ label: 'Setup', onPress: router.back }} />}
      actionBar={
        dirty ? (
          <ActionBar icon={Mail} summary={form?.fromEmail.trim() || 'School email'} detail={form?.enabled ? 'On' : 'Off'} label={save.isPending ? 'Saving…' : 'Save'} onPress={submit} />
        ) : data?.host ? (
          <ActionBar
            icon={Mail}
            summary={data.fromEmail || data.host}
            detail={data.enabled ? 'Sending school emails' : 'Off'}
            label={test.isPending ? 'Sending…' : 'Send a test to me'}
            onPress={sendTest}
          />
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
          <ActionSheet
            open={pickingPort}
            onClose={() => setPickingPort(false)}
            title="Port"
            actions={PORTS.map((row) => ({ label: row.meta ? `${row.label} · ${row.meta}` : row.label, onSelect: () => set({ port: row.value, secure: row.value === '465' }) }))}
          />
        </>
      }
    >
      {mail.isPending ? (
        <CardSkeleton rows={6} />
      ) : mail.isError || !form || !data ? (
        <LoadFailed what="School email" error={mail.error} onRetry={mail.refetch} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {status && !dirty ? (
            <Callout tone={data.lastTestOk ? 'success' : 'danger'} title={data.lastTestOk ? 'Working' : 'Not working'}>
              {status}
            </Callout>
          ) : null}
          <ListGroup
            footer={
              form.enabled
                ? undefined
                : data.fallback
                  ? `While off, school emails go from ${data.fallback.fromEmail}, up to ${data.fallback.dailyLimit} a day.`
                  : 'While off, school emails are not sent.'
            }
            items={[
              { title: 'Send from the school’s account', accessory: <Switch label="Send from the school’s account" value={form.enabled} onChange={(enabled) => set({ enabled })} /> },
              { title: 'Sent today', value: String(data.usage.sentToday) },
              ...(data.usage.queued ? [{ title: 'Waiting to send', value: String(data.usage.queued) }] : []),
              ...(data.usage.failedWeek ? [{ title: 'Failed this week', value: String(data.usage.failedWeek) }] : []),
            ]}
          />
          <Section title="Mail server">
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Server" value={form.host} onChangeText={(host) => set({ host })} placeholder="smtp.gmail.com" autoCapitalize="none" autoCorrect={false} maxLength={200} />
              <ListGroup
                items={[
                  { title: 'Port', value: form.port, onPress: () => setPickingPort(true) },
                  { title: 'Secure from the start (SSL)', accessory: <Switch label="Secure from the start" value={form.secure} onChange={(secure) => set({ secure })} /> },
                ]}
              />
              <MobileTextField label="Username" value={form.user} onChangeText={(user) => set({ user })} autoCapitalize="none" autoCorrect={false} maxLength={200} />
              <MobileTextField
                label="Password"
                value={form.password}
                onChangeText={(password) => set({ password })}
                secureTextEntry
                autoCapitalize="none"
                maxLength={300}
                placeholder={data.hasPassword ? 'Saved. Type to replace it' : 'The account’s password or app password'}
              />
            </View>
          </Section>
          <Section title="How emails look">
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="From name" value={form.fromName} onChangeText={(fromName) => set({ fromName })} placeholder="The school’s name" maxLength={120} />
              <MobileTextField label="From address" type="email" value={form.fromEmail} onChangeText={(fromEmail) => set({ fromEmail })} maxLength={200} />
              <MobileTextField label="Replies go to (optional)" type="email" value={form.replyTo} onChangeText={(replyTo) => set({ replyTo })} maxLength={200} />
              <MobileTextField
                label="Most emails a day"
                type="number"
                value={form.dailyLimit}
                onChangeText={(dailyLimit) => set({ dailyLimit: dailyLimit.replace(/\D/g, '') })}
                maxLength={6}
                hint="Your provider’s limit; the rest wait for the next day."
              />
            </View>
          </Section>
        </>
      )}
    </MobileScreen>
  )
}
