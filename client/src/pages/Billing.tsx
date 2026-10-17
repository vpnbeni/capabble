import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CreditCard, FileText, Receipt } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  Checkbox,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Entity,
  Figure,
  Menu,
  Page,
  RadioGroup,
  Select,
  Sheet,
  StatCard,
  Tabs,
  TextField,
  formatDate,
  formatINR,
} from '@/components/ui'
import type { Tone } from '@/components/ui'
import { usePermissions } from '@/hooks/usePermissions'
import {
  billingKeys,
  useBillingCatalog,
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
  type BillingInterval,
  type BillingInvoice,
  type BillingSubscription,
  type Quote,
  type Selection,
} from '@/services/billingService'
import { getCurrentUser } from '@/redux/slices/authSlice'
import type { AppDispatch } from '@/redux/store'
import '@/components/billing/billing.css'

/** Paise → "₹60,445.50" (whole rupees print without paise). */
const rupees = (paise: number | null | undefined) =>
  paise == null ? '—' : formatINR(paise / 100, { decimals: paise % 100 ? 2 : 0 })
const rupeesExact = (paise: number | null | undefined) => (paise == null ? '—' : formatINR(paise / 100, { decimals: 2 }))

/** A period [start, end) ends the day before `end`. */
const lastDay = (end: string | null | undefined) => (end ? formatDate(new Date(new Date(end).getTime() - 1)) : '—')

const STATE: Record<string, { label: string; tone: Tone }> = {
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
  const cancel = useCancelSubscription()
  const resume = useResumeSubscription()

  const refreshEverything = () => {
    queryClient.invalidateQueries({ queryKey: billingKeys.all })
    dispatch(getCurrentUser())
  }

  // Back from Razorpay: record the payment straight away, even before its webhook arrives.
  useEffect(() => {
    if (params.get('paid') !== '1') return
    billingService.reconcile()
      .then((result) => {
        if (result.recorded.length) toast.success('Payment received. Thank you.')
        else toast('We will update this page as soon as Razorpay confirms the payment.')
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
        <Card><p className="cb-muted">Loading billing…</p></Card>
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
          onResume={() => resume.mutate(undefined, { onSuccess: () => { toast.success('Your subscription will continue.'); refreshEverything() } })}
        />

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
                {canManage ? (
                  <Button size="sm" variant="secondary" onClick={() => setChoosing(true)}>
                    {items.length ? 'Change modules' : 'Choose modules'}
                  </Button>
                ) : null}
                {canManage && sub && sub.state !== 'canceled' && !sub.cancelAtPeriodEnd && items.length ? (
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
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        tone="danger"
        size="sm"
        title="Cancel your subscription?"
        description={`Your modules stay open until ${lastDay(sub?.currentPeriodEnd)}. After that your data stays safe but can only be read.`}
        footer={(
          <>
            <Button variant="tertiary" onClick={() => setConfirmCancel(false)}>Keep subscription</Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => cancel.mutate(undefined, {
                onSuccess: () => {
                  setConfirmCancel(false)
                  toast.success('Your subscription ends at the end of this period.')
                  refreshEverything()
                },
              })}
            >
              Cancel at period end
            </Button>
          </>
        )}
      />
    </Page>
  )
}

const StateBanner: React.FC<{
  state: string
  sub: BillingSubscription | null
  due: number
  overdueCount: number
  canManage: boolean
  paying: boolean
  onChoose: () => void
  onPay: () => void
  onResume: () => void
}> = ({ state, sub, due, overdueCount, canManage, paying, onChoose, onPay, onResume }) => {
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
  const catalog = useBillingCatalog()
  const subscribe = useSubscribe()
  const [interval, setBillingInterval] = useState<BillingInterval>(sub?.interval || 'year')
  const [modules, setModules] = useState<string[]>(() => (sub?.items || []).filter((i) => !i.endsAtPeriodEnd).map((i) => i.moduleCode))
  const [bundleCode, setBundleCode] = useState(sub?.bundleCode || '')
  const [students, setStudents] = useState(String(sub?.declaredStudents || liveStudents || ''))
  const [coupon, setCoupon] = useState(sub?.couponCode || '')
  const bundle = catalog.data?.bundles.find((b) => b.code === bundleCode) || null
  const chosen = new Set([...modules, ...(bundle?.moduleCodes || [])])

  const selection: Selection = useMemo(() => ({
    modules,
    interval,
    bundleCode: bundleCode || null,
    couponCode: coupon.trim() || null,
    ...(/^\d+$/.test(students) ? { declaredStudents: Number(students) } : {}),
  }), [modules, interval, bundleCode, coupon, students])

  const [debounced, setDebounced] = useState(selection)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(selection), 300)
    return () => window.clearTimeout(timer)
  }, [selection])
  const preview = useBillingPreview(debounced, chosen.size > 0)
  const quoteError = (preview.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  const priced = (catalog.data?.modules || []).filter((m) => m.prices[interval])
  const priceText = (code: string) => {
    const price = catalog.data?.modules.find((m) => m.code === code)?.prices[interval]
    if (!price) return ''
    const per = price.perStudentPaise ? `, then ${rupees(price.perStudentPaise)} a student` : ''
    return `${rupees(price.basePaise)} a ${interval} for up to ${price.includedStudents} students${per}`
  }

  const submit = () => {
    if (!chosen.size || quoteError) return
    subscribe.mutate(selection, {
      onSuccess: async (result) => {
        onClose()
        onDone()
        if (result.invoice && result.invoice.status === 'open') {
          toast.success(`Invoice ${result.invoice.number} is ready. Opening payment…`)
          try {
            const { paymentLink } = await billingService.payNow(result.invoice.id)
            window.location.href = paymentLink.url
          } catch {
            // The invoice stays on the page with a Pay button.
          }
        } else {
          toast.success('Your modules are updated.')
        }
      },
    })
  }

  const due = preview.data?.dueNow
  const studentHint = liveStudents != null
    ? `${liveStudents.toLocaleString('en-IN')} students are active in Students. We bill whichever is higher.`
    : 'Your total number of students. Each module covers a number of students; extra students are charged per student.'

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={sub?.items?.length ? 'Change modules' : 'Choose your modules'}
      description={preview.data?.effective === 'mid_period'
        ? 'New modules start now and are charged for the rest of this period. Modules you remove stay until the period ends.'
        : sub?.state === 'trialing' ? 'Your paid period starts when your trial ends, so you lose nothing by choosing now.' : 'You pay for a full period, starting today.'}
      onSubmit={(event) => { event.preventDefault(); submit() }}
      footer={(
        <>
          <Button variant="tertiary" onClick={onClose}>Keep as is</Button>
          <Button variant="primary" type="submit" loading={subscribe.isPending} disabled={!chosen.size || Boolean(quoteError) || preview.isFetching}>
            {due ? `Continue to pay ${rupeesExact(due.totalPaise)}` : 'Save modules'}
          </Button>
        </>
      )}
    >
      <div className="cb-form-section">
        <RadioGroup
          label="Pay"
          orientation="horizontal"
          value={interval}
          onChange={(value) => setBillingInterval(value as BillingInterval)}
          options={[{ value: 'year', label: 'Yearly' }, { value: 'month', label: 'Monthly' }]}
        />
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Modules</h3>
        {catalog.isLoading ? <p className="cb-muted">Loading prices…</p> : (
          <div className="cb-check-grid">
            {priced.map((m) => {
              const inBundle = Boolean(bundle?.moduleCodes.includes(m.code))
              return (
                <Checkbox
                  key={m.code}
                  label={m.name}
                  description={inBundle ? `In ${bundle?.name} · ${priceText(m.code)}` : priceText(m.code)}
                  checked={chosen.has(m.code)}
                  disabled={inBundle}
                  onChange={(on) => setModules((prev) => (on ? [...prev, m.code] : prev.filter((c) => c !== m.code)))}
                />
              )
            })}
          </div>
        )}
      </div>
      <div className="cb-form-section">
        <div className="cb-form-grid">
          {catalog.data?.bundles.length ? (
            <Select
              label="Bundle"
              value={bundleCode}
              onChange={(event) => setBundleCode(event.target.value)}
              options={[{ value: '', label: 'No bundle' }, ...catalog.data.bundles.map((b) => ({ value: b.code, label: `${b.name}, ${b.discountBps / 100}% off` }))]}
            />
          ) : null}
          <TextField
            label="Number of students"
            inputMode="numeric"
            value={students}
            onChange={(event) => setStudents(event.target.value.replace(/\D/g, ''))}
            hint={studentHint}
          />
          <TextField label="Coupon code" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="Optional" />
        </div>
      </div>
      {quoteError ? <Banner tone="warning" title={quoteError} /> : null}
      {preview.data && !quoteError ? <QuoteBox quote={preview.data} /> : null}
    </Sheet>
  )
}

const QuoteBox: React.FC<{ quote: Quote }> = ({ quote }) => {
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
            <div className="is-total"><dt>Due {formatDate(totals.dueAt)}</dt><dd>{rupeesExact(totals.totalPaise)}</dd></div>
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

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

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
