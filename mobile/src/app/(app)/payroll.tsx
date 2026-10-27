import { useRouter } from 'expo-router'
import { Share2, Wallet } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR, formatMonth } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { expenseService } from '@/services/expenseService'
import { usePayrollRun, usePayrollRuns } from '@/staff/expenseQueries'
import type { Tone } from '@/theme/tokens'
import { ChipRail, Hero, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

// Same words as the website's Finance → Payroll.
const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  finalized: { label: 'Finalized', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
}

/**
 * A month's payroll to look at on the move: totals, each person's net pay, and the payslips PDF
 * to share. Running, finalizing and paying payroll stays on the website (statutory checks across
 * a full grid of staff).
 */
export default function PayrollScreen() {
  const router = useRouter()
  const toast = useToast()
  const runs = usePayrollRuns()
  const [picked, setPicked] = useState<string | null>(null)
  const month = picked ?? runs.data?.[0]?.month
  const run = usePayrollRun(month)
  const [sharing, setSharing] = useState(false)
  const data = run.data

  const share = async () => {
    if (!month || sharing) return
    setSharing(true)
    try {
      await sharePdf(await expenseService.payslips(month), `payslips-${month}.pdf`)
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "Couldn't make the payslips. Try again.", 'danger')
    } finally {
      setSharing(false)
    }
  }

  return (
    <MobileScreen refreshing={runs.isRefetching || run.isRefetching} onRefresh={() => (runs.refetch(), run.refetch())} nav={<NavBar title="Payroll" back={{ label: 'Back', onPress: router.back }} actions={data && data.status !== 'draft' ? [{ icon: Share2, label: 'Share payslips', onPress: share }] : []} />}>
      {runs.isPending ? (
        <CardSkeleton rows={4} />
      ) : runs.isError ? (
        <LoadFailed what="Payroll" error={runs.error} onRetry={runs.refetch} />
      ) : !runs.data?.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Wallet} title="No payroll run yet" body="Months the accounts office runs show here to check." />
        </Surface>
      ) : (
        <>
          {runs.data.length > 1 ? <ChipRail label="Month" value={month ?? ''} onChange={setPicked} items={runs.data.slice(0, 12).map((row) => ({ id: row.month, label: formatMonth(row.month) }))} /> : null}
          {run.isPending ? (
            <CardSkeleton rows={4} />
          ) : run.isError || !data ? (
            <LoadFailed what="This month's payroll" error={run.error} onRetry={run.refetch} />
          ) : (
            <>
              <Hero
                tone="surface"
                icon={Wallet}
                label={`${formatMonth(data.month)} · ${STATUS[data.status]?.label ?? data.status}`}
                value={formatINR(data.totals.net)}
                detail={`${data.totals.staff} staff · gross ${formatINR(data.totals.gross)} · deductions ${formatINR(data.totals.deductions)}${data.paidOn ? ` · paid ${formatDate(data.paidOn)}` : ''}`}
              />
              <ListGroup
                header="Net pay"
                items={(data.payslips ?? [])
                  .slice()
                  .sort((a, b) => String(a.snapshot?.name).localeCompare(String(b.snapshot?.name)))
                  .map((slip) => ({
                    title: slip.snapshot?.name ?? slip.staffKey,
                    subtitle: [slip.snapshot?.designation, `${slip.paidDays} days paid`, slip.lopDays ? `${slip.lopDays} unpaid` : null].filter(Boolean).join(' · '),
                    value: formatINR(slip.net),
                    lines: 2,
                  }))}
              />
            </>
          )}
        </>
      )}
    </MobileScreen>
  )
}
