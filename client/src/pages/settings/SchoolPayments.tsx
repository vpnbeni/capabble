import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, CreditCard, KeyRound, Pencil, ShieldCheck } from 'lucide-react'
import {
  Badge, Banner, Button, Card, DataTable, DetailList, EmptyState, Entity, Page, Skeleton, Switch, TextField,
  formatDate, formatINR, formatRelative, type DataTableColumn, type Tone,
} from '@/components/ui'
import cpitlService, { type PaymentSettings, type PaymentSettingsInput } from '@/services/cpitlService'
import { errorMessage } from '@/components/cpitl/CpitlUi'
import { usePermissions } from '@/hooks/usePermissions'
import '@/components/calendar/calendar.css'

const KEY = ['payment-settings'] as const

type Row = NonNullable<PaymentSettings['recent']>[number]

const STATUS: Record<Row['status'], { tone: Tone; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  review: { tone: 'warning', label: 'Needs review' },
  processing: { tone: 'info', label: 'Processing' },
}

/** Settings → Payments: parents pay fees online into the school's own Razorpay account. */
const SchoolPayments: React.FC = () => {
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canEdit = can('cpitl.finance.settings')
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: cpitlService.getPaymentSettings })
  const [form, setForm] = useState<PaymentSettingsInput>({ enabled: false, keyId: '', keySecret: '', webhookSecret: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Saved keys show as a summary; the form opens only to set them up or change them.
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!data) return
    setForm({ enabled: data.enabled, keyId: data.keyId, keySecret: '', webhookSecret: '' })
  }, [data])
  const set = (patch: Partial<PaymentSettingsInput>) => setForm((f) => ({ ...f, ...patch }))

  const save = useMutation({
    mutationFn: cpitlService.savePaymentSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
  const test = useMutation({
    mutationFn: cpitlService.testPaymentSettings,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  const keyChanged = Boolean(data && form.keyId.trim() !== data.keyId)
  const submit = async () => {
    const next: Record<string, string> = {}
    const keyId = form.keyId.trim()
    if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) next.keyId = 'The key ID starts with rzp_test_ or rzp_live_'
    if (form.enabled) {
      if (!keyId) next.keyId = 'Enter the key ID from Razorpay'
      if (!form.keySecret && (!data?.hasKeySecret || keyChanged)) next.keySecret = 'Enter the key secret'
      if (!form.webhookSecret && !data?.hasWebhookSecret) next.webhookSecret = 'Enter the webhook secret you set in Razorpay'
    }
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await save.mutateAsync({ ...form, keyId })
      setEditing(false)
      setErrors({})
      if (form.enabled) await checkKeys('Saved. Razorpay accepted the keys: parents can pay online.')
      else toast.success('Saved. Turn on Take fees online when you are ready.')
    } catch (error) {
      toast.error(await errorMessage(error, 'Could not save the payment settings.'))
    }
  }
  // The switch on the summary applies at once (keys stay as saved); turning it on checks the keys.
  const toggle = async (enabled: boolean) => {
    if (!data) return
    try {
      await save.mutateAsync({ enabled, keyId: data.keyId, keySecret: '', webhookSecret: '' })
      if (enabled) await checkKeys('Payments are on. Parents see the Pay button.')
      else toast.success('Payments are off. Parents no longer see the Pay button.')
    } catch (error) {
      toast.error(await errorMessage(error, 'Could not change the payment setting.'))
    }
  }
  async function checkKeys(done = 'The keys work. Razorpay answered.') {
    try {
      await test.mutateAsync()
      toast.success(done)
    } catch (error) {
      toast.error(await errorMessage(error, 'Razorpay did not accept the keys.'))
    }
  }
  // Razorpay takes any webhook secret you type, so we offer a strong random one to paste there.
  const [generated, setGenerated] = useState(false)
  const generateSecret = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    set({ webhookSecret: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') })
    setGenerated(true)
  }
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(form.webhookSecret || '')
      toast.success('Webhook secret copied. Paste it in Razorpay, then save here.')
    } catch {
      toast.error('Could not copy. Select the secret and copy it.')
    }
  }
  const copyWebhook = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.webhookUrl)
      toast.success('Webhook URL copied')
    } catch {
      toast.error('Could not copy. Select the URL and copy it.')
    }
  }

  if (isLoading || !data) return <Page><Skeleton height={360} /></Page>

  const configured = Boolean(data.keyId && data.hasKeySecret && data.hasWebhookSecret)
  const modeLabel = data.mode === 'live' ? 'Live' : 'Test mode'
  const statusBadge = !configured
    ? <Badge tone="neutral">Not connected</Badge>
    : !data.enabled
      ? <Badge tone="neutral">Off</Badge>
      : data.lastTestOk === false
        ? <Badge tone="danger">Not working</Badge>
        : data.lastTestOk
          ? <Badge tone="success">{`Active · ${data.mode === 'live' ? 'live' : 'test mode'}`}</Badge>
          : <Badge tone="warning">On · not checked</Badge>

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'student',
      header: 'Student',
      mobile: 'title',
      render: (row) => <Entity primary={row.student} secondary={[row.className, row.admissionNo].filter(Boolean).join(' · ')} />,
    },
    { key: 'paidBy', header: 'Paid by', mobile: 'subtitle', render: (row) => row.paidBy || '—' },
    { key: 'paidAt', header: 'Date', mobile: 'hidden', render: (row) => formatDate(row.paidAt) },
    {
      key: 'receipt',
      header: 'Receipt',
      mobile: 'hidden',
      wrap: true,
      render: (row) => (row.status === 'review' ? <span className="cb-muted">{row.reviewReason}</span> : row.receiptNo || '—'),
    },
    { key: 'amount', header: 'Amount', numeric: true, align: 'right', mobile: 'aside', render: (row) => formatINR(row.amount) },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge> },
  ]

  const webhookField = (
    <TextField
      className="is-wide"
      label="Webhook URL"
      value={data.webhookUrl}
      readOnly
      hint="In Razorpay → Account & Settings → Webhooks, add this URL with the events payment.captured, payment.failed and order.paid."
      suffix={<Button size="sm" variant="tertiary" icon={Copy} onClick={copyWebhook}>Copy</Button>}
    />
  )

  return (
    <Page>
      <div className="cb-stack">
        {!configured ? (
          <Banner tone="info" title="Parents can't pay online yet">
            Connect your school's Razorpay account below. Payments go straight to your school's bank account; receipts are made the same way as at the counter.
          </Banner>
        ) : !data.enabled ? (
          <Banner tone="info" title="Payments are off">
            Your Razorpay keys are saved. Turn on Take fees online so parents see the Pay button.
          </Banner>
        ) : data.mode === 'test' && data.lastTestOk ? (
          <Banner tone="warning" title="Test mode">
            No real money moves. Parents see the Pay button, but only Razorpay test cards and UPI work. Switch to your live keys when you're ready.
          </Banner>
        ) : null}
        {data.needsReview ? (
          <Banner tone="warning" title={`${data.needsReview} online ${data.needsReview === 1 ? 'payment needs' : 'payments need'} review`}>
            The money reached your account, but no receipt was made (usually the fee was already collected at the counter). Refund it in Razorpay or record it by hand.
          </Banner>
        ) : null}

        {configured && !editing ? (
          <Card
            title="Razorpay"
            subtitle="Payments go straight to your school's Razorpay account. Capabble never holds the money."
            action={statusBadge}
          >
            <div className="cb-stack">
              {data.enabled && data.lastTestOk === false && data.lastError ? (
                <Banner tone="danger" title="Razorpay didn't accept the keys">{`${data.lastError} Edit the keys, or check them again.`}</Banner>
              ) : null}
              <Switch
                label="Take fees online"
                description={data.enabled ? 'On. Parents see a Pay button on Fees in the app and the family portal.' : 'Off. Parents pay at the counter only.'}
                checked={data.enabled}
                disabled={!canEdit || save.isPending || test.isPending}
                onChange={toggle}
              />
              <DetailList
                columns={3}
                items={[
                  { label: 'Key ID', value: data.keyId },
                  { label: 'Mode', value: modeLabel },
                  { label: 'Secrets', value: 'Saved, encrypted' },
                  { label: 'Keys checked', value: data.lastTestAt ? `${data.lastTestOk ? 'Working' : 'Failed'} · ${formatRelative(data.lastTestAt)}` : 'Not checked yet' },
                  { label: 'Last webhook', value: data.lastWebhookAt ? formatRelative(data.lastWebhookAt) : 'None yet' },
                ]}
              />
              <div className="cb-form-grid">{webhookField}</div>
              {canEdit ? (
                <div className="cl-toolbar__actions">
                  <Button icon={ShieldCheck} loading={test.isPending} onClick={() => checkKeys()}>Check the keys</Button>
                  <Button variant="tertiary" icon={Pencil} onClick={() => setEditing(true)}>Edit keys</Button>
                </div>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card
            title="Your school's Razorpay account"
            subtitle="From Razorpay → Account & Settings → API keys. Capabble never holds the money."
            action={statusBadge}
          >
            <div className="cb-stack">
              <Switch
                label="Take fees online"
                description="Parents see a Pay button on Fees in the app and the family portal."
                checked={form.enabled}
                disabled={!canEdit}
                onChange={(enabled) => set({ enabled })}
              />
              <div className="cb-form-grid">
                <TextField
                  label="Key ID"
                  value={form.keyId}
                  error={errors.keyId}
                  disabled={!canEdit}
                  autoComplete="off"
                  placeholder="rzp_test_…"
                  hint="Use test keys first. Live keys start with rzp_live_."
                  onChange={(e) => set({ keyId: e.target.value })}
                />
                <TextField
                  label="Key secret"
                  type="password"
                  value={form.keySecret || ''}
                  error={errors.keySecret}
                  disabled={!canEdit}
                  autoComplete="new-password"
                  placeholder={data.hasKeySecret && !keyChanged ? 'Saved. Type to replace it.' : ''}
                  hint="Stored encrypted. Never shown again."
                  onChange={(e) => set({ keySecret: e.target.value })}
                />
                {webhookField}
                <TextField
                  label="Webhook secret"
                  type={generated && form.webhookSecret ? 'text' : 'password'}
                  value={form.webhookSecret || ''}
                  error={errors.webhookSecret}
                  disabled={!canEdit}
                  autoComplete="new-password"
                  placeholder={data.hasWebhookSecret ? 'Saved. Type to replace it.' : ''}
                  hint={
                    generated && form.webhookSecret
                      ? 'Copy this into Razorpay when adding the webhook, then save here. It won\'t be shown again after saving.'
                      : data.lastWebhookAt
                        ? `The same secret you typed in Razorpay. Last webhook ${formatRelative(data.lastWebhookAt)}.`
                        : 'The same secret you typed in Razorpay when adding the webhook, or generate one here.'
                  }
                  onChange={(e) => {
                    setGenerated(false)
                    set({ webhookSecret: e.target.value })
                  }}
                  suffix={
                    canEdit ? (
                      generated && form.webhookSecret ? (
                        <Button size="sm" variant="tertiary" icon={Copy} onClick={copySecret}>Copy</Button>
                      ) : (
                        <Button size="sm" variant="tertiary" icon={KeyRound} onClick={generateSecret}>Generate</Button>
                      )
                    ) : undefined
                  }
                />
              </div>
              {canEdit ? (
                <div className="cl-toolbar__actions">
                  <Button variant="primary" icon={CreditCard} loading={save.isPending} onClick={submit}>Save</Button>
                  {editing ? (
                    <Button
                      variant="tertiary"
                      onClick={() => {
                        setEditing(false)
                        setErrors({})
                        setForm({ enabled: data.enabled, keyId: data.keyId, keySecret: '', webhookSecret: '' })
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        )}
        <Card flush title="Online payments" subtitle="The latest payments parents made online. Receipts also show under Fees.">
          <DataTable
            columns={columns}
            rows={data.recent || []}
            getRowKey={(row) => row._id}
            empty={<EmptyState icon={CreditCard} title="No online payments yet" body="Payments show here when parents pay from the app or the family portal." compact />}
          />
        </Card>
      </div>
    </Page>
  )
}

export default SchoolPayments
