import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Building2, CreditCard, FileText } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { billingService, type BillingPdf } from '@/services/billingService'
import { staffKeys } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { Callout, ChipRail, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

type Tab = 'invoices' | 'payments' | 'credit'
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const STATE: Record<string, { label: string; tone: Tone }> = {
  incomplete: { label: 'Setting up autopay', tone: 'info' },
  trialing: { label: 'Free trial', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  past_due_grace: { label: 'Payment due', tone: 'warning' },
  suspended_read_only: { label: 'Read-only', tone: 'danger' },
  grandfathered: { label: 'Complimentary', tone: 'info' },
  canceled: { label: 'Cancelled', tone: 'neutral' },
}
const INVOICE: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Due', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Void', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  uncollectible: { label: 'Written off', tone: 'neutral' },
}
const METHOD: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  emi: 'EMI',
  offline_bank: 'Bank transfer',
  offline_cheque: 'Cheque',
  offline_cash: 'Cash',
  unknown: 'Online',
}

const rupees = (paise: number) => formatINR(paise / 100)
const keys = [...staffKeys.all, 'billing'] as const

/**
 * The school's Capabble plan (the website's Billing), to look up: the plan and its state, what is
 * due next, every invoice, receipt and credit note as a PDF to the share sheet, and the billing
 * details on invoices. Paying and changing the plan are not here and nothing points to them: the
 * stores' rules on paying for the service itself (see services/billingService.ts).
 */
export default function BillingScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const me = useQuery({ queryKey: [...keys, 'me'], queryFn: billingService.me })
  const [tab, setTab] = useState<Tab>('invoices')
  const invoices = useQuery({ queryKey: [...keys, 'invoices'], queryFn: billingService.invoices })
  const payments = useQuery({ queryKey: [...keys, 'payments'], queryFn: billingService.payments, enabled: tab === 'payments' })
  const credits = useQuery({ queryKey: [...keys, 'credit-notes'], queryFn: billingService.creditNotes, enabled: tab === 'credit' })
  const [making, setMaking] = useState<string | null>(null)

  const share = async (kind: BillingPdf, id: string, name: string) => {
    if (making) return
    setMaking(id)
    try {
      const bytes = await billingService.pdf(kind, id)
      haptic.success()
      await sharePdf(bytes, `${name}.pdf`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The PDF didn't download. Try again.", 'danger')
    } finally {
      setMaking(null)
    }
  }

  const sub = me.data?.subscription
  const state = sub ? (STATE[sub.state] ?? { label: sub.state, tone: 'neutral' as Tone }) : null
  const due = (me.data?.openInvoices ?? []).reduce((sum, invoice) => sum + invoice.outstandingPaise, 0)
  const next = me.data?.upcomingRenewal
  const dueBy = (me.data?.openInvoices ?? []).map((invoice) => invoice.dueAt).sort()[0]
  const account = me.data?.account
  const canEdit = staff.can('core.billing.manage')

  const tabList = tab === 'invoices' ? invoices : tab === 'payments' ? payments : credits

  return (
    <MobileScreen
      refreshing={me.isRefetching || tabList.isRefetching}
      onRefresh={() => (me.refetch(), tabList.refetch())}
      nav={<NavBar title="Billing" back={{ label: 'Back', onPress: router.back }} />}
    >
      {me.isPending ? (
        <CardSkeleton rows={4} />
      ) : me.isError ? (
        <LoadFailed what="Billing" error={me.error} onRetry={me.refetch} />
      ) : (
        <>
          {due > 0 ? (
            <Callout tone="warning" title={`${rupees(due)} due`}>
              {dueBy ? `Due by ${formatDate(dueBy)}.` : 'Due now.'}
            </Callout>
          ) : null}
          <ListGroup
            header="Your plan"
            items={
              sub && state
                ? [
                    {
                      title: sub.bundleCode ? `${sub.bundleCode[0].toUpperCase()}${sub.bundleCode.slice(1)} plan` : 'Plan',
                      badge: state,
                      subtitle: `Paid every ${sub.interval} · ${sub.billedStudents} students`,
                      lines: 2,
                    },
                    ...(sub.state === 'trialing' && sub.trialEndsAt
                      ? [
                          { title: 'Trial ends', value: formatDate(sub.trialEndsAt) },
                          ...(me.data?.trial?.firstChargePaise ? [{ title: 'Then', value: `${rupees(me.data.trial.firstChargePaise)} a ${sub.interval}` }] : []),
                        ]
                      : next
                        ? [{ title: 'Next renewal', value: `${rupees(next.totalPaise)} on ${formatDate(next.dueAt)}` }]
                        : sub.currentPeriodEnd
                          ? [{ title: sub.cancelAtPeriodEnd ? 'Ends' : 'Renews', value: formatDate(sub.currentPeriodEnd) }]
                          : []),
                    ...(sub.graceEndsAt && sub.state === 'past_due_grace' ? [{ title: 'Pay by', value: formatDate(sub.graceEndsAt) }] : []),
                    ...(sub.items.length ? [{ title: 'Modules', subtitle: sub.items.map((item) => item.name).join(', '), lines: 3 }] : []),
                  ]
                : [{ title: 'No plan yet' }]
            }
          />
          {account ? (
            <ListGroup
              header="On your invoices"
              items={[
                {
                  title: account.legalName || account.tenantName,
                  subtitle: [account.gstin ? `GSTIN ${account.gstin}` : 'No GSTIN', account.billingEmail].filter(Boolean).join(' · '),
                  lines: 2,
                  icon: Building2,
                  tile: 3 as const,
                  chevron: canEdit,
                  onPress: canEdit ? () => router.push('/billing-details') : undefined,
                },
              ]}
            />
          ) : null}
        </>
      )}
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'invoices', label: 'Invoices' },
          { id: 'payments', label: 'Receipts' },
          { id: 'credit', label: 'Credit notes' },
        ]}
      />
      {tabList.isPending ? (
        <CardSkeleton rows={4} />
      ) : tabList.isError ? (
        <LoadFailed what="The list" error={tabList.error} onRetry={tabList.refetch} />
      ) : tab === 'invoices' && invoices.data?.length ? (
        <ListGroup
          footer="Tap one for its PDF."
          items={invoices.data.map((invoice) => ({
            title: invoice.number,
            subtitle: `${formatDate(invoice.issuedAt)} · ${rupees(invoice.totalPaise)}${invoice.status === 'open' ? ` · due ${formatDate(invoice.dueAt)}` : ''}`,
            badge: INVOICE[invoice.status],
            icon: FileText,
            tile: 3 as const,
            lines: 2 as const,
            value: making === invoice.id ? 'Making…' : undefined,
            onPress: () => share('invoices', invoice.id, `Capabble invoice ${invoice.number}`),
          }))}
        />
      ) : tab === 'payments' && payments.data?.length ? (
        <ListGroup
          items={payments.data.map((payment) => ({
            title: payment.receiptNumber ?? (payment.invoiceNumber ? `For ${payment.invoiceNumber}` : 'Payment'),
            subtitle: `${formatDate(payment.capturedAt ?? payment.createdAt)} · ${rupees(payment.amountPaise)} · ${METHOD[payment.method] ?? payment.method}`,
            badge: payment.status === 'failed' ? { label: 'Failed', tone: 'danger' as const } : payment.status === 'refunded' ? { label: 'Refunded', tone: 'neutral' as const } : undefined,
            lines: 2 as const,
            value: making === payment.id ? 'Making…' : undefined,
            onPress: payment.status === 'captured' && payment.receiptNumber ? () => share('receipts', payment.id, `Capabble receipt ${payment.receiptNumber}`) : undefined,
          }))}
        />
      ) : tab === 'credit' && credits.data?.length ? (
        <ListGroup
          items={credits.data.map((note) => ({
            title: note.number,
            subtitle: `${formatDate(note.issuedAt)} · ${rupees(note.totalPaise)}${note.refundPaise ? ` · ${rupees(note.refundPaise)} refunded` : ''}`,
            lines: 2 as const,
            value: making === note.id ? 'Making…' : undefined,
            onPress: () => share('credit-notes', note.id, `Capabble credit note ${note.number}`),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CreditCard} title={tab === 'invoices' ? 'No invoices yet' : tab === 'payments' ? 'No receipts yet' : 'No credit notes'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
