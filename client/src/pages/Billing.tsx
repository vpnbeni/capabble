import React, { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CreditCard, FileText, Receipt } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Entity,
  Figure,
  Menu,
  Page,
  Select,
  Sheet,
  Skeleton,
  StatCard,
  Tabs,
  Timeline,
  TextField,
  formatDate,
} from '@/components/ui'
import type { Tone } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import {
  billingKeys,
  useBillingCreditNotes,
  useBillingInvoices,
  useBillingMe,
  useBillingPayments,
  useBillingPreview,
  useCancelSubscription,
  useResumeSubscription,
  useSubscribe,
  useUpdateBillingProfile,
} from '@/hooks/useBilling'
import billingService, {
  GST_STATES,
  stateName,
  type BillingAccount,
  type BillingInvoice,
  type BillingSubscription,
  type Quote,
  type SettledPayment,
} from '@/services/billingService'
import { getCurrentUser } from '@/redux/slices/authSlice'
import type { AppDispatch } from '@/redux/store'
import { PlanFields, rupees, rupeesExact, usePlanSelection } from '@/components/billing/PlanSelection'
import '@/components/billing/billing.css'
import { GSTIN_PATTERN } from '@capabble/shared/gstStates'


/** A period [start, end) ends the day before `end`. */
const lastDay = (end: string | null | undefined) => (end ? formatDate(new Date(new Date(end).getTime() - 1)) : '—')

const STATE: Record<string, { label: string; tone: Tone }> = {
  incomplete: { label: 'Setting up autopay', tone: 'info' },
  trialing: { label: 'Free trial', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  past_due_grace: { label: 'Payment due', tone: 'warning' },
  suspended_read_only: { label: 'Read-only', tone: 'danger' },
  grandfathered: { label: 'Complimentary', tone: 'info' },
  canceled: { label: 'Cancelled', tone: 'neutral' },
}

const METHOD: Record<string, string> = {
  upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI',
  offline_bank: 'Bank transfer', offline_cheque: 'Cheque', offline_cash: 'Cash', unknown: 'Online',
}

const DAY_MS = 86400000

/** The opt-in trial's dates, and which one the school has reached. */
const trialTimeline = (sub: BillingSubscription, amountPaise: number | null, autopay: boolean) => {
  const end = new Date(sub.trialEndsAt || Date.now()).getTime()
  const reminder = end - 7 * DAY_MS
  const notice = end - DAY_MS
  const now = Date.now()
  const current = now < reminder ? 0 : now < notice ? 1 : now < end ? 2 : 3
  return {
    current,
    steps: [
      { label: 'Started', date: formatDate(sub.trialStartedAt || sub.trialConsentAt), caption: 'Every module open' },
      { label: 'Reminder', date: formatDate(new Date(reminder)), caption: 'We email you a week before' },
      autopay
        ? { label: 'Notice', date: formatDate(new Date(notice)), caption: 'Pre-debit notice' }
        : { label: 'Invoice', date: formatDate(new Date(reminder)), caption: 'Your first invoice' },
      { label: autopay ? 'First charge' : 'Plan starts', date: formatDate(sub.trialEndsAt), caption: amountPaise != null ? `${rupeesExact(amountPaise)} with GST` : undefined },
    ],
  }
}

const isOverdue = (inv: BillingInvoice) => inv.status === 'open' && new Date(inv.dueAt) < new Date()

const invoiceBadge = (inv: BillingInvoice) => {
  if (isOverdue(inv)) return <Badge tone="danger">Overdue</Badge>
  if (inv.status === 'open') return <Badge tone="info">Due {formatDate(inv.dueAt, { year: false })}</Badge>
  if (inv.status === 'paid') return <Badge tone="success">Paid</Badge>
  return <Badge tone="neutral">Void</Badge>
}

const openPdf = (kind: 'invoices' | 'receipts' | 'credit-notes', id: string, name: string) =>
  billingService.openPdf(kind, id, name).catch(() => toast.error("Couldn't open the PDF. Try again."))

const Billing: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const queryClient = useQueryClient()
  const { can } = usePermissions()
  const canManage = can('core.billing.manage')
  const [params, setParams] = useSearchParams()
  const me = useBillingMe()
  const [tab, setTab] = useState('invoices')
  const [choosing, setChoosing] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [paying, setPaying] = useState(false)
  const [settled, setSettled] = useState<SettledPayment | null>(null)
  const cancel = useCancelSubscription()
  const resume = useResumeSubscription()

  const refreshEverything = () => {
    queryClient.invalidateQueries({ queryKey: billingKeys.all })
    dispatch(getCurrentUser())
  }

  // Back from Razorpay: record the payment straight away (the webhook may not have arrived),
  // then confirm it, whichever of the two recorded it.
  useEffect(() => {
    if (params.get('paid') !== '1') return
    const linkStatus = params.get('razorpay_payment_link_status')
    if (linkStatus && linkStatus !== 'paid') {
      toast.error('The payment wasn’t completed and nothing was charged. You can try again.')
    }
    billingService.reconcile(params.get('razorpay_payment_link_id'))
      .then((result) => {
        if (result.settled) setSettled(result.settled)
        else if (result.recorded.length) toast.success('Payment received. Thank you.')
        else if (!linkStatus || linkStatus === 'paid') toast('Your payment is being confirmed. This page updates in a minute.')
      })
      .catch(() => {})
      .finally(() => {
        refreshEverything()
        params.delete('paid')
        params.delete('razorpay_payment_id')
        params.delete('razorpay_payment_link_id')
        params.delete('razorpay_payment_link_reference_id')
        params.delete('razorpay_payment_link_status')
        params.delete('razorpay_signature')
        params.delete('reason')
        setParams(params, { replace: true })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const data = me.data
  const sub = data?.subscription || null
  const account = data?.account || null
  const entitlement = data?.entitlement
  const state = entitlement?.state || sub?.state || ''
  const openInvoices = data?.openInvoices || []
  const due = openInvoices.reduce((sum, inv) => sum + inv.outstandingPaise, 0)
  const overdue = openInvoices.filter(isOverdue)
  const items = sub?.items || []
  const everything = Boolean(entitlement?.entitledModules?.includes('*'))
  // A trial the school opted in to (chose a plan and agreed to its terms).
  const optInTrial = sub?.state === 'trialing' && Boolean(sub.trialConsentAt)
  const trialAmount = data?.trial?.firstChargePaise ?? null

  const payNow = async () => {
    setPaying(true)
    try {
      const { paymentLink } = await billingService.payNow()
      window.location.href = paymentLink.url
    } catch {
      setPaying(false)
    }
  }

  if (me.isLoading) {
    return (
      <Page>
        <BillingSkeleton />
      </Page>
    )
  }

  if (me.isError || !data) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={CreditCard}
            title="Billing isn't available right now"
            body="Try again in a minute. If this keeps happening, write to support."
            action={<Button variant="secondary" onClick={() => me.refetch()}>Try again</Button>}
          />
        </Card>
      </Page>
    )
  }

  const stateInfo = STATE[state]
  const nextPayment = data.upcomingRenewal
  const planSubtitle = sub?.currentPeriodStart
    ? `${sub.interval === 'year' ? 'Yearly' : 'Monthly'} · ${formatDate(sub.currentPeriodStart)} to ${lastDay(sub.currentPeriodEnd)}`
    : sub?.state === 'trialing' ? `Free trial until ${formatDate(sub.trialEndsAt)}` : undefined

  return (
    <Page>
      <div className="cb-stack">
        <StateBanner
          state={state}
          sub={sub}
          due={due}
          overdueCount={overdue.length}
          canManage={canManage}
          onChoose={() => setChoosing(true)}
          onPay={payNow}
          paying={paying}
          setupRequired={entitlement?.accessMode === 'setup_required'}
          onResume={() => resume.mutate(undefined, {
            onSuccess: (result) => {
              refreshEverything()
              if (result?.authorizeUrl) {
                toast.success('Your trial continues. Set up autopay again to keep your plan.')
                window.location.href = result.authorizeUrl
                return
              }
              // The server's own message confirms it.
            },
          })}
        />

        {optInTrial && sub ? (
          <Card
            title="Your free trial"
            subtitle={sub.cancelAtPeriodEnd
              ? `Cancelled. Every module stays open until ${formatDate(sub.trialEndsAt)}, and nothing will be charged.`
              : `Every module is open until ${formatDate(sub.trialEndsAt)}. After that your plan keeps ${items.map((i) => i.name).join(', ') || 'the modules you choose'}.`}
            action={canManage ? (
              <div className="cb-card-actions">
                <Button size="sm" variant="secondary" onClick={() => setChoosing(true)}>Change plan</Button>
                {!sub.cancelAtPeriodEnd ? <Menu items={[{ label: 'Cancel trial', tone: 'danger', onSelect: () => setConfirmCancel(true) }]} /> : null}
              </div>
            ) : undefined}
          >
            <div className="cb-stack">
              <Timeline {...trialTimeline(sub, trialAmount, Boolean(entitlement?.autopay))} label="Your trial" />
              <DetailList
                columns={3}
                items={[
                  { label: entitlement?.autopay ? 'First charge' : 'First invoice', value: trialAmount != null ? `${rupeesExact(trialAmount)} with GST` : null },
                  { label: 'Paid by', value: entitlement?.autopay ? 'Autopay' : 'Invoice' },
                  { label: 'You agreed on', value: sub.trialConsentAt ? formatDate(sub.trialConsentAt) : null },
                ]}
              />
            </div>
          </Card>
        ) : null}

        <div className="cb-stats">
          <StatCard label="Due now" value={rupees(due)} hint={overdue.length ? `${overdue.length} overdue` : openInvoices.length ? `by ${formatDate(openInvoices[0].dueAt)}` : 'Nothing to pay'} />
          <StatCard
            label={sub?.state === 'trialing' ? 'Trial ends' : 'Next renewal'}
            value={sub?.state === 'trialing' ? formatDate(sub.trialEndsAt) : nextPayment ? rupees(nextPayment.totalPaise) : '—'}
            hint={sub?.state === 'trialing' ? 'Every module is open until then' : nextPayment ? `on ${formatDate(nextPayment.dueAt)}, with GST` : undefined}
          />
          <StatCard label="Students billed" value={(sub?.billedStudents || sub?.declaredStudents || 0).toLocaleString('en-IN')} hint={data.liveStudents != null ? `${data.liveStudents.toLocaleString('en-IN')} active in Students` : undefined} />
          <StatCard label="Modules" value={everything ? 'All' : String(items.length)} hint={everything ? 'During the trial' : 'Paid modules'} />
        </div>

        <div className="cb-grid-8-4">
          <Card
            title="Your plan"
            subtitle={planSubtitle}
            action={(
              <div className="cb-card-actions">
                {stateInfo ? <Badge tone={stateInfo.tone}>{stateInfo.label}</Badge> : null}
                {canManage && !optInTrial ? (
                  <Button size="sm" variant="secondary" onClick={() => setChoosing(true)}>
                    {items.length ? 'Change modules' : 'Choose modules'}
                  </Button>
                ) : null}
                {canManage && !optInTrial && sub && sub.state !== 'canceled' && !sub.cancelAtPeriodEnd && items.length ? (
                  <Menu items={[{ label: 'Cancel subscription', tone: 'danger', onSelect: () => setConfirmCancel(true) }]} />
                ) : null}
              </div>
            )}
          >
            {items.length ? (
              <ul className="bl-modules">
                {items.map((item) => (
                  <li key={item.id}>
                    <Entity primary={item.name} secondary={`Since ${formatDate(item.startedAt)}`} />
                    {item.endsAtPeriodEnd
                      ? <Badge tone="warning">Ends {lastDay(sub?.currentPeriodEnd)}</Badge>
                      : <Badge tone="success">Included</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                title={everything ? 'Every module is open during your trial' : 'No modules yet'}
                body={canManage ? 'Choose the modules you want to keep. You pay only for those, priced by your number of students.' : 'Your school administrator chooses the modules.'}
                action={canManage ? <Button variant="primary" onClick={() => setChoosing(true)}>Choose modules</Button> : undefined}
              />
            )}
          </Card>

          <Card title="Payment">
            {due > 0 ? (
              <div className="bl-pay">
                <Figure value={rupeesExact(due)} caption={overdue.length ? 'overdue' : `due by ${formatDate(openInvoices[0].dueAt)}`} />
                {canManage ? (
                  <Button variant="primary" fullWidth loading={paying} onClick={payNow} icon={CreditCard}>Pay {rupeesExact(due)}</Button>
                ) : (
                  <p className="cb-muted">Ask your school administrator to pay.</p>
                )}
                <p className="cb-subtle">UPI, cards or netbanking, through Razorpay. You get a receipt by email.</p>
              </div>
            ) : (
              <EmptyState
                compact
                title="Nothing to pay"
                body={nextPayment ? `Your next invoice is due on ${formatDate(nextPayment.dueAt)}.` : 'Invoices appear here when they are issued.'}
              />
            )}
          </Card>
        </div>

        <Card flush title="Invoices and receipts">
          <CardToolbar>
            <Tabs
              value={tab}
              onChange={setTab}
              label="Billing documents"
              items={[
                { id: 'invoices', label: 'Invoices' },
                { id: 'receipts', label: 'Receipts' },
                { id: 'credit', label: 'Credit notes' },
              ]}
            />
          </CardToolbar>
          {tab === 'invoices' ? <InvoicesTable /> : null}
          {tab === 'receipts' ? <ReceiptsTable /> : null}
          {tab === 'credit' ? <CreditNotesTable /> : null}
        </Card>

        <Card
          title="Billing profile"
          subtitle="Printed on your invoices. Add your GSTIN to claim input tax credit."
          action={canManage && account ? <Button size="sm" variant="secondary" onClick={() => setEditingProfile(true)}>Edit billing profile</Button> : undefined}
        >
          {account ? (
            <DetailList
              columns={3}
              items={[
                { label: 'Legal name', value: account.legalName || account.tenantName },
                { label: 'GSTIN', value: account.gstin || 'Not registered' },
                { label: 'Billing email', value: account.billingEmail },
                {
                  label: 'Address',
                  wide: true,
                  value: [account.addressLine1, account.addressLine2, [account.city, account.postalCode].filter(Boolean).join(' '), stateName(account.stateCode)].filter(Boolean).join(', '),
                },
              ]}
            />
          ) : (
            <EmptyState compact title="No billing account yet" body="It is set up when your school's trial starts." />
          )}
        </Card>
      </div>

      {choosing ? <ChooseModulesSheet sub={sub} liveStudents={data.liveStudents ?? null} onClose={() => setChoosing(false)} onDone={refreshEverything} /> : null}
      {editingProfile && account ? <ProfileSheet account={account} onClose={() => setEditingProfile(false)} /> : null}
      <Dialog
        open={Boolean(settled)}
        onClose={() => setSettled(null)}
        size="sm"
        title="Payment received"
        description={settled && settled.invoice.outstandingPaise > 0
          ? `Thank you. ${rupeesExact(settled.invoice.outstandingPaise)} of this invoice is still due.`
          : 'Thank you. Your invoice is paid in full.'}
        footer={settled ? (
          <>
            <Button
              variant="secondary"
              icon={Receipt}
              onClick={() => openPdf('receipts', settled.payment.id, settled.payment.receiptNumber || 'receipt')}
            >
              Download receipt
            </Button>
            <Button variant="primary" onClick={() => setSettled(null)}>Done</Button>
          </>
        ) : null}
      >
        {settled ? (
          <div className="cb-stack">
            <DetailList
              columns={1}
              items={[
                { label: 'Amount', value: rupeesExact(settled.payment.amountPaise) },
                { label: 'Receipt', value: settled.payment.receiptNumber || '—' },
                { label: 'Invoice', value: settled.invoice.number },
                { label: 'Paid on', value: formatDate(settled.payment.capturedAt || settled.payment.createdAt) },
              ]}
            />
            {account?.billingEmail ? (
              <p className="cb-muted">A copy of the receipt is emailed to {account.billingEmail}.</p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        tone="danger"
        size="sm"
        title={optInTrial ? 'Cancel your free trial?' : 'Cancel your subscription?'}
        description={optInTrial
          ? `Nothing will be charged${entitlement?.autopay ? ' and your autopay is cancelled' : ''}. Every module stays open until ${formatDate(sub?.trialEndsAt)}; after that your data stays safe but can only be read.`
          : `Your modules stay open until ${lastDay(sub?.currentPeriodEnd)}. After that your data stays safe but can only be read.`}
        footer={(
          <>
            <Button variant="tertiary" onClick={() => setConfirmCancel(false)}>{optInTrial ? 'Keep my trial' : 'Keep subscription'}</Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, {
                onSuccess: () => {
                  setConfirmCancel(false)
                  // A trial's confirmation comes from the server's own message.
                  if (!optInTrial) toast.success('Your subscription ends at the end of this period.')
                  refreshEverything()
                },
              })}
            >
              {optInTrial ? 'Cancel trial' : 'Cancel at period end'}
            </Button>
          </>
        )}
      />
    </Page>
  )
}

const StateBanner: React.FC<{
  setupRequired?: boolean
  state: string
  sub: BillingSubscription | null
  due: number
  overdueCount: number
  canManage: boolean
  paying: boolean
  onChoose: () => void
  onPay: () => void
  onResume: () => void
}> = ({ setupRequired, state, sub, due, overdueCount, canManage, paying, onChoose, onPay, onResume }) => {
  if (setupRequired) {
    return (
      <Banner tone="info" title="Choose your plan to start your free trial">
        Every module is open during the trial and nothing is charged today.{' '}
        {canManage ? <Link to="/get-started" className="cb-link">Choose plan</Link> : 'Ask your school administrator to choose it.'}
      </Banner>
    )
  }
  if (sub?.cancelAtPeriodEnd && state === 'trialing') {
    return (
      <Banner tone="warning" title={`Your trial is cancelled. Every module stays open until ${formatDate(sub.trialEndsAt)}`}>
        Nothing will be charged.{' '}
        {canManage ? <button type="button" className="cb-link" onClick={onResume}>Keep my plan</button> : null}
      </Banner>
    )
  }
  if (sub?.cancelAtPeriodEnd && state !== 'canceled') {
    return (
      <Banner tone="warning" title={`Your subscription ends on ${lastDay(sub.currentPeriodEnd || sub.trialEndsAt)}`}>
        {canManage ? <button type="button" className="cb-link" onClick={onResume}>Keep my subscription</button> : 'Ask your school administrator if you want to keep it.'}
      </Banner>
    )
  }
  if (state === 'trialing' && !sub?.items?.length) {
    return (
      <Banner tone="info" title={`Your free trial ends on ${formatDate(sub?.trialEndsAt)}`}>
        Choose the modules you want to keep so your school can carry on without a break.{' '}
        {canManage ? <button type="button" className="cb-link" onClick={onChoose}>Choose modules</button> : null}
      </Banner>
    )
  }
  if (state === 'past_due_grace') {
    return (
      <Banner tone="warning" title={`Payment due. Access becomes read-only on ${formatDate(sub?.graceEndsAt)}`}>
        {due > 0 && canManage ? <button type="button" className="cb-link" disabled={paying} onClick={onPay}>Pay {rupeesExact(due)} now</button> : 'Pay the open invoice to keep full access.'}
      </Banner>
    )
  }
  if (state === 'suspended_read_only') {
    return (
      <Banner tone="danger" title="Your school's access is read-only">
        Your data is safe. {overdueCount ? 'Pay the overdue invoice' : 'Choose your modules and pay'} to restore full access.{' '}
        {canManage && due > 0 ? <button type="button" className="cb-link" disabled={paying} onClick={onPay}>Pay {rupeesExact(due)} now</button> : null}
        {canManage && due === 0 ? <button type="button" className="cb-link" onClick={onChoose}>Choose modules</button> : null}
      </Banner>
    )
  }
  if (state === 'grandfathered') {
    return (
      <Banner tone="info" title={`Complimentary access until ${formatDate(sub?.grandfatherEndsAt)}`}>
        Choose the modules you want to keep before then.{' '}
        {canManage ? <button type="button" className="cb-link" onClick={onChoose}>Choose modules</button> : null}
      </Banner>
    )
  }
  if (state === 'canceled') {
    return (
      <Banner tone="neutral" title="Your subscription has ended">
        Your data can still be read. {canManage ? <button type="button" className="cb-link" onClick={onChoose}>Subscribe again</button> : null}
      </Banner>
    )
  }
  return null
}

/** Placeholder in the shape of the billing page (stats, plan + payment, documents) while it loads. */
const BillingSkeleton: React.FC = () => (
  <div className="cb-stack" role="status" aria-label="Loading billing">
    <div className="cb-stats">
      {[0, 1, 2, 3].map((i) => (
        <StatCard
          key={i}
          label={<Skeleton width={80} height={12} />}
          value={<Skeleton width={110} height={24} />}
          hint={<Skeleton width={130} height={10} />}
        />
      ))}
    </div>

    <div className="cb-grid-8-4">
      <Card title={<Skeleton width={100} height={16} />} subtitle={<Skeleton width={220} height={12} />}>
        <div className="cb-skeleton-stack">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cb-skeleton-row">
              <div className="cb-skeleton-stack">
                <Skeleton width={160} height={14} />
                <Skeleton width={100} height={10} />
              </div>
              <Skeleton width={72} height={20} round />
            </div>
          ))}
        </div>
      </Card>
      <Card title={<Skeleton width={80} height={16} />}>
        <div className="cb-skeleton-stack">
          <Skeleton width={140} height={28} />
          <Skeleton width={90} height={12} />
          <Skeleton height={36} />
        </div>
      </Card>
    </div>

    <Card title={<Skeleton width={170} height={16} />}>
      <div className="cb-skeleton-stack">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cb-skeleton-row">
            <Skeleton width="30%" height={14} />
            <Skeleton width="20%" height={14} />
            <Skeleton width={72} height={20} round />
          </div>
        ))}
      </div>
    </Card>
  </div>
)

const InvoicesTable: React.FC = () => {
  const { data = [], isLoading } = useBillingInvoices()
  return (
    <DataTable
      rows={data}
      loading={isLoading}
      getRowKey={(row) => row.id}
      onRowClick={(row) => openPdf('invoices', row.id, row.number)}
      empty={<EmptyState compact icon={FileText} title="No invoices yet" body="Your first invoice appears when you choose modules." />}
      columns={[
        { key: 'number', header: 'Invoice', mobile: 'title', render: (row) => <Entity primary={row.number} secondary={formatDate(row.issuedAt)} /> },
        { key: 'period', header: 'Period', mobile: 'subtitle', render: (row) => (row.periodStart ? `${formatDate(row.periodStart)} to ${lastDay(row.periodEnd)}` : '—') },
        { key: 'total', header: 'Amount', numeric: true, align: 'right', render: (row) => rupeesExact(row.totalPaise) },
        { key: 'status', header: 'Status', mobile: 'aside', render: invoiceBadge },
      ]}
    />
  )
}

const ReceiptsTable: React.FC = () => {
  const { data = [], isLoading } = useBillingPayments()
  const rows = data.filter((p) => p.receiptNumber)
  return (
    <DataTable
      rows={rows}
      loading={isLoading}
      getRowKey={(row) => row.id}
      onRowClick={(row) => openPdf('receipts', row.id, row.receiptNumber || 'receipt')}
      empty={<EmptyState compact icon={Receipt} title="No payments yet" body="A receipt is issued for every payment." />}
      columns={[
        { key: 'receipt', header: 'Receipt', mobile: 'title', render: (row) => <Entity primary={row.receiptNumber} secondary={formatDate(row.capturedAt || row.createdAt)} /> },
        { key: 'invoice', header: 'For invoice', mobile: 'subtitle', render: (row) => row.invoiceNumber || '—' },
        { key: 'method', header: 'Paid by', mobile: 'hidden', render: (row) => METHOD[row.method] || 'Online' },
        { key: 'amount', header: 'Amount', numeric: true, align: 'right', mobile: 'aside', render: (row) => rupeesExact(row.amountPaise) },
      ]}
    />
  )
}

const CreditNotesTable: React.FC = () => {
  const { data = [], isLoading } = useBillingCreditNotes()
  return (
    <DataTable
      rows={data}
      loading={isLoading}
      getRowKey={(row) => row.id}
      onRowClick={(row) => openPdf('credit-notes', row.id, row.number)}
      empty={<EmptyState compact icon={FileText} title="No credit notes" body="Credit notes appear here if an invoice is reduced or refunded." />}
      columns={[
        { key: 'number', header: 'Credit note', mobile: 'title', render: (row) => <Entity primary={row.number} secondary={formatDate(row.issuedAt)} /> },
        { key: 'reason', header: 'Reason', mobile: 'subtitle', render: (row) => row.reason },
        { key: 'amount', header: 'Amount', numeric: true, align: 'right', mobile: 'aside', render: (row) => rupeesExact(row.totalPaise) },
        { key: 'refund', header: 'Refund', mobile: 'hidden', render: (row) => (row.refundPaise ? <Badge tone={row.refundStatus === 'processed' ? 'success' : row.refundStatus === 'failed' ? 'danger' : 'info'}>{row.refundStatus === 'processed' ? 'Refunded' : row.refundStatus === 'failed' ? 'Refund failed' : 'Refund on its way'}</Badge> : '—') },
      ]}
    />
  )
}

const ChooseModulesSheet: React.FC<{
  sub: BillingSubscription | null
  liveStudents: number | null
  onClose: () => void
  onDone: () => void
}> = ({ sub, liveStudents, onClose, onDone }) => {
  const subscribe = useSubscribe()
  const plan = usePlanSelection(sub, liveStudents)
  const { chosen, selection } = plan
  // During an opt-in trial nothing is invoiced now: the plan only decides what stays after it.
  const optInTrial = sub?.state === 'trialing' && Boolean(sub.trialConsentAt)
  const preview = useBillingPreview(plan.debounced, chosen.size > 0)
  const quoteError = (preview.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  const submit = () => {
    if (!chosen.size || quoteError) return
    subscribe.mutate(selection, {
      onSuccess: async (result) => {
        onClose()
        onDone()
        if (result.authorizeUrl) {
          toast.success('Your plan is updated. Authorise autopay for the new amount.')
          window.location.href = result.authorizeUrl
          return
        }
        if (result.invoice && result.invoice.status === 'open') {
          toast.success(`Invoice ${result.invoice.number} is ready. Opening payment…`)
          try {
            const { paymentLink } = await billingService.payNow(result.invoice.id)
            window.location.href = paymentLink.url
          } catch {
            // The invoice stays on the page with a Pay button.
          }
        } else {
          toast.success(optInTrial ? 'Your plan is updated. Every module stays open until your trial ends.' : 'Your modules are updated.')
        }
      },
    })
  }

  const due = optInTrial ? null : preview.data?.dueNow
  let description = 'You pay for a full period, starting today.'
  if (preview.data?.effective === 'mid_period') description = 'New modules start now and are charged for the rest of this period. Modules you remove stay until the period ends.'
  else if (optInTrial) description = `Every module stays open until your trial ends on ${formatDate(sub?.trialEndsAt)}. Then you keep, and pay for, the modules you choose here.`
  else if (sub?.state === 'trialing') description = 'Your paid period starts when your trial ends, so you lose nothing by choosing now.'

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={optInTrial ? 'Change your plan' : sub?.items?.length ? 'Change modules' : 'Choose your modules'}
      description={description}
      onSubmit={(event) => { event.preventDefault(); submit() }}
      footer={(
        <>
          <Button variant="tertiary" onClick={onClose}>Keep as is</Button>
          <Button variant="primary" type="submit" loading={subscribe.isPending} disabled={!chosen.size || Boolean(quoteError) || preview.isFetching}>
            {due ? `Continue to pay ${rupeesExact(due.totalPaise)}` : optInTrial ? 'Save plan' : 'Save modules'}
          </Button>
        </>
      )}
    >
      <PlanFields plan={plan} />
      {quoteError ? <Banner tone="warning" title={quoteError} /> : null}
      {preview.data && !quoteError ? <QuoteBox quote={preview.data} afterTrial={optInTrial} /> : null}
    </Sheet>
  )
}

const QuoteBox: React.FC<{ quote: Quote; afterTrial?: boolean }> = ({ quote, afterTrial = false }) => {
  const totals = quote.dueNow
  return (
    <div className="cb-form-section bl-quote">
      <h3 className="cb-form-section__title">Price</h3>
      {totals ? (
        <>
          <dl className="bl-totals">
            <div><dt>Modules for {quote.students.toLocaleString('en-IN')} students</dt><dd>{rupeesExact(totals.subtotalPaise)}</dd></div>
            {totals.discountPaise ? <div><dt>Discount</dt><dd>−{rupeesExact(totals.discountPaise)}</dd></div> : null}
            {totals.igstPaise
              ? <div><dt>IGST 18%</dt><dd>{rupeesExact(totals.igstPaise)}</dd></div>
              : <div><dt>CGST 9% + SGST 9%</dt><dd>{rupeesExact(totals.cgstPaise + totals.sgstPaise)}</dd></div>}
            <div className="is-total"><dt>{afterTrial ? `When your trial ends, ${formatDate(totals.dueAt)}` : `Due ${formatDate(totals.dueAt)}`}</dt><dd>{rupeesExact(totals.totalPaise)}</dd></div>
          </dl>
          {totals.reason === 'change' ? <p className="cb-subtle">For the rest of your current period.</p> : (
            <p className="cb-subtle">Covers {formatDate(totals.periodStart)} to {lastDay(totals.periodEnd)}.</p>
          )}
        </>
      ) : <p className="cb-muted">Nothing to pay now.</p>}
      {quote.perPeriod ? <p className="cb-subtle">After that, {rupeesExact(quote.perPeriod.totalPaise)} a {quote.interval} including GST, at the prices then.</p> : null}
    </div>
  )
}

const ProfileSheet: React.FC<{ account: BillingAccount; onClose: () => void }> = ({ account, onClose }) => {
  const save = useUpdateBillingProfile()
  const [form, setForm] = useState({
    legalName: account.legalName || account.tenantName,
    gstin: account.gstin || '',
    billingEmail: account.billingEmail || '',
    addressLine1: account.addressLine1 || '',
    addressLine2: account.addressLine2 || '',
    city: account.city || '',
    postalCode: account.postalCode || '',
    stateCode: account.stateCode || '',
  })
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: key === 'gstin' ? event.target.value.toUpperCase().trim() : event.target.value }))

  const gstinError = form.gstin && !GSTIN_PATTERN.test(form.gstin) ? 'A GSTIN has 15 characters, like 07AAACC1234D1Z5' : undefined
  const pinError = form.postalCode && !/^[0-9]{6}$/.test(form.postalCode) ? 'PIN code must be 6 digits' : undefined
  const emailError = form.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.billingEmail) ? 'Enter an email like accounts@school.in' : undefined
  // A GSTIN fixes the state.
  const gstinState = form.gstin && !gstinError ? form.gstin.slice(0, 2) : null

  const submit = () => {
    if (gstinError || pinError || emailError || !form.billingEmail) return
    save.mutate(
      { ...form, gstin: form.gstin || null, stateCode: gstinState || form.stateCode || null },
      { onSuccess: () => { toast.success('Billing profile saved'); onClose() } },
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Billing profile"
      description="Changes apply to invoices issued from now on."
      onSubmit={(event) => { event.preventDefault(); submit() }}
      footer={(
        <>
          <Button variant="tertiary" onClick={onClose}>Keep as is</Button>
          <Button variant="primary" type="submit" loading={save.isPending}>Save billing profile</Button>
        </>
      )}
    >
      <div className="cb-form-grid">
        <TextField className="is-wide" label="Legal name" value={form.legalName} onChange={set('legalName')} required hint="As registered for GST, if you are registered" />
        <TextField label="GSTIN" value={form.gstin} onChange={set('gstin')} error={gstinError} placeholder="Leave empty if not registered" />
        <TextField label="Billing email" type="email" value={form.billingEmail} onChange={set('billingEmail')} error={emailError} required />
        <TextField className="is-wide" label="Address" value={form.addressLine1} onChange={set('addressLine1')} />
        <TextField className="is-wide" label="Address line 2" value={form.addressLine2} onChange={set('addressLine2')} />
        <TextField label="City" value={form.city} onChange={set('city')} />
        <TextField label="PIN code" inputMode="numeric" value={form.postalCode} onChange={set('postalCode')} error={pinError} />
        <Select
          className="is-wide"
          label="State"
          value={gstinState || form.stateCode}
          onChange={set('stateCode')}
          disabled={Boolean(gstinState)}
          hint={gstinState ? 'Taken from your GSTIN' : 'Decides whether CGST and SGST or IGST is charged'}
          placeholder="Choose a state"
          options={GST_STATES}
        />
      </div>
    </Sheet>
  )
}

export default Billing
