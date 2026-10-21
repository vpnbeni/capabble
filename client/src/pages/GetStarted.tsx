import React, { useCallback, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, Lock, Sparkles } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  DetailList,
  EmptyState,
  Figure,
  Page,
  Timeline,
  formatDate,
} from '@/components/ui'
import { PlanFields, rupeesExact, usePlanSelection } from '@/components/billing/PlanSelection'
import { usePermissions } from '@/hooks/usePermissions'
import { billingKeys, useBillingMe, useStartTrial, useSubscribe, useTrialPreview } from '@/hooks/useBilling'
import billingService, { type TrialPreview } from '@/services/billingService'
import { getCurrentUser, selectUser } from '@/redux/slices/authSlice'
import type { AppDispatch } from '@/redux/store'
import '@/components/billing/billing.css'

type Step = 'choose' | 'review' | 'authorise' | 'done'

const POLL_MS = 4000

const DAY_MS = 86400000

type TrialDates = Pick<TrialPreview, 'autopay' | 'reminderOn' | 'noticeOn' | 'trialEndsAt'> & { firstChargePaise: number | null }

const trialSteps = (t: TrialDates) => [
  { label: 'Today', date: 'Trial starts', caption: 'Every module open, free' },
  { label: 'Reminder', date: formatDate(t.reminderOn), caption: 'We email you a week before' },
  t.autopay
    ? { label: 'Notice', date: formatDate(t.noticeOn), caption: 'Pre-debit notice, a day before' }
    : { label: 'Invoice', date: formatDate(t.reminderOn), caption: 'Your first invoice is ready' },
  { label: t.autopay ? 'First charge' : 'Plan starts', date: formatDate(t.trialEndsAt), caption: t.firstChargePaise != null ? `${rupeesExact(t.firstChargePaise)} with GST` : undefined },
]

/**
 * How the price after the trial adds up: module prices, then the bundle or coupon discount,
 * then GST. Without it a bundle's total looks wrong next to the module prices.
 */
const PriceBreakdown: React.FC<{ trial: TrialPreview; bundleName: string | null }> = ({ trial, bundleName }) => {
  const totals = trial.quote.dueNow ?? trial.quote.perPeriod
  const per = trial.quote.interval
  if (!totals) return null
  const count = trial.quote.modules.length
  return (
    <dl className="bl-totals">
      <div>
        <dt>{count} {count === 1 ? 'module' : 'modules'} for {trial.quote.students.toLocaleString('en-IN')} students</dt>
        <dd>{rupeesExact(totals.subtotalPaise)}</dd>
      </div>
      {totals.discountPaise ? (
        <div><dt>{bundleName ? `${bundleName} discount` : 'Discount'}</dt><dd>−{rupeesExact(totals.discountPaise)}</dd></div>
      ) : null}
      {totals.igstPaise
        ? <div><dt>IGST 18%</dt><dd>{rupeesExact(totals.igstPaise)}</dd></div>
        : <div><dt>CGST 9% + SGST 9%</dt><dd>{rupeesExact(totals.cgstPaise + totals.sgstPaise)}</dd></div>}
      <div className="is-total"><dt>Then, a {per} with GST</dt><dd>{rupeesExact(trial.firstChargePaise)}</dd></div>
    </dl>
  )
}

/**
 * Get started: a school with no plan opts in to its free trial. It chooses the modules (or a
 * bundle) it will keep, reviews what it will pay and when, agrees, and sets up autopay when
 * that is required. Every module is open during the trial, whatever it chooses.
 */
const GetStarted: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const user = useSelector(selectUser)
  const { can } = usePermissions()
  const canManage = can('core.billing.manage')
  const me = useBillingMe()
  // Kept in the URL: starting the trial refreshes access, which remounts the page.
  const initialStep: Step = params.get('started') === '1' ? 'done' : params.get('mandate') === '1' ? 'authorise' : 'choose'
  const [step, setStepState] = useState<Step>(initialStep)
  const setStep = useCallback((next: Step) => {
    setStepState(next)
    if (next === 'done') setParams({ started: '1' }, { replace: true })
  }, [setParams])
  const [agreed, setAgreed] = useState(false)
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null)
  const [started, setStarted] = useState<TrialPreview | null>(null)
  const startTrial = useStartTrial()
  const subscribe = useSubscribe()

  const plan = usePlanSelection(null, me.data?.liveStudents ?? null)
  const { chosen } = plan
  const preview = useTrialPreview(plan.debounced, chosen.size > 0 && canManage)
  const quoteError = (preview.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const trial = preview.data
  const catalogModules = plan.catalog.data?.modules || []
  const trialDays = trial?.trialDays || 14

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: billingKeys.all })
    dispatch(getCurrentUser())
  }, [dispatch, queryClient])

  // While autopay is being authorised in Razorpay's tab, check until the trial is on.
  useEffect(() => {
    if (step !== 'authorise') return undefined
    let stopped = false
    const check = async () => {
      try {
        const result = await billingService.reconcileTrial()
        if (!stopped && result.state === 'trialing') {
          setStep('done')
          refresh()
        }
      } catch {
        // Keep waiting; the page says what to do.
      }
    }
    check()
    const timer = window.setInterval(check, POLL_MS)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [step, refresh, setStep])

  const start = () => {
    if (!trial || !agreed) return
    startTrial.mutate(plan.selection, {
      onSuccess: (result) => {
        setStarted(result)
        if (result.authorizeUrl) {
          setAuthorizeUrl(result.authorizeUrl)
          setStep('authorise')
          window.open(result.authorizeUrl, '_blank', 'noopener')
        } else {
          setStep('done')
          refresh()
        }
      },
    })
  }

  const payInstead = () => {
    subscribe.mutate(plan.selection, {
      onSuccess: async (result) => {
        refresh()
        if (result.invoice && result.invoice.status === 'open') {
          try {
            const { paymentLink } = await billingService.payNow(result.invoice.id)
            window.location.href = paymentLink.url
            return
          } catch {
            // The invoice waits on Billing.
          }
        }
        navigate('/billing')
      },
    })
  }

  if (!canManage) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Lock}
            title="Your school's plan isn't set up yet"
            body={`A school administrator chooses the plan. It takes two minutes and starts a free ${trialDays}-day trial with every module open. Ask them to sign in and open Get started.`}
          />
        </Card>
      </Page>
    )
  }

  const accessMode = user?.billing?.accessMode
  if (step === 'choose' && accessMode && accessMode !== 'setup_required') {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={CreditCard}
            title="Your school already has a plan"
            body="Change modules, see invoices and manage your trial on Billing."
            action={<Button variant="primary" onClick={() => navigate('/billing')}>Open Billing</Button>}
          />
        </Card>
      </Page>
    )
  }

  if (step === 'done') {
    const sub = me.data?.subscription
    const end = sub?.trialEndsAt || started?.trialEndsAt || null
    const done: TrialDates | null = end ? {
      autopay: Boolean(me.data?.entitlement?.autopay ?? started?.autopay),
      trialEndsAt: end,
      reminderOn: new Date(new Date(end).getTime() - 7 * DAY_MS).toISOString(),
      noticeOn: new Date(new Date(end).getTime() - DAY_MS).toISOString(),
      firstChargePaise: me.data?.trial?.firstChargePaise ?? started?.firstChargePaise ?? null,
    } : null
    const planned = new Set(sub?.items?.map((i) => i.moduleCode) || [...chosen])
    return (
      <Page>
        <div className="cb-stack">
          <Card
            title="Your free trial has started"
            subtitle={done ? `Every module is open until ${formatDate(done.trialEndsAt)}. Nothing is charged before then.` : 'Every module is open for your school.'}
          >
            <div className="cb-stack">
              {done ? <Timeline steps={trialSteps(done)} current={0} label="Your trial" /> : null}
              <div className="cb-card-actions">
                <Button variant="primary" onClick={() => navigate('/home')}>Start exploring</Button>
                <Button variant="secondary" onClick={() => navigate('/billing')}>Review my plan</Button>
              </div>
            </div>
          </Card>
          <Card title="Open during your trial" subtitle="Try anything. The modules in your plan stay on after the trial; you can add others any time.">
            <ul className="bl-modules gs-modules">
              {[...catalogModules].sort((a, b) => Number(planned.has(b.code)) - Number(planned.has(a.code))).map((m) => (
                <li key={m.code}>
                  <span className="cb-strong">{m.name}</span>
                  {planned.has(m.code) ? <Badge tone="info" dot={false}>In your plan</Badge> : <Badge tone="neutral" dot={false}>Open in your trial</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Page>
    )
  }

  if (step === 'authorise') {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={CreditCard}
            title="Finish setting up autopay"
            body="Authorise autopay on the Razorpay page we opened (card, UPI AutoPay or your bank). Nothing is charged today. This page moves on by itself once it's done."
            action={[
              ...(authorizeUrl ? [<Button key="open" variant="primary" onClick={() => window.open(authorizeUrl, '_blank', 'noopener')}>Open Razorpay again</Button>] : []),
              <Button key="back" variant="secondary" onClick={() => setStep('review')}>Back to my plan</Button>,
            ]}
          />
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <div className="cb-stack">
        <Banner tone="info" title={`Every module is open for ${trialDays} days, whatever you choose`}>
          Your plan decides what stays on after the trial and what you pay. Nothing is charged today, and you can cancel any time before the trial ends.
        </Banner>

        {step === 'choose' ? (
          <div className="cb-grid-8-4">
            <Card title="Choose what you'll keep" subtitle="Pick a bundle or the modules you need. Prices depend on your number of students.">
              <PlanFields plan={plan} bundles="cards" />
            </Card>
            <Card title="Your trial">
              <div className="bl-pay">
                <Figure value="Free" caption={`for ${trialDays} days, every module`} />
                {quoteError ? <Banner tone="warning" title={quoteError} /> : null}
                {trial && !quoteError ? (
                  <>
                    <PriceBreakdown trial={trial} bundleName={plan.bundle?.name || null} />
                    <DetailList
                      columns={1}
                      items={[
                        { label: 'From', value: formatDate(trial.trialEndsAt) },
                        { label: 'Modules you keep', value: trial.quote.modules.map((m) => m.name).join(', ') },
                      ]}
                    />
                  </>
                ) : <p className="cb-muted">Choose at least one module to see your price.</p>}
                <Button variant="primary" fullWidth icon={Sparkles} disabled={!trial || Boolean(quoteError) || preview.isFetching} onClick={() => { setAgreed(false); setStep('review') }}>
                  Review and start trial
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {step === 'review' && trial ? (
          <div className="cb-grid-8-4">
            <Card title="Review your trial" subtitle="What happens, and when. We'll remind you before anything is charged.">
              <div className="cb-stack">
                <Timeline steps={trialSteps(trial)} current={0} label="Your trial" />
                <DetailList
                  columns={2}
                  items={[
                    { label: 'During the trial', value: 'Every module, free' },
                    { label: 'Trial ends', value: formatDate(trial.trialEndsAt) },
                    { label: 'Your plan after it', value: trial.quote.modules.map((m) => m.name).join(', '), wide: true },
                    { label: 'Students', value: trial.quote.students.toLocaleString('en-IN') },
                    { label: trial.autopay ? 'First charge' : 'First invoice', value: `${rupeesExact(trial.firstChargePaise)} with GST` },
                    { label: 'Then', value: trial.quote.perPeriod ? `${rupeesExact(trial.quote.perPeriod.totalPaise)} every ${trial.quote.interval}` : '—' },
                    { label: 'Paid by', value: trial.autopay ? 'Autopay (card, UPI or bank mandate)' : 'Invoice (UPI, card or netbanking)' },
                  ]}
                />
                <Checkbox
                  checked={agreed}
                  onChange={setAgreed}
                  label="I agree"
                  description={trial.consentText}
                />
              </div>
            </Card>
            <Card title="Start your trial">
              <div className="bl-pay">
                <Figure value={rupeesExact(0)} caption="charged today" />
                {trial.autopay ? <p className="cb-muted">Next, Razorpay opens to set up autopay. Banks may ask you to approve it.</p> : null}
                <Button variant="primary" fullWidth loading={startTrial.isPending} disabled={!agreed} onClick={start}>
                  {trial.autopay ? 'Set up autopay and start trial' : 'Start my free trial'}
                </Button>
                <Button variant="tertiary" fullWidth onClick={() => setStep('choose')}>Change my plan</Button>
                <p className="cb-subtle">
                  Rather skip the trial?{' '}
                  <button type="button" className="cb-link" disabled={subscribe.isPending} onClick={payInstead}>Pay now instead</button>
                </p>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </Page>
  )
}

export default GetStarted
