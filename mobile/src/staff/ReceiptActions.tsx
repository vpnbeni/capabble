import { Share2 } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { MODE_LABELS, feeService, type FeePayment } from '@/services/feeService'
import { ActionSheet, Dialog, MobileButton, MobileTextField, haptic, useToast } from '@/ui'

import { useCancelReceipt, useChequeStatus } from './feeQueries'
import { useStaff } from './useStaff'

/** Shares a receipt PDF (the school's receipt, as printed at the counter). */
export const shareReceipt = async (payment: Pick<FeePayment, '_id' | 'receiptNo'>) => {
  const bytes = await feeService.receiptPdf(payment._id)
  await sharePdf(bytes, `receipt-${payment.receiptNo.replace(/[^\w-]+/g, '-')}.pdf`)
}

/** "Cash · 27 Oct 2026", "Cheque 004512 · pending". */
export const paymentDetail = (payment: FeePayment) =>
  [
    payment.mode === 'cheque' || payment.mode === 'dd'
      ? `${MODE_LABELS[payment.mode]}${payment.cheque?.number ? ` ${payment.cheque.number}` : ''}${payment.cheque?.status ? ` · ${payment.cheque.status}` : ''}`
      : MODE_LABELS[payment.mode] ?? payment.mode,
    formatDate(payment.date),
    payment.status === 'cancelled' ? 'Cancelled' : null,
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * What can be done with one receipt: share it, mark a cheque cleared or bounced, cancel it with a
 * reason (each behind its own permission, as on the website).
 */
export function ReceiptActions({ payment, onClose }: { payment: FeePayment | null; onClose: () => void }) {
  const toast = useToast()
  const staff = useStaff()
  const cancel = useCancelReceipt()
  const cheque = useChequeStatus()
  const [cancelling, setCancelling] = useState<FeePayment | null>(null)
  const [reason, setReason] = useState('')
  const [sharing, setSharing] = useState(false)

  const fail = (error: unknown, fallback: string) => {
    haptic.error()
    toast(error instanceof ApiError ? error.message : fallback, 'danger')
  }

  const share = async (target: FeePayment) => {
    onClose()
    if (sharing) return
    setSharing(true)
    try {
      await shareReceipt(target)
    } catch (error) {
      fail(error, "Couldn't download the receipt. Try again.")
    } finally {
      setSharing(false)
    }
  }

  const markCheque = async (target: FeePayment, status: 'cleared' | 'bounced') => {
    onClose()
    try {
      await cheque.mutateAsync({ id: target._id, status })
      haptic.success()
      toast(status === 'cleared' ? 'Cheque marked cleared' : `Cheque bounced: receipt ${target.receiptNo} cancelled and the dues are back`)
    } catch (error) {
      fail(error, "That didn't save. Try again.")
    }
  }

  const confirmCancel = async () => {
    if (!cancelling) return
    if (!reason.trim()) {
      haptic.error()
      toast('Write why the receipt is cancelled', 'danger')
      return
    }
    try {
      await cancel.mutateAsync({ id: cancelling._id, reason: reason.trim() })
      haptic.medium()
      toast(`Receipt ${cancelling.receiptNo} cancelled. The money is back as due.`)
      setCancelling(null)
      setReason('')
    } catch (error) {
      fail(error, "The receipt wasn't cancelled. Try again.")
    }
  }

  const valid = payment?.status === 'valid'
  const pendingCheque = valid && (payment?.mode === 'cheque' || payment?.mode === 'dd') && payment.cheque?.status === 'pending'

  return (
    <>
      <ActionSheet
        open={Boolean(payment)}
        onClose={onClose}
        title={payment ? `${payment.receiptNo} · ${formatINR(payment.total)}` : ''}
        message={payment ? [payment.studentSnapshot?.name, paymentDetail(payment)].filter(Boolean).join(' · ') : undefined}
        actions={
          payment
            ? [
                { label: 'Share receipt', icon: Share2, onSelect: () => share(payment) },
                ...(pendingCheque && staff.can('cpitl.finance.manage_accounts')
                  ? [
                      { label: 'Cheque cleared', onSelect: () => markCheque(payment, 'cleared') },
                      { label: 'Cheque bounced', tone: 'danger' as const, onSelect: () => markCheque(payment, 'bounced') },
                    ]
                  : []),
                ...(valid && staff.can('cpitl.finance.cancel_receipt')
                  ? [{ label: 'Cancel receipt', tone: 'danger' as const, onSelect: () => (onClose(), setCancelling(payment)) }]
                  : []),
              ]
            : []
        }
      />
      <Dialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        tone="danger"
        title={`Cancel receipt ${cancelling?.receiptNo ?? ''}?`}
        description={`${formatINR(cancelling?.total ?? 0)} goes back as due. The receipt stays, marked cancelled.`}
        footer={
          <>
            <MobileButton variant="gray" onPress={() => setCancelling(null)}>
              Keep receipt
            </MobileButton>
            <MobileButton variant="destructive" loading={cancel.isPending} onPress={confirmCancel}>
              Cancel receipt
            </MobileButton>
          </>
        }
      >
        <MobileTextField label="Reason" value={reason} onChangeText={setReason} placeholder="Wrong student, entered twice…" maxLength={300} />
      </Dialog>
    </>
  )
}
