import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Clock } from 'lucide-react-native'
import { useEffect, useState } from 'react'

import { formatDate, formatINR } from '@/lib/format'
import { openCheckout } from '@/lib/openCheckout'
import { sharePdf } from '@/lib/sharePdf'
import { usePortal } from '@/portal/PortalProvider'
import { portalKeys } from '@/portal/queries'
import { portalService } from '@/services/portalService'
import { DetailList, MobileButton, MobileScreen, NavBar, Skeleton, StatusView, useToast } from '@/ui'

// Stop asking after this long; the webhook still records the payment and Fees shows it.
const POLL_FOR_MS = 3 * 60 * 1000

/**
 * Shown under the checkout sheet while a parent pays (capabble://fee-payment/<order>):
 * waits for the payment to be recorded, then shows the receipt.
 */
export default function FeePaymentScreen() {
  const { orderId, student, url } = useLocalSearchParams<{ orderId: string; student: string; url?: string }>()
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { home } = usePortal()
  const [stillWaiting, setStillWaiting] = useState(true)
  const [sharing, setSharing] = useState(false)
  const childName = home?.students.find((entry) => entry.studentId === student)?.name ?? ''

  const payment = useQuery({
    queryKey: [...portalKeys.all, 'student', student ?? '', 'fee-payment', orderId ?? ''],
    queryFn: () => portalService.payment(student as string, orderId as string),
    enabled: Boolean(orderId && student),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      const waiting = !status || status === 'created' || status === 'processing'
      return waiting && stillWaiting ? 3000 : false
    },
  })
  const status = payment.data?.status
  const done = status === 'paid' || status === 'review'

  useEffect(() => {
    const timer = setTimeout(() => setStillWaiting(false), POLL_FOR_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (done && student) queryClient.invalidateQueries({ queryKey: portalKeys.fees(student) })
  }, [done, student, queryClient])

  const back = () => (router.canGoBack() ? router.back() : router.replace('/fees'))

  const shareReceipt = async () => {
    const data = payment.data
    if (!data?.feePaymentId || !data.receiptNo || !student || sharing) return
    setSharing(true)
    try {
      const bytes = await portalService.receiptPdf(student, data.feePaymentId)
      await sharePdf(bytes, `receipt-${data.receiptNo.replace(/[^\w-]+/g, '-')}.pdf`)
    } catch {
      toast("Couldn't download the receipt. Try again.", 'danger')
    } finally {
      setSharing(false)
    }
  }

  const nav = <NavBar title="Payment" back={{ label: 'Fees', onPress: back }} />

  if (payment.isPending) {
    return (
      <MobileScreen nav={nav}>
        <Skeleton height={320} />
      </MobileScreen>
    )
  }

  if (payment.isError || !payment.data) {
    return (
      <MobileScreen nav={nav}>
        <StatusView
          kind="error"
          title="Couldn't check the payment"
          body="If money left your account, the school still gets it. Check again in a minute; it also shows under Fees."
          actions={
            <>
              <MobileButton size="large" fullWidth loading={payment.isRefetching} onPress={() => payment.refetch()}>
                Check again
              </MobileButton>
              <MobileButton variant="gray" size="large" fullWidth onPress={back}>
                Back to fees
              </MobileButton>
            </>
          }
        />
      </MobileScreen>
    )
  }

  const data = payment.data

  if (done) {
    return (
      <MobileScreen nav={nav}>
        <StatusView
          kind="success"
          title="Payment received"
          value={formatINR(data.amount)}
          body={status === 'review' ? data.message : `${childName ? `For ${childName}. ` : ''}The school has your payment.`}
          details={
            <DetailList
              items={[
                { label: 'Receipt no.', value: data.receiptNo || 'The office will send it' },
                { label: 'Paid on', value: formatDate(data.paidAt || new Date()) },
                { label: 'Paid by', value: data.method ? `Online · ${data.method}` : 'Online' },
                { label: 'Payment ID', value: data.paymentId },
              ]}
            />
          }
          actions={
            <>
              {data.feePaymentId ? (
                <MobileButton size="large" fullWidth loading={sharing} onPress={shareReceipt}>
                  Share receipt
                </MobileButton>
              ) : null}
              <MobileButton variant="gray" size="large" fullWidth onPress={back}>
                Done
              </MobileButton>
            </>
          }
        />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen nav={nav}>
      <StatusView
        kind="empty"
        icon={Clock}
        title={status === 'processing' ? 'Recording your payment' : 'Finish paying on Razorpay'}
        value={formatINR(data.amount)}
        body={
          status === 'processing'
            ? 'This takes a few seconds.'
            : stillWaiting
              ? 'This updates by itself once you pay.'
              : 'No payment yet. If you paid, it shows under Fees within a few minutes.'
        }
        actions={
          <>
            {url && status === 'created' ? (
              <MobileButton size="large" fullWidth onPress={() => openCheckout(url)}>
                Open the payment page
              </MobileButton>
            ) : null}
            <MobileButton variant="gray" size="large" fullWidth loading={payment.isRefetching && !stillWaiting} onPress={stillWaiting ? back : () => payment.refetch()}>
              {stillWaiting ? 'Back to fees' : 'Check again'}
            </MobileButton>
          </>
        }
      />
    </MobileScreen>
  )
}
