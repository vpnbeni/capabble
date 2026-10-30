import React, { useEffect, useMemo, useState } from 'react'
import { CreditCard, Download } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Banner, Button, Checkbox, DetailList, Sheet, formatDate, formatINR } from '@/components/ui'
import portalService, { type PortalFees, type PortalPaymentResult } from '../portalService'
import { openCheckout } from '../razorpayCheckout'

type Demand = PortalFees['demands'][number]

export const isOwing = (demand: Demand) => demand.balance > 0 && demand.status !== 'paid' && demand.status !== 'waived'

/** Overdue installments and the next one due: what most parents came to pay. */
const defaultChoice = (owing: Demand[]) => {
  const overdue = owing.filter((demand) => demand.isOverdue)
  const next = owing.find((demand) => !demand.isOverdue)
  return [...overdue, ...(next ? [next] : [])].map((demand) => demand._id)
}

const accentColor = () => {
  const root = document.querySelector('.cb-app') || document.documentElement
  return getComputedStyle(root).getPropertyValue('--accent-strong').trim() || undefined
}

const apiMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || (error as Error)?.message || fallback

type Props = {
  open: boolean
  onClose: () => void
  studentId: string
  childName: string
  demands: Demand[]
  testMode?: boolean
  onReceipt: (payment: { _id: string; receiptNo: string }) => void
}

/** Choose the installments, pay through Razorpay Checkout, then show the receipt. */
const PortalPaySheet: React.FC<Props> = ({ open, onClose, studentId, childName, demands, testMode, onReceipt }) => {
  const queryClient = useQueryClient()
  const owing = useMemo(() => demands.filter(isOwing).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [demands])
  const [chosen, setChosen] = useState<string[]>([])
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PortalPaymentResult | null>(null)

  useEffect(() => {
    if (!open) return
    setChosen(defaultChoice(owing))
    setError('')
    setResult(null)
    // Only when the sheet opens: later fee refreshes must not undo the parent's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const total = owing.filter((demand) => chosen.includes(demand._id)).reduce((sum, demand) => sum + demand.balance, 0)
  const toggle = (id: string, on: boolean) => setChosen((list) => (on ? [...list, id] : list.filter((x) => x !== id)))

  const pay = async () => {
    if (!chosen.length || paying) return
    setPaying(true)
    setError('')
    try {
      const order = await portalService.startPayment(studentId, chosen)
      const outcome = await openCheckout(order, accentColor())
      if (outcome.kind === 'closed') return
      if (outcome.kind === 'failed') {
        setError(`${outcome.message} No money was taken. You can try again.`)
        return
      }
      const settled = await portalService.verifyPayment(studentId, order.orderId, outcome.response)
      setResult(settled)
      queryClient.invalidateQueries({ queryKey: ['portal'] })
    } catch (err) {
      setError(apiMessage(err, 'Could not start the payment. Try again.'))
    } finally {
      setPaying(false)
    }
  }

  if (result) {
    const paid = result.status === 'paid'
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={paid ? 'Payment received' : 'Payment reached the school'}
        description={`${formatINR(result.amount)} for ${childName}`}
        icon={CreditCard}
        footer={
          <>
            {paid && result.feePaymentId && result.receiptNo ? (
              <Button icon={Download} onClick={() => onReceipt({ _id: result.feePaymentId as string, receiptNo: result.receiptNo as string })}>
                Download receipt
              </Button>
            ) : null}
            <Button variant="primary" onClick={onClose}>Done</Button>
          </>
        }
      >
        {paid ? null : <Banner tone="warning" title="The receipt needs the office">{result.message}</Banner>}
        <DetailList
          columns={2}
          items={[
            { label: 'Amount', value: formatINR(result.amount) },
            { label: 'Receipt no.', value: result.receiptNo || '—' },
            { label: 'Paid on', value: result.paidAt ? formatDate(result.paidAt) : formatDate(new Date().toISOString()) },
            { label: 'Paid by', value: result.method ? `Online · ${result.method}` : 'Online' },
            { label: 'Payment ID', value: result.paymentId || '—', wide: true },
          ]}
        />
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={paying ? () => {} : onClose}
      title="Pay fees"
      description={`For ${childName}. Payments go straight to the school.`}
      icon={CreditCard}
      footer={
        <>
          <Button onClick={onClose} disabled={paying}>Cancel</Button>
          <Button variant="primary" loading={paying} disabled={!chosen.length} onClick={pay}>
            {chosen.length ? `Pay ${formatINR(total)}` : 'Choose what to pay'}
          </Button>
        </>
      }
    >
      <div className="cb-stack">
        {testMode ? <Banner tone="warning" title="Test mode">The school is testing online payments. Use Razorpay test details; no real money moves.</Banner> : null}
        {error ? <Banner tone="danger" title="The payment didn't go through">{error}</Banner> : null}
        <div className="cb-check-grid">
          {owing.map((demand) => (
            <Checkbox
              key={demand._id}
              className="is-wide"
              checked={chosen.includes(demand._id)}
              disabled={paying}
              onChange={(on) => toggle(demand._id, on)}
              label={`${demand.label} · ${formatINR(demand.balance)}`}
              description={`${demand.isOverdue ? 'Overdue since' : 'Due'} ${formatDate(demand.dueDate)}${demand.lines.length ? ` · ${demand.lines.map((line) => line.name).join(', ')}` : ''}`}
            />
          ))}
        </div>
        <p className="cb-muted">Pay by UPI, card or net banking. The receipt shows here as soon as the payment goes through.</p>
      </div>
    </Sheet>
  )
}

export default PortalPaySheet
