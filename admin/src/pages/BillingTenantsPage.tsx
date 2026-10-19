import { useCallback, useEffect, useMemo, useState } from 'react'
import { billingApi, errorMessage } from '../services/billingApi'
import type {
  AdminCatalog,
  AuditEntry,
  BillingInterval,
  BillingInvoice,
  BillingSubscription,
  BillingTenantDetails,
  BillingTenantListItem,
  Quote,
  Selection,
} from '../types/billing'
import { DataTable } from '../components/DataTable'
import { Dialog, Sheet } from '../components/Dialog'
import { StatusBadge } from '../components/StatusBadge'
import { Banner, Checkbox, DetailList, MetricTile, RadioGroup, Select, Tabs, TextField } from '../components/kit'
import { ChevronLeft, ChevronRight, FileText, Search } from '../components/icons'
import { formatDate, formatINR, formatPeriodEnd, paiseToRupeesInput, rupeesToPaise } from '../utils/money'
import { MODULE_REGISTRY } from '@capabble/modules'
import './billing.css'

const MODULE_NAMES = new Map(MODULE_REGISTRY.map((m) => [m.id as string, m.title]))
const moduleName = (code: string) => (code === 'core' ? 'Core' : MODULE_NAMES.get(code) || code)

const STATE_WORDS: Record<string, string> = {
  incomplete: 'Opted in',
  trialing: 'Trial ends',
  active: 'Renews',
  past_due_grace: 'Read-only from',
  grandfathered: 'Complimentary until',
  suspended_read_only: 'Read-only since',
  canceled: 'Cancelled',
}

const MANDATE_WORDS: Record<string, string> = {
  card: 'card', upi: 'UPI AutoPay', emandate: 'bank mandate', nach: 'bank mandate',
}

/** No live plan: never opted in, or an autopay checkout that lapsed. The school sees the plan picker. */
const hasNoPlan = (sub: BillingSubscription | null) => !sub
  || (sub.state === 'canceled' && Boolean(sub.trialConsentAt) && !sub.trialStartedAt && !sub.currentPeriodEnd)

function PlanStatus({ sub, state, size }: { sub: BillingSubscription | null; state?: string; size?: 'sm' | 'md' }) {
  if (hasNoPlan(sub) || !state) return <StatusBadge status="none" size={size} label="Plan not chosen" />
  return <StatusBadge status={state} size={size} />
}

const collectionWords = (sub: BillingSubscription | null) => {
  if (!sub) return null
  if (sub.collectionMode === 'auto_debit') {
    const method = sub.autopayMethod ? MANDATE_WORDS[sub.autopayMethod] || sub.autopayMethod : 'autopay'
    return `Autopay by ${method}${sub.autopayAmountPaise ? `, ${formatINR(sub.autopayAmountPaise)}` : ''}`
  }
  if (sub.state === 'incomplete') return 'Waiting for the school to authorise autopay'
  if (sub.collectionMode === 'manual_link') return 'Pay-now link'
  if (sub.collectionMode === 'hybrid_auto_manual') return 'Auto-debit, link as fallback'
  return sub.collectionMode
}

const isOverdue = (invoice: BillingInvoice) => invoice.status === 'open' && new Date(invoice.dueAt) < new Date()

function InvoiceStatus({ invoice }: { invoice: BillingInvoice }) {
  if (isOverdue(invoice)) return <StatusBadge status="overdue" size="sm" />
  if (invoice.status === 'open' && invoice.amountPaidPaise > 0) return <StatusBadge status="partial_failure" size="sm" label="Part paid" />
  return <StatusBadge status={invoice.status} size="sm" />
}

const METHOD_WORDS: Record<string, string> = {
  upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Wallet', emi: 'EMI',
  offline_bank: 'Bank transfer', offline_cheque: 'Cheque', offline_cash: 'Cash', unknown: 'Online',
}

const ACTION_WORDS: Record<string, string> = {
  'account.created': 'Billing account created',
  'account.updated': 'School details updated',
  'account.profile_updated': 'Billing profile changed',
  'subscription.trial_started': 'Trial started',
  'subscription.trial_checkout_started': 'Plan chosen, waiting for autopay',
  'subscription.autodebit_created': 'Autopay link created',
  'subscription.autodebit_authorised': 'Autopay authorised',
  'subscription.autodebit_cancelled': 'Autopay cancelled',
  'subscription.autodebit_halted': 'Autopay stopped by the bank',
  'subscription.autodebit_amount_mismatch': 'Autopay amount differs from the invoice',
  'subscription.grandfathered': 'Complimentary access granted',
  'subscription.changed': 'Modules or terms changed',
  'subscription.state_changed': 'Status changed',
  'subscription.extended': 'Extension granted',
  'subscription.students_declared': 'Student count changed',
  'subscription.cancel_scheduled': 'Cancellation scheduled',
  'subscription.cancel_withdrawn': 'Cancellation withdrawn',
  'subscription.canceled': 'Subscription cancelled',
  'invoice.issued': 'Invoice issued',
  'invoice.paid': 'Invoice paid',
  'invoice.voided': 'Invoice voided',
  'invoice.payment_link_created': 'Payment link sent',
  'payment.recorded': 'Payment recorded',
  'payment.failed': 'Payment failed',
  'credit_note.issued': 'Credit note issued',
  'credit_note.refund_sent': 'Refund sent to Razorpay',
  'credit_note.refund_processed': 'Refund completed',
  'credit_note.refund_failed': 'Refund failed',
}

const ACTOR_WORDS: Record<string, string> = {
  platform_admin: 'Platform admin',
  school_user: 'School staff',
  system: 'Billing',
  provider: 'Razorpay',
}

export function BillingTenantsPage() {
  const [selected, setSelected] = useState<string | null>(null)
  return selected
    ? <TenantDetail tenantKey={selected} onBack={() => setSelected(null)} />
    : <TenantList onOpen={setSelected} />
}

/* ------------------------------------------------------------------ list */

function TenantList({ onOpen }: { onOpen: (id: string) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<BillingTenantListItem[]>([])
  const [meta, setMeta] = useState({ total: 0, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      billingApi.listTenants(search, page)
        .then((res) => {
          setRows(res.data.items)
          setMeta({ total: res.data.total, pages: res.data.pages })
          setError('')
        })
        .catch((err) => setError(errorMessage(err, "Couldn't load schools.")))
        .finally(() => setLoading(false))
    }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [search, page])

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Subscriptions</h1>
        <p className="page-subtitle">Each school's subscription, invoices and payments.</p>
      </header>

      <section className="card admin-list-card">
        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              type="search"
              aria-label="Find a school"
              placeholder="Find a school by name or code"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            />
          </div>
          <span className="admin-count">{loading ? 'Loading…' : `${meta.total} ${meta.total === 1 ? 'school' : 'schools'}`}</span>
        </div>
        {error ? <div className="error-text" role="alert">{error}</div> : null}
        <DataTable
          data={rows}
          rowKey={(row) => row.account.id}
          onRowClick={(row) => onOpen(row.account.id)}
          emptyMessage={search ? `No school matches "${search}".` : 'No school has a billing account yet. Schools get one when they sign up.'}
          columns={[
            {
              header: 'School',
              accessor: (row) => (
                <span className="cb-entity">
                  <span className="cb-entity__primary">{row.account.tenantName}</span>
                  <span className="cb-entity__secondary">{row.account.tenantSlug}</span>
                </span>
              ),
            },
            { header: 'Billing email', accessor: (row) => row.account.billingEmail || '—' },
            {
              header: 'Next date',
              accessor: (row) => {
                if (!row.entitlement || hasNoPlan(row.subscription)) return '—'
                const date = row.entitlement.nextDeadline
                return date ? `${STATE_WORDS[row.entitlement.state] || ''} ${formatDate(date)}`.trim() : '—'
              },
            },
            {
              header: 'Status',
              accessor: (row) => <PlanStatus sub={row.subscription} state={row.entitlement?.state} size="sm" />,
            },
          ]}
        />
        {meta.pages > 1 ? (
          <div className="cb-table-foot">
            <span>Page {page} of {meta.pages}</span>
            <div className="admin-table__pager">
              <button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></button>
              <button type="button" className="icon-button" aria-label="Next page" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}><ChevronRight /></button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- detail */

type DialogKind = null | 'plan' | 'extend' | 'students' | 'cancel' | 'trial'
type InvoiceAction = null | { kind: 'pay' | 'credit' | 'void'; invoice: BillingInvoice }

function TenantDetail({ tenantKey, onBack }: { tenantKey: string; onBack: () => void }) {
  const [details, setDetails] = useState<BillingTenantDetails | null>(null)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState('invoices')
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [invoiceAction, setInvoiceAction] = useState<InvoiceAction>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await billingApi.getTenant(tenantKey)
      setDetails(res.data)
      setError('')
      billingApi.audit(res.data.account.id).then((a) => setAudit(a.data)).catch(() => setAudit([]))
    } catch (err) {
      setError(errorMessage(err, "Couldn't load this school's billing."))
    } finally {
      setLoading(false)
    }
  }, [tenantKey])

  useEffect(() => { load() }, [load])

  const done = (message: string) => {
    setDialog(null)
    setInvoiceAction(null)
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
    load()
  }

  const openPdf = (path: string, name: string) => billingApi.openPdf(path, `${name}.pdf`).catch((err) => setError(errorMessage(err, "Couldn't open the PDF.")))

  if (!details) {
    return (
      <div className="grid" style={{ gap: 24 }}>
        <BackLink onBack={onBack} />
        <section className="card">
          {error ? <div className="error-text" role="alert">{error}</div> : <p className="cb-muted">{loading ? 'Loading…' : 'Not found.'}</p>}
        </section>
      </div>
    )
  }

  const { account, subscription: sub, entitlement } = details
  const items = sub?.items || []
  const due = details.openInvoices.reduce((sum, inv) => sum + inv.outstandingPaise, 0)
  const overdue = details.openInvoices.filter(isOverdue)
  const deadline = entitlement?.state ? STATE_WORDS[entitlement.state] : ''
  const deadlineDate = sub?.nextDeadline || null
  const noPlan = hasNoPlan(sub)
  const live = sub && !noPlan && sub.state !== 'canceled'

  const sendInvite = async () => {
    try {
      const res = await billingApi.sendTrialInvite(account.id)
      done(res.message || 'Trial invite sent')
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the invite."))
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <BackLink onBack={onBack} />
      <header className="page-head-row">
        <div>
          <h1 className="section-title">{account.tenantName}</h1>
          <p className="page-subtitle">{account.legalName && account.legalName !== account.tenantName ? `${account.legalName} · ` : ''}{account.tenantSlug}</p>
        </div>
        <div className="bl-actions">
          {live ? (
            <button type="button" className="ghost" onClick={() => setDialog('cancel')}>Cancel subscription</button>
          ) : null}
          {live && sub.state !== 'incomplete' ? (
            <button type="button" className="secondary" onClick={() => setDialog('extend')}>Grant extension</button>
          ) : null}
          {noPlan || sub?.state === 'incomplete' ? (
            <>
              <button type="button" className="secondary" onClick={sendInvite} disabled={!account.billingEmail}>Send trial invite</button>
              {noPlan ? <button type="button" className="secondary" onClick={() => setDialog('trial')}>Start trial without autopay</button> : null}
            </>
          ) : null}
          <button type="button" className="primary" onClick={() => setDialog('plan')}>Change modules</button>
        </div>
      </header>

      {notice ? <Banner tone="success" title={notice} onDismiss={() => setNotice('')} /> : null}
      {error ? <Banner tone="danger" title={error} onDismiss={() => setError('')} /> : null}
      {overdue.length ? (
        <Banner tone="danger" title={`${formatINR(overdue.reduce((s, i) => s + i.outstandingPaise, 0))} overdue`}>
          {overdue.map((i) => i.number).join(', ')} {overdue.length === 1 ? 'was' : 'were'} due on {formatDate(overdue[0].dueAt)}.
        </Banner>
      ) : null}
      {sub?.cancelAtPeriodEnd ? (
        <Banner tone="warning" title="Cancellation scheduled">The subscription ends on {formatDate(sub.currentPeriodEnd || sub.trialEndsAt)}.</Banner>
      ) : null}

      <section className="card">
        <div className="bl-card-head">
          <h2 className="card-title">Subscription</h2>
          <PlanStatus sub={sub} state={entitlement?.state || undefined} />
        </div>
        <div className="cb-metrics bl-metrics">
          <MetricTile label={deadline || 'Next date'} value={deadlineDate ? formatDate(deadlineDate) : '—'} />
          <MetricTile label="Due now" value={formatINR(due)} tone={overdue.length ? 'danger' : due ? 'info' : 'neutral'} />
          <MetricTile
            label="Next renewal"
            value={details.upcomingRenewal ? formatINR(details.upcomingRenewal.totalPaise) : '—'}
            hint={details.upcomingRenewal ? `on ${formatDate(details.upcomingRenewal.dueAt)}` : undefined}
          />
          <MetricTile label="Students billed" value={sub ? String(sub.billedStudents || sub.declaredStudents || 0) : '—'} hint={sub ? `${sub.declaredStudents} declared` : undefined} />
        </div>
        <DetailList
          columns={3}
          items={[
            { label: 'Billing', value: sub ? (sub.interval === 'year' ? 'Yearly' : 'Monthly') : null },
            { label: 'Current period', value: sub?.currentPeriodStart ? `${formatDate(sub.currentPeriodStart)} – ${formatPeriodEnd(sub.currentPeriodEnd)}` : null },
            { label: 'Access', value: entitlement?.accessMode === 'read_only' ? 'Read-only' : entitlement?.accessMode === 'setup_required' ? 'Plan picker until the school opts in' : 'Full' },
            { label: 'Bundle', value: sub?.bundleCode },
            { label: 'Coupon', value: sub?.couponCode },
            { label: 'Collection', value: collectionWords(sub) },
            { label: 'Opted in', value: sub?.trialConsentAt ? formatDate(sub.trialConsentAt) : null },
            { label: 'Billing email', value: account.billingEmail },
            { label: 'GSTIN', value: account.gstin || 'Unregistered' },
            { label: 'Place of supply', value: account.stateCode },
          ]}
        />
      </section>

      <section className="card admin-list-card">
        <div className="bl-card-head">
          <h2 className="card-title">Modules</h2>
          <span className="admin-count">
            {entitlement?.entitledModules?.includes('*') ? 'Every module during the trial or complimentary period' : `${items.length} paid`}
          </span>
        </div>
        <DataTable
          data={items}
          rowKey={(row) => row.id}
          emptyMessage={sub?.state === 'trialing' ? 'No modules chosen yet. The school has every module during the trial.' : 'No paid modules. Use Change modules to add some.'}
          columns={[
            { header: 'Module', accessor: (row) => row.name || moduleName(row.moduleCode) },
            { header: 'Since', accessor: (row) => formatDate(row.startedAt) },
            {
              header: 'Status',
              accessor: (row) => (row.endsAtPeriodEnd
                ? <StatusBadge status="past_due_grace" size="sm" label={`Ends ${formatPeriodEnd(sub?.currentPeriodEnd)}`} />
                : <StatusBadge status="active" size="sm" />),
            },
          ]}
        />
      </section>

      <section className="card admin-list-card">
        <Tabs
          label="Billing records"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'invoices', label: 'Invoices', count: details.invoices.length },
            { id: 'payments', label: 'Payments', count: details.payments.length },
            { id: 'credits', label: 'Credit notes', count: details.creditNotes.length },
            { id: 'activity', label: 'Activity' },
          ]}
        />
        {tab === 'invoices' ? (
          <DataTable
            data={details.invoices}
            rowKey={(row) => row.id}
            emptyMessage="No invoices yet."
            columns={[
              { header: 'Invoice', accessor: (row) => <span className="cb-entity"><span className="cb-entity__primary">{row.number}</span><span className="cb-entity__secondary">{formatDate(row.issuedAt)}</span></span> },
              { header: 'Period', accessor: (row) => (row.periodStart ? `${formatDate(row.periodStart)} – ${formatPeriodEnd(row.periodEnd)}` : '—') },
              { header: 'Total', className: 'bl-num', accessor: (row) => formatINR(row.totalPaise, { paiseAlways: true }) },
              { header: 'Due', className: 'bl-num', accessor: (row) => (row.status === 'open' ? formatINR(row.outstandingPaise, { paiseAlways: true }) : '—') },
              { header: 'Status', accessor: (row) => <InvoiceStatus invoice={row} /> },
              {
                header: '',
                accessor: (row) => (
                  <span className="bl-row-actions">
                    <button type="button" className="ghost" onClick={() => openPdf(billingApi.invoicePdfPath(account.id, row.id), row.number)}><FileText size={16} /> PDF</button>
                    {row.status === 'open' && row.outstandingPaise > 0 ? (
                      <button type="button" className="secondary" onClick={() => setInvoiceAction({ kind: 'pay', invoice: row })}>Record payment</button>
                    ) : null}
                    {row.status !== 'void' && row.amountCreditedPaise < row.totalPaise ? (
                      <button type="button" className="ghost" onClick={() => setInvoiceAction({ kind: 'credit', invoice: row })}>Credit note</button>
                    ) : null}
                    {row.status === 'open' && row.amountPaidPaise === 0 ? (
                      <button type="button" className="ghost" onClick={() => setInvoiceAction({ kind: 'void', invoice: row })}>Void</button>
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        ) : null}
        {tab === 'payments' ? (
          <DataTable
            data={details.payments}
            rowKey={(row) => row.id}
            emptyMessage="No payments yet."
            columns={[
              { header: 'Receipt', accessor: (row) => <span className="cb-entity"><span className="cb-entity__primary">{row.receiptNumber || '—'}</span><span className="cb-entity__secondary">{formatDate(row.capturedAt || row.createdAt)}</span></span> },
              { header: 'Invoice', accessor: (row) => row.invoiceNumber || '—' },
              { header: 'Method', accessor: (row) => `${METHOD_WORDS[row.method] || row.method}${row.reference ? ` · ${row.reference}` : ''}` },
              { header: 'Amount', className: 'bl-num', accessor: (row) => formatINR(row.amountPaise, { paiseAlways: true }) },
              { header: 'Status', accessor: (row) => <StatusBadge status={row.status} size="sm" label={row.status === 'failed' ? `Failed${row.failureReason ? `: ${row.failureReason}` : ''}` : undefined} /> },
              {
                header: '',
                accessor: (row) => (row.receiptNumber ? (
                  <button type="button" className="ghost" onClick={() => openPdf(billingApi.receiptPdfPath(account.id, row.id), row.receiptNumber || 'receipt')}><FileText size={16} /> Receipt</button>
                ) : null),
              },
            ]}
          />
        ) : null}
        {tab === 'credits' ? (
          <DataTable
            data={details.creditNotes}
            rowKey={(row) => row.id}
            emptyMessage="No credit notes."
            columns={[
              { header: 'Credit note', accessor: (row) => <span className="cb-entity"><span className="cb-entity__primary">{row.number}</span><span className="cb-entity__secondary">{formatDate(row.issuedAt)}</span></span> },
              { header: 'Reason', accessor: (row) => row.reason },
              { header: 'Amount', className: 'bl-num', accessor: (row) => formatINR(row.totalPaise, { paiseAlways: true }) },
              { header: 'Refund', accessor: (row) => (row.refundPaise ? <StatusBadge status={row.refundStatus} size="sm" label={`${formatINR(row.refundPaise)} ${row.refundStatus === 'processed' ? 'refunded' : row.refundStatus}`} /> : 'No refund') },
              { header: '', accessor: (row) => <button type="button" className="ghost" onClick={() => openPdf(billingApi.creditNotePdfPath(account.id, row.id), row.number)}><FileText size={16} /> PDF</button> },
            ]}
          />
        ) : null}
        {tab === 'activity' ? (
          <DataTable
            data={audit}
            rowKey={(row) => String(row.id)}
            emptyMessage="No activity recorded."
            pageSize={25}
            columns={[
              { header: 'When', accessor: (row) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(row.occurredAt)) },
              { header: 'What', accessor: (row) => ACTION_WORDS[row.action] || row.action },
              { header: 'Who', accessor: (row) => ACTOR_WORDS[row.actorType] || row.actorType },
            ]}
          />
        ) : null}
      </section>

      {dialog === 'plan' ? (
        <ChangePlanSheet details={details} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      <ExtendDialog open={dialog === 'extend'} tenantId={account.id} onClose={() => setDialog(null)} onDone={done} />
      <AdminTrialDialog open={dialog === 'trial'} tenantId={account.id} onClose={() => setDialog(null)} onDone={done} />
      <CancelDialog open={dialog === 'cancel'} tenantId={account.id} onClose={() => setDialog(null)} onDone={done} />
      {invoiceAction?.kind === 'pay' ? <PaymentDialog tenantId={account.id} invoice={invoiceAction.invoice} onClose={() => setInvoiceAction(null)} onDone={done} /> : null}
      {invoiceAction?.kind === 'credit' ? <CreditNoteDialog tenantId={account.id} invoice={invoiceAction.invoice} onClose={() => setInvoiceAction(null)} onDone={done} /> : null}
      {invoiceAction?.kind === 'void' ? <VoidDialog tenantId={account.id} invoice={invoiceAction.invoice} onClose={() => setInvoiceAction(null)} onDone={done} /> : null}
    </div>
  )
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="ghost bl-back" onClick={onBack}>
      <ChevronLeft size={16} /> All subscriptions
    </button>
  )
}

/* ------------------------------------------------------------- dialogs */

type DoneFn = (message: string) => void

function ChangePlanSheet({ details, onClose, onDone }: { details: BillingTenantDetails; onClose: () => void; onDone: DoneFn }) {
  const sub = details.subscription
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [interval, setBillingInterval] = useState<BillingInterval>(sub?.interval || 'year')
  const [modules, setModules] = useState<string[]>(() => (sub?.items || []).filter((i) => !i.endsAtPeriodEnd).map((i) => i.moduleCode))
  const [bundleCode, setBundleCode] = useState(sub?.bundleCode || '')
  const [students, setStudents] = useState(String(sub?.declaredStudents || ''))
  const [couponCode, setCouponCode] = useState(sub?.couponCode || '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    billingApi.catalog().then((res) => setCatalog(res.data)).catch((err) => setError(errorMessage(err, "Couldn't load prices.")))
  }, [])

  const bundle = catalog?.bundles.find((b) => b.code === bundleCode) || null
  const selection: Selection = useMemo(() => ({
    modules,
    interval,
    bundleCode: bundleCode || null,
    couponCode: couponCode.trim() || null,
    ...(students !== '' && /^\d+$/.test(students) ? { declaredStudents: Number(students) } : {}),
  }), [modules, interval, bundleCode, couponCode, students])

  const chosen = new Set([...modules, ...(bundle?.moduleCodes || [])])

  useEffect(() => {
    if (!chosen.size) {
      setQuote(null)
      setQuoteError('')
      return undefined
    }
    const timer = window.setTimeout(() => {
      billingApi.previewPlan(details.account.id, selection)
        .then((res) => { setQuote(res.data); setQuoteError('') })
        .catch((err) => { setQuote(null); setQuoteError(errorMessage(err, "Couldn't price this selection.")) })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, details.account.id])

  const toggle = (code: string, on: boolean) => setModules((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.changePlan(details.account.id, selection)
      onDone(res.message || 'Plan updated')
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the plan."))
    } finally {
      setSaving(false)
    }
  }

  const sellable = (catalog?.modules || []).filter((m) => !m.isCore && m.active)
  const priceText = (code: string) => {
    const price = sellable.find((m) => m.code === code)?.prices[interval]
    if (!price) return `No ${interval === 'year' ? 'yearly' : 'monthly'} price yet`
    const per = price.perStudentPaise ? `, then ${formatINR(price.perStudentPaise, { paiseAlways: price.perStudentPaise % 100 !== 0 })} a student` : ''
    return `${formatINR(price.basePaise)} a ${interval} for up to ${price.includedStudents} students${per}`
  }

  return (
    <Sheet
      isOpen
      onClose={onClose}
      size="lg"
      title="Change modules"
      description={quote?.effective === 'mid_period'
        ? 'Added modules start now and are charged for the rest of the period. Removed modules stay until the period ends.'
        : 'The school pays for a full period. During a trial the period starts when the trial ends.'}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="submit" className="primary" disabled={saving || !chosen.size || Boolean(quoteError)}>
            {saving ? 'Saving…' : quote?.dueNow ? `Issue invoice for ${formatINR(quote.dueNow.totalPaise, { paiseAlways: true })}` : 'Save modules'}
          </button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="cb-form-section">
        <RadioGroup
          label="Billed"
          horizontal
          value={interval}
          onChange={setBillingInterval}
          options={[{ value: 'year', label: 'Yearly' }, { value: 'month', label: 'Monthly' }]}
        />
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Modules</h3>
        {!catalog ? <p className="cb-muted">Loading prices…</p> : (
          <div className="bl-module-list">
            {sellable.map((m) => {
              const inBundle = Boolean(bundle?.moduleCodes.includes(m.code))
              return (
                <Checkbox
                  key={m.code}
                  label={m.name}
                  description={inBundle ? `In the ${bundle?.name} bundle · ${priceText(m.code)}` : priceText(m.code)}
                  checked={chosen.has(m.code)}
                  disabled={inBundle || !m.prices[interval]}
                  onChange={(on) => toggle(m.code, on)}
                />
              )
            })}
          </div>
        )}
      </div>
      <div className="cb-form-section">
        <div className="form-grid">
          <Select
            label="Bundle"
            value={bundleCode}
            onChange={setBundleCode}
            options={[{ value: '', label: 'No bundle' }, ...(catalog?.bundles || []).filter((b) => b.active).map((b) => ({ value: b.code, label: `${b.name} (${b.discountBps / 100}% off)` }))]}
          />
          <TextField
            label="Students declared"
            inputMode="numeric"
            value={students}
            onChange={(value) => setStudents(value.replace(/\D/g, ''))}
            hint="If Students is on, the live count is billed when it is higher."
          />
          <TextField label="Coupon" value={couponCode} onChange={(value) => setCouponCode(value.toUpperCase())} placeholder="Optional" />
        </div>
      </div>
      <QuoteSummary quote={quote} error={quoteError} />
    </Sheet>
  )
}

function QuoteSummary({ quote, error }: { quote: Quote | null; error: string }) {
  if (error) return <Banner tone="warning" title={error} />
  if (!quote) return null
  const rows = (t: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; discountPaise: number; totalPaise: number }) => [
    ...(t.discountPaise ? [['Discount', `−${formatINR(t.discountPaise, { paiseAlways: true })}`]] : []),
    ['Taxable value', formatINR(t.taxablePaise, { paiseAlways: true })],
    ...(t.igstPaise ? [['IGST 18%', formatINR(t.igstPaise, { paiseAlways: true })]] : [['CGST 9%', formatINR(t.cgstPaise, { paiseAlways: true })], ['SGST 9%', formatINR(t.sgstPaise, { paiseAlways: true })]]),
  ]
  return (
    <div className="cb-form-section bl-quote">
      <h3 className="cb-form-section__title">Price</h3>
      <p className="cb-muted">{quote.students} students billed · {quote.modules.map((m) => m.name).join(', ')}</p>
      {quote.dueNow ? (
        <div className="bl-quote__block">
          <p className="cb-strong">Due {formatDate(quote.dueNow.dueAt)}{quote.dueNow.reason === 'change' ? ' for the rest of this period' : ''}</p>
          <dl className="bl-totals">
            {rows(quote.dueNow).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            <div className="is-total"><dt>Total</dt><dd>{formatINR(quote.dueNow.totalPaise, { paiseAlways: true })}</dd></div>
          </dl>
        </div>
      ) : <p className="cb-muted">Nothing to pay now.</p>}
      {quote.perPeriod ? (
        <p className="cb-muted">From the next renewal: {formatINR(quote.perPeriod.totalPaise, { paiseAlways: true })} a {quote.interval}, including GST.</p>
      ) : null}
    </div>
  )
}

function ExtendDialog({ open, tenantId, onClose, onDone }: { open: boolean; tenantId: string; onClose: () => void; onDone: DoneFn }) {
  const [days, setDays] = useState('7')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const valid = /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 365
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.grantExtension(tenantId, Number(days))
      onDone(res.message || 'Extension granted')
    } catch (err) {
      setError(errorMessage(err, "Couldn't grant the extension."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      size="sm"
      title="Grant an extension"
      description="Pushes back the trial end, the grace period or the renewal date, whichever applies now. A read-only school gets full access back for these days."
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="button" className="primary" disabled={!valid || saving} onClick={save}>{saving ? 'Saving…' : `Extend by ${valid ? days : '…'} days`}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <TextField label="Days" inputMode="numeric" value={days} onChange={(v) => setDays(v.replace(/\D/g, ''))} error={days && !valid ? 'Enter 1 to 365 days' : undefined} />
    </Dialog>
  )
}

function AdminTrialDialog({ open, tenantId, onClose, onDone }: { open: boolean; tenantId: string; onClose: () => void; onDone: DoneFn }) {
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('14')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const validDays = /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 90
  const valid = reason.trim().length >= 3 && validDays
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.startTrial(tenantId, { reason: reason.trim(), days: Number(days) })
      onDone(res.message || 'Trial started')
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the trial."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      size="sm"
      title="Start a trial without autopay"
      description="For a school that pays by bank transfer or cheque. Every module opens now; the school chooses its modules on Billing and gets an invoice. Schools normally opt in themselves."
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="button" className="primary" disabled={!valid || saving} onClick={save}>{saving ? 'Starting…' : `Start ${validDays ? days : '…'}-day trial`}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <TextField label="Days" inputMode="numeric" value={days} onChange={(v) => setDays(v.replace(/\D/g, ''))} error={days && !validDays ? 'Enter 1 to 90 days' : undefined} />
      <TextField label="Reason" value={reason} onChange={setReason} hint="Kept in the audit log, e.g. “Pays by NEFT; agreed on call with the principal”." />
    </Dialog>
  )
}

function CancelDialog({ open, tenantId, onClose, onDone }: { open: boolean; tenantId: string; onClose: () => void; onDone: DoneFn }) {
  const [when, setWhen] = useState<'period_end' | 'now'>('period_end')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.cancel(tenantId, when === 'now')
      onDone(res.message || 'Subscription cancelled')
    } catch (err) {
      setError(errorMessage(err, "Couldn't cancel the subscription."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      size="sm"
      tone="danger"
      title="Cancel this subscription?"
      description="The school keeps its data. Once cancelled, it can only read it until it subscribes again."
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep subscription</button>
          <button type="button" className="danger" disabled={saving} onClick={save}>{saving ? 'Cancelling…' : when === 'now' ? 'Cancel now' : 'Cancel at period end'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <RadioGroup
        value={when}
        onChange={setWhen}
        options={[
          { value: 'period_end', label: 'At the end of the paid period', description: 'No more renewals; access stays until then.' },
          { value: 'now', label: 'Straight away', description: 'Access becomes read-only now and unpaid invoices are voided.' },
        ]}
      />
    </Dialog>
  )
}

function PaymentDialog({ tenantId, invoice, onClose, onDone }: { tenantId: string; invoice: BillingInvoice; onClose: () => void; onDone: DoneFn }) {
  const [amount, setAmount] = useState(paiseToRupeesInput(invoice.outstandingPaise))
  const [method, setMethod] = useState('offline_bank')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const paise = rupeesToPaise(amount)
  const amountError = amount && paise == null ? 'Enter an amount like 1500 or 1500.50'
    : paise != null && paise > invoice.outstandingPaise ? `Can't be more than ${formatINR(invoice.outstandingPaise, { paiseAlways: true })} still due`
      : paise === 0 ? 'Enter an amount above zero' : undefined
  const save = async () => {
    if (paise == null || amountError) return
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.recordOfflinePayment(tenantId, invoice.id, {
        amountPaise: paise, method, reference: reference.trim(), receivedAt: new Date(`${date}T12:00:00+05:30`).toISOString(),
      })
      onDone(res.message || 'Payment recorded')
    } catch (err) {
      setError(errorMessage(err, "Couldn't record the payment."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      isOpen
      onClose={onClose}
      size="md"
      title={`Record a payment for ${invoice.number}`}
      description={`${formatINR(invoice.outstandingPaise, { paiseAlways: true })} still due. A receipt is issued straight away.`}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="button" className="primary" disabled={saving || paise == null || Boolean(amountError)} onClick={save}>{saving ? 'Saving…' : 'Record payment'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="form-grid">
        <TextField label="Amount" prefix="₹" inputMode="decimal" value={amount} onChange={setAmount} error={amountError} required />
        <Select
          label="Paid by"
          value={method}
          onChange={setMethod}
          options={[
            { value: 'offline_bank', label: 'Bank transfer (NEFT/RTGS/IMPS)' },
            { value: 'upi', label: 'UPI to our account' },
            { value: 'offline_cheque', label: 'Cheque' },
            { value: 'offline_cash', label: 'Cash' },
          ]}
        />
        <TextField label="Reference" value={reference} onChange={setReference} placeholder="UTR or cheque no." />
        <TextField label="Received on" type="date" value={date} onChange={setDate} max={new Date().toISOString().slice(0, 10)} />
      </div>
    </Dialog>
  )
}

function CreditNoteDialog({ tenantId, invoice, onClose, onDone }: { tenantId: string; invoice: BillingInvoice; onClose: () => void; onDone: DoneFn }) {
  const creditable = invoice.totalPaise - invoice.amountCreditedPaise
  const [amount, setAmount] = useState('')
  const [refund, setRefund] = useState(invoice.amountPaidPaise > 0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const paise = rupeesToPaise(amount)
  const amountError = amount && paise == null ? 'Enter an amount like 1500 or 1500.50'
    : paise != null && paise > creditable ? `Can't be more than ${formatINR(creditable, { paiseAlways: true })}`
      : paise === 0 ? 'Enter an amount above zero' : undefined
  const canRefund = invoice.amountPaidPaise > 0
  const save = async () => {
    if (paise == null || amountError || reason.trim().length < 3) return
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.createCreditNote(tenantId, invoice.id, {
        amountPaise: paise, reason: reason.trim(), refundPaise: canRefund && refund ? Math.min(paise, invoice.amountPaidPaise) : 0,
      })
      onDone(res.message || 'Credit note issued')
    } catch (err) {
      setError(errorMessage(err, "Couldn't issue the credit note."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      isOpen
      onClose={onClose}
      size="md"
      title={`Credit note against ${invoice.number}`}
      description={`Up to ${formatINR(creditable, { paiseAlways: true })} including GST. Tax is credited in the same split as the invoice.`}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="button" className="primary" disabled={saving || paise == null || Boolean(amountError) || reason.trim().length < 3} onClick={save}>
            {saving ? 'Issuing…' : refund && canRefund ? 'Issue credit note and refund' : 'Issue credit note'}
          </button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="form-grid">
        <TextField label="Amount including GST" prefix="₹" inputMode="decimal" value={amount} onChange={setAmount} error={amountError} required />
        <TextField label="Reason" value={reason} onChange={setReason} placeholder="Charged for the wrong module" required error={reason && reason.trim().length < 3 ? 'Say why in a few words' : undefined} />
        {canRefund ? (
          <div className="is-wide">
            <Checkbox
              label="Refund this amount to the school"
              description="Online payments are refunded through Razorpay; record offline refunds yourself."
              checked={refund}
              onChange={setRefund}
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}

function VoidDialog({ tenantId, invoice, onClose, onDone }: { tenantId: string; invoice: BillingInvoice; onClose: () => void; onDone: DoneFn }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await billingApi.voidInvoice(tenantId, invoice.id, reason.trim())
      onDone(res.message || 'Invoice voided')
    } catch (err) {
      setError(errorMessage(err, "Couldn't void the invoice."))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog
      isOpen
      onClose={onClose}
      size="sm"
      tone="danger"
      title={`Void ${invoice.number}?`}
      description="The school will no longer be asked to pay it. Its number stays used, as GST rules require."
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep invoice</button>
          <button type="button" className="danger" disabled={saving} onClick={save}>{saving ? 'Voiding…' : 'Void invoice'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <TextField label="Reason" value={reason} onChange={setReason} placeholder="Optional" />
    </Dialog>
  )
}
