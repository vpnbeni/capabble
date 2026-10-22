import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Send } from 'lucide-react'
import {
  Badge, Banner, Button, Card, Page, Skeleton, StatCard, Switch, TextField, formatRelative,
} from '@/components/ui'
import { apiMessage, mailSettingsService, type MailSettingsInput } from '@/services/calendarService'
import { usePermissions } from '@/hooks/usePermissions'
import '@/components/calendar/calendar.css'

const KEY = ['mail-settings'] as const

const PRESETS: Array<{ label: string; host: string; port: number; secure: boolean; hint: string }> = [
  { label: 'Google Workspace or Gmail', host: 'smtp.gmail.com', port: 465, secure: true, hint: 'Use an app password (Google account → Security → App passwords), not your normal password.' },
  { label: 'Hostinger', host: 'smtp.hostinger.com', port: 465, secure: true, hint: 'Use the mailbox password.' },
  { label: 'Zoho Mail', host: 'smtp.zoho.in', port: 465, secure: true, hint: 'Use an app-specific password if two-factor sign-in is on.' },
]

/** Settings → School email: send the school's emails from its own address. */
const SchoolEmail: React.FC = () => {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canEdit = can('core.school.write')
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: mailSettingsService.get })
  const [form, setForm] = useState<MailSettingsInput>({
    enabled: false, host: '', port: 465, secure: true, user: '', password: '', fromName: '', fromEmail: '', replyTo: '', dailyLimit: 1500,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!data) return
    setForm({
      enabled: data.enabled, host: data.host, port: data.port, secure: data.secure, user: data.user, password: '',
      fromName: data.fromName, fromEmail: data.fromEmail, replyTo: data.replyTo, dailyLimit: data.dailyLimit,
    })
  }, [data])
  const set = (patch: Partial<MailSettingsInput>) => setForm((f) => ({ ...f, ...patch }))

  const save = useMutation({
    mutationFn: (input: MailSettingsInput) => mailSettingsService.save(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
  const test = useMutation({
    mutationFn: mailSettingsService.test,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  const submit = async () => {
    const next: Record<string, string> = {}
    if (form.enabled) {
      if (!form.host.trim()) next.host = 'Enter the mail server, e.g. smtp.gmail.com'
      if (!form.user.trim()) next.user = 'Enter the username, usually the email address'
      if (!form.password && !data?.hasPassword) next.password = 'Enter the password'
      if (!form.fromEmail.trim()) next.fromEmail = 'Enter the address emails come from'
    }
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync(form)
      toast.success(form.enabled ? 'Saved. Send a test email to check it works.' : 'Saved')
    } catch (error) {
      toast.error(apiMessage(error, 'Could not save the email settings.'))
    }
  }
  const sendTest = async () => {
    try {
      const result = await test.mutateAsync()
      toast.success(`Test email sent to ${result.sentTo}`)
    } catch (error) {
      toast.error(apiMessage(error, 'The test email did not go.'))
    }
  }

  if (isLoading || !data) return <Page><Skeleton height={360} /></Page>

  return (
    <Page>
      <div className="cb-stack">
        <div className="cb-stats">
          <StatCard label="Emails sent today" value={data.usage.sentToday} hint={data.enabled ? `Up to ${data.dailyLimit} a day from your address` : data.fallback ? `Up to ${data.fallback.dailyLimit} a day from ${data.fallback.fromEmail}` : undefined} />
          <StatCard label="Waiting to send" value={data.usage.queued} hint="Sent in the background, a few a second" />
          <StatCard label="Failed this week" value={data.usage.failedWeek} hint="Usually an address that doesn't exist" />
        </div>

        {!data.enabled ? (
          <Banner tone="info" title={data.fallback ? `School emails come from ${data.fallback.fromEmail}` : 'No email account is set up yet'}>
            {data.fallback
              ? `They show your school's name and replies go to your school's email. To send from your own address, set it up below.`
              : 'Set up your school email below so calendar emails can go out. Notices still show in the app.'}
          </Banner>
        ) : null}

        <Card
          title="Your school's email account"
          subtitle="Calendar emails go from this address. Logins, password resets and billing still come from Capabble."
          action={data.lastTestAt ? (
            <Badge tone={data.lastTestOk ? 'success' : 'danger'}>{data.lastTestOk ? `Working · tested ${formatRelative(data.lastTestAt)}` : 'Not working'}</Badge>
          ) : data.enabled ? <Badge tone="warning">Not tested</Badge> : null}
        >
          <div className="cb-stack">
            {data.lastTestOk === false && data.lastError ? <Banner tone="danger" title="The last attempt failed">{data.lastError}</Banner> : null}
            <Switch
              label="Send from our own email"
              description="Turn off to send from Capabble's address again."
              checked={form.enabled}
              disabled={!canEdit}
              onChange={(enabled) => set({ enabled })}
            />
            <div className="cl-toolbar__actions">
              <span className="cb-muted">Fill in for:</span>
              {PRESETS.map((preset) => (
                <Button key={preset.label} size="sm" variant="secondary" disabled={!canEdit} onClick={() => { set({ host: preset.host, port: preset.port, secure: preset.secure }); toast(preset.hint) }}>
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="cb-form-grid">
              <TextField label="Mail server (SMTP)" value={form.host} error={errors.host} disabled={!canEdit} placeholder="smtp.gmail.com" onChange={(e) => set({ host: e.target.value })} />
              <div className="cb-form-grid">
                <TextField label="Port" type="number" value={String(form.port)} disabled={!canEdit} onChange={(e) => set({ port: Number(e.target.value) || 587 })} />
                <Switch label="Secure (SSL)" description="On for port 465" checked={form.secure} disabled={!canEdit} onChange={(secure) => set({ secure })} />
              </div>
              <TextField label="Username" value={form.user} error={errors.user} disabled={!canEdit} autoComplete="off" placeholder="office@yourschool.edu.in" onChange={(e) => set({ user: e.target.value })} />
              <TextField
                label="Password"
                type="password"
                value={form.password || ''}
                error={errors.password}
                disabled={!canEdit}
                autoComplete="new-password"
                placeholder={data.hasPassword ? 'Saved. Type to replace it.' : ''}
                hint="Stored encrypted. Never shown again."
                onChange={(e) => set({ password: e.target.value })}
              />
              <TextField label="From address" type="email" value={form.fromEmail} error={errors.fromEmail} disabled={!canEdit} placeholder="office@yourschool.edu.in" onChange={(e) => set({ fromEmail: e.target.value })} />
              <TextField label="From name" value={form.fromName} disabled={!canEdit} placeholder="Greenfield School" onChange={(e) => set({ fromName: e.target.value })} />
              <TextField label="Replies go to (optional)" type="email" value={form.replyTo} disabled={!canEdit} placeholder="Same as the from address" onChange={(e) => set({ replyTo: e.target.value })} />
              <TextField
                label="Most emails a day"
                type="number"
                value={String(form.dailyLimit)}
                disabled={!canEdit}
                hint="Your provider's limit. Google Workspace allows about 2,000; extra emails wait until the next day."
                onChange={(e) => set({ dailyLimit: Number(e.target.value) || 1500 })}
              />
            </div>
            {canEdit ? (
              <div className="cl-toolbar__actions">
                <Button variant="primary" icon={Mail} loading={save.isPending} onClick={submit}>Save</Button>
                <Button icon={Send} loading={test.isPending} disabled={!data.host || !data.hasPassword} onClick={sendTest}>Send a test email to me</Button>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </Page>
  )
}

export default SchoolEmail
