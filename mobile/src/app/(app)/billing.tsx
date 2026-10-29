import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { CreditCard, FileText } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { billingService, type BillingPdf } from '@/services/billingService'
import { staffKeys } from '@/staff/queries'
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
 * due next, and every invoice, receipt and credit note as a PDF to the share sheet. Paying and
 * changing the plan are done on the website.
 */
export default function BillingScreen() {
  const router = useRouter()
  const toast = useToast()
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
              Pay it on the website, under Billing.
            </Callout>
          ) : null}
          <ListGroup
            header="Your plan"
            footer="Paying and changing the plan are done on the website."
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
                : [{ title: 'No plan yet', subtitle: 'Choose one on the website.', lines: 2 }]
            }
          />
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
