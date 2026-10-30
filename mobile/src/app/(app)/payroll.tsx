import { useRouter } from 'expo-router'
import { BadgeCheck, BadgeIndianRupee, Ellipsis, Landmark, Play, Wallet } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatDayKey, formatINR, formatMonth, monthAdd, monthOf, schoolToday } from '@/lib/format'
import { shareBytes, sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { expenseService, type Payslip } from '@/services/expenseService'
import { MODE_LABELS, type PaymentMode } from '@/services/feeService'
import { useEditPayslips, useFinalizeRun, useMarkRunPaid, usePayrollRun, usePayrollRuns, useRemoveRun, useReopenRun, useStartRun } from '@/staff/expenseQueries'
import { useStaff } from '@/staff/useStaff'
import { space, type Tone } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ChipRail,
  Dialog,
  Hero,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  MonthPicker,
  NavBar,
  OptionList,
  StatusView,
  Surface,
  haptic,
  useToast,
} from '@/ui'

// Same words as the website's Finance → Payroll.
const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  finalized: { label: 'Finalized', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
}

type Confirm = 'finalize' | 'reopen' | 'remove' | null

/**
 * A month's payroll (the website's Finance → Payroll): start the month (pay is worked out from each
 * person's salary and the days they were away), change a draft payslip's unpaid days, arrears or
 * deductions, finalize, mark it paid (that records the salary expense), reopen; share the payslips
 * and the bank sheet. Each person's salary is under Salaries.
 */
export default function PayrollScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canRun = staff.can('cpitl.finance.payroll')
  const runs = usePayrollRuns()
  const [picked, setPicked] = useState<string | null>(null)
  const month = picked ?? runs.data?.[0]?.month
  const run = usePayrollRun(month)
  const data = run.data
  const start = useStartRun()
  const edit = useEditPayslips()
  const finalize = useFinalizeRun()
  const pay = useMarkRunPaid()
  const reopen = useReopenRun()
  const remove = useRemoveRun()
  const [sharing, setSharing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [slip, setSlip] = useState<{ row: Payslip; lop: string; arrears: string; other: string; remarks: string } | null>(null)
  const [paying, setPaying] = useState<{ paidOn: string; mode: PaymentMode; reference: string; picking: 'date' | 'mode' | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  // Months without a run yet: this one and the two before it.
  const thisMonth = monthOf(schoolToday())
  const startable = [thisMonth, monthAdd(thisMonth, -1), monthAdd(thisMonth, -2)].filter((value) => !(runs.data ?? []).some((row) => row.month === value))

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const share = async (what: 'payslips' | 'bank') => {
    if (!month || sharing) return
    setMenu(false)
    setSharing(true)
    try {
      if (what === 'payslips') await sharePdf(await expenseService.payslips(month), `payslips-${month}.pdf`)
      else await shareBytes(await expenseService.bankSheet(month), `bank-sheet-${month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch (failure) {
      toast(fail(failure, "That didn't download. Try again."), 'danger')
    } finally {
      setSharing(false)
    }
  }

  const doStart = async (value: string) => {
    setStarting(false)
    try {
      await start.mutateAsync(value)
      haptic.success()
      setPicked(value)
      setStartError(null)
      toast(`${formatMonth(value)} payroll worked out as a draft`)
    } catch (failure) {
      setStartError(fail(failure, "Payroll didn't start. Try again."))
    }
  }

  const saveSlip = async () => {
    if (!slip || !month) return
    const lop = Number(slip.lop || 0)
    if (!Number.isFinite(lop) || lop < 0 || lop > (data?.daysInMonth ?? 31)) return setError(`Unpaid days are 0 to ${data?.daysInMonth ?? 31}.`)
    try {
      await edit.mutateAsync({ month, payslips: [{ _id: slip.row._id, lopDays: lop, arrears: Number(slip.arrears || 0), otherDeduction: Number(slip.other || 0), remarks: slip.remarks.trim() }] })
      haptic.success()
      setSlip(null)
      toast(`${slip.row.snapshot?.name ?? 'Payslip'} updated`)
    } catch (failure) {
      setError(fail(failure, "It didn't save. Try again."))
    }
  }

  const doConfirm = async () => {
    if (!month || !confirm) return
    const what = confirm
    setConfirm(null)
    try {
      if (what === 'finalize') await finalize.mutateAsync(month)
      else if (what === 'reopen') await reopen.mutateAsync(month)
      else {
        await remove.mutateAsync(month)
        setPicked(null)
      }
      haptic.success()
      toast(what === 'finalize' ? 'Payroll finalized' : what === 'reopen' ? 'Payroll back to draft' : 'Draft deleted')
    } catch (failure) {
      toast(fail(failure, "That didn't work. Try again."), 'danger')
    }
  }

  const doPay = async () => {
    if (!paying || !month) return
    try {
      await pay.mutateAsync({ month, input: { paidOn: paying.paidOn, mode: paying.mode, reference: paying.reference.trim() || undefined } })
      haptic.success()
      setPaying(null)
      toast('Salaries marked paid and recorded as an expense')
    } catch (failure) {
      setError(fail(failure, "It wasn't marked paid. Try again."))
    }
  }

  const menuActions = [
    ...(data && data.status !== 'draft'
      ? [
          { label: 'Share payslips', onSelect: () => share('payslips') },
          { label: 'Share bank sheet', icon: Landmark, onSelect: () => share('bank') },
        ]
      : []),
    ...(canRun && startable.length ? [{ label: 'Run another month', icon: Play, onSelect: () => (setMenu(false), setStarting(true)) }] : []),
    ...(canRun && data && data.status !== 'draft' ? [{ label: 'Reopen as draft', onSelect: () => (setMenu(false), setConfirm('reopen')) }] : []),
    ...(canRun && data?.status === 'draft' ? [{ label: 'Delete draft', tone: 'danger' as const, onSelect: () => (setMenu(false), setConfirm('remove')) }] : []),
  ]

  const actionBar = !canRun ? undefined : !runs.data?.length || !data ? (
    startable.length && !runs.isPending ? (
      <ActionBar icon={Play} summary={`Payroll for ${formatMonth(startable[0])}`} detail="Worked out from salaries and days away" label="Run payroll" onPress={() => doStart(startable[0])} />
    ) : undefined
  ) : data.status === 'draft' ? (
    <ActionBar
      icon={BadgeCheck}
      summary={`${formatINR(data.totals.net)} for ${data.totals.staff} staff`}
      detail="Check the payslips, then finalize"
      label="Finalize"
      onPress={() => setConfirm('finalize')}
    />
  ) : data.status === 'finalized' ? (
    <ActionBar
      icon={Wallet}
      summary={`${formatINR(data.totals.net)} to pay`}
      detail={formatMonth(data.month)}
      label="Mark paid"
      onPress={() => (setError(null), setPaying({ paidOn: schoolToday(), mode: 'bank_transfer', reference: '', picking: null }))}
    />
  ) : undefined

  return (
    <MobileScreen
      refreshing={runs.isRefetching || run.isRefetching}
      onRefresh={() => (runs.refetch(), run.refetch())}
      nav={
        <NavBar
          title="Payroll"
          back={{ label: 'Back', onPress: router.back }}
          actions={[
            ...(canRun ? [{ icon: BadgeIndianRupee, label: 'Salaries', onPress: () => router.push('/salaries') }] : []),
            ...(menuActions.length ? [{ icon: Ellipsis, label: sharing ? 'Working…' : 'More', onPress: () => setMenu(true) }] : []),
          ]}
        />
      }
      actionBar={actionBar}
      overlay={
        <>
          <ActionSheet open={menu} onClose={() => setMenu(false)} title={data ? formatMonth(data.month) : 'Payroll'} actions={menuActions} />
          <ActionSheet open={starting} onClose={() => setStarting(false)} title="Run payroll for" actions={startable.map((value) => ({ label: formatMonth(value), onSelect: () => doStart(value) }))} />
          <Dialog
            open={Boolean(confirm)}
            onClose={() => setConfirm(null)}
            tone={confirm === 'finalize' ? 'default' : 'danger'}
            title={confirm === 'finalize' ? `Finalize ${data ? formatMonth(data.month) : ''}?` : confirm === 'reopen' ? 'Reopen as draft?' : 'Delete this draft?'}
            description={
              confirm === 'finalize'
                ? 'Payslips can’t be changed after this unless it is reopened.'
                : confirm === 'reopen'
                  ? data?.status === 'paid'
                    ? 'The salary expense recorded when it was paid is voided.'
                    : 'Payslips can be changed again.'
                  : 'The month’s payslips are removed. You can run it again.'
            }
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setConfirm(null)}>
                  Not now
                </MobileButton>
                <MobileButton variant={confirm === 'finalize' ? 'filled' : 'destructive'} loading={finalize.isPending || reopen.isPending || remove.isPending} onPress={doConfirm}>
                  {confirm === 'finalize' ? 'Finalize' : confirm === 'reopen' ? 'Reopen' : 'Delete'}
                </MobileButton>
              </>
            }
          />
          <BottomSheet
            open={Boolean(slip)}
            onClose={() => setSlip(null)}
            title={slip?.row.snapshot?.name ?? 'Payslip'}
            description={slip ? `Net ${formatINR(slip.row.net)} · ${slip.row.paidDays} days paid` : undefined}
            footer={
              <MobileButton fullWidth loading={edit.isPending} onPress={saveSlip}>
                Save
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            {slip ? (
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField
                  label="Unpaid days"
                  hint="Days away without paid leave."
                  type="number"
                  value={slip.lop}
                  onChangeText={(lop) => setSlip({ ...slip, lop: lop.replace(/[^0-9.]/g, '') })}
                  maxLength={4}
                  returnKeyType="next"
                />
                <MobileTextField
                  label="Arrears"
                  type="number"
                  prefix="₹"
                  value={slip.arrears}
                  onChangeText={(arrears) => setSlip({ ...slip, arrears: arrears.replace(/[^0-9.]/g, '') })}
                  maxLength={8}
                  returnKeyType="next"
                />
                <MobileTextField
                  label="Other deduction"
                  type="number"
                  prefix="₹"
                  value={slip.other}
                  onChangeText={(other) => setSlip({ ...slip, other: other.replace(/[^0-9.]/g, '') })}
                  maxLength={8}
                  returnKeyType="next"
                />
                <MobileTextField label="Note (optional)" value={slip.remarks} onChangeText={(remarks) => setSlip({ ...slip, remarks })} maxLength={200} />
              </View>
            ) : null}
          </BottomSheet>
          <BottomSheet
            open={Boolean(paying)}
            onClose={() => (paying?.picking ? setPaying({ ...paying, picking: null }) : setPaying(null))}
            title={paying?.picking === 'date' ? 'Paid on' : paying?.picking === 'mode' ? 'Paid by' : 'Mark paid'}
            description={paying?.picking ? undefined : data ? `${formatINR(data.totals.net)} · ${formatMonth(data.month)}` : undefined}
            footer={
              paying?.picking ? undefined : (
                <MobileButton fullWidth loading={pay.isPending} onPress={doPay}>
                  Mark paid
                </MobileButton>
              )
            }
          >
            {error && !paying?.picking ? (
              <Callout tone="danger" title="Not marked">
                {error}
              </Callout>
            ) : null}
            {paying?.picking === 'date' ? (
              <MonthPicker value={paying.paidOn} today={schoolToday()} onChange={(paidOn) => setPaying({ ...paying, paidOn, picking: null })} />
            ) : paying?.picking === 'mode' ? (
              <OptionList
                label="Paid by"
                value={paying.mode}
                onChange={(mode) => setPaying({ ...paying, mode, picking: null })}
                options={(Object.keys(MODE_LABELS) as PaymentMode[]).map((value) => ({ value, label: MODE_LABELS[value] }))}
              />
            ) : paying ? (
              <View style={{ gap: space['space-4'] }}>
                <ListGroup
                  items={[
                    { title: 'Paid on', value: formatDayKey(paying.paidOn, { weekday: 'short' }), onPress: () => setPaying({ ...paying, picking: 'date' }) },
                    { title: 'Paid by', value: MODE_LABELS[paying.mode], onPress: () => setPaying({ ...paying, picking: 'mode' }) },
                  ]}
                />
                <MobileTextField
                  label="Reference (optional)"
                  placeholder="UTR or cheque number"
                  value={paying.reference}
                  onChangeText={(reference) => setPaying({ ...paying, reference })}
                  maxLength={80}
                />
              </View>
            ) : null}
          </BottomSheet>
        </>
      }
    >
      {startError ? (
        <Callout tone="danger" title="Payroll didn’t start">
          {startError}
        </Callout>
      ) : null}
      {runs.isPending ? (
        <CardSkeleton rows={4} />
      ) : runs.isError ? (
        <LoadFailed what="Payroll" error={runs.error} onRetry={runs.refetch} />
      ) : !runs.data?.length ? (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Wallet}
            title="No payroll run yet"
            body={canRun ? 'Run a month: pay is worked out from each person’s salary.' : 'Months the accounts office runs show here to check.'}
          />
        </Surface>
      ) : (
        <>
          {runs.data.length > 1 ? (
            <ChipRail label="Month" value={month ?? ''} onChange={setPicked} items={runs.data.slice(0, 12).map((row) => ({ id: row.month, label: formatMonth(row.month) }))} />
          ) : null}
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
                footer={canRun && data.status === 'draft' ? 'Tap a person to change unpaid days, arrears or deductions.' : undefined}
                items={(data.payslips ?? [])
                  .slice()
                  .sort((a, b) => String(a.snapshot?.name).localeCompare(String(b.snapshot?.name)))
                  .map((row) => ({
                    title: row.snapshot?.name ?? row.staffKey,
                    subtitle: [row.snapshot?.designation, `${row.paidDays} days paid`, row.lopDays ? `${row.lopDays} unpaid` : null, row.arrears ? `arrears ${formatINR(row.arrears)}` : null]
                      .filter(Boolean)
                      .join(' · '),
                    value: formatINR(row.net),
                    lines: 2 as const,
                    onPress:
                      canRun && data.status === 'draft'
                        ? () => (
                            setError(null),
                            setSlip({
                              row,
                              lop: String(row.lopDays || ''),
                              arrears: row.arrears ? String(row.arrears) : '',
                              other: row.otherDeduction ? String(row.otherDeduction) : '',
                              remarks: row.remarks ?? '',
                            })
                          )
                        : undefined,
                  }))}
              />
            </>
          )}
        </>
      )}
    </MobileScreen>
  )
}
