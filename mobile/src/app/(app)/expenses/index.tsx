import { useRouter } from 'expo-router'
import { Building2, CalendarRange, Ellipsis, Fuel, Receipt, Wallet, Zap } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { dayKeyAdd, formatDate, formatINR, formatMonth, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Expense } from '@/services/expenseService'
import { MODE_LABELS } from '@/services/feeService'
import { useExpenseCategories, useExpenses, useVoidExpense } from '@/staff/expenseQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, Dialog, Hero, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

const KIND_LABELS: Record<string, string> = { operating: 'Expense', fuel: 'Fuel', electricity: 'Electricity', salary: 'Salary', infra: 'Building work' }
const monthStart = (key: string) => `${key.slice(0, 7)}-01`
const monthEnd = (start: string) => dayKeyAdd(dayKeyAdd(start, 32).slice(0, 8) + '01', -1)

/** What the school spent, a month at a time: record an expense or a fuel fill, void a wrong one. */
export default function ExpensesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const [month, setMonth] = useState(monthStart(schoolToday()))
  const end = monthEnd(month)
  const expenses = useExpenses(month, end)
  const categories = useExpenseCategories()
  const voidIt = useVoidExpense()
  const [open, setOpen] = useState<Expense | null>(null)
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const [reason, setReason] = useState('')
  const [picking, setPicking] = useState(false)
  const [menu, setMenu] = useState(false)
  const more = [
    ...(staff.canUse('cpitl_expenses') ? [{ label: 'Electricity', icon: Zap, onSelect: () => (setMenu(false), router.push('/expenses/electricity')) }] : []),
    ...(staff.canUse('cpitl_expenses') ? [{ label: 'Building projects', icon: Building2, onSelect: () => (setMenu(false), router.push('/expenses/projects')) }] : []),
    ...(staff.canUse('cpitl_payroll') && staff.can('cpitl.finance.payroll') ? [{ label: 'Payroll', icon: Wallet, onSelect: () => (setMenu(false), router.push('/payroll')) }] : []),
  ]
  // The last twelve months, this one first.
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${monthStart(schoolToday())}T00:00:00Z`)
    date.setUTCMonth(date.getUTCMonth() - index)
    return date.toISOString().slice(0, 10)
  })
  const rows = expenses.data ?? []
  const total = rows.filter((row) => row.status === 'valid').reduce((sum, row) => sum + row.amount, 0)
  const valid = rows.filter((row) => row.status === 'valid').length
  const categoryName = (id?: string | null) => categories.data?.find((row) => row._id === id)?.name
  const canLog = staff.can('cpitl.finance.expense_log')

  const confirmVoid = async () => {
    if (!voiding) return
    if (!reason.trim()) {
      haptic.error()
      toast('Write why it is voided', 'danger')
      return
    }
    try {
      await voidIt.mutateAsync({ id: voiding._id, reason: reason.trim() })
      haptic.medium()
      toast('Expense voided')
      setVoiding(null)
      setReason('')
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "It wasn't voided. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={expenses.isRefetching}
      onRefresh={expenses.refetch}
      nav={
        <NavBar
          title="Expenses"
          back={{ label: 'Back', onPress: router.back }}
          actions={[{ icon: CalendarRange, label: 'Choose month', onPress: () => setPicking(true) }, ...(more.length ? [{ icon: Ellipsis, label: 'More', onPress: () => setMenu(true) }] : [])]}
        />
      }
      actionBar={canLog ? <ActionBar icon={Receipt} summary={formatINR(total)} detail={formatMonth(month.slice(0, 7))} label="Record an expense" onPress={() => router.push('/expenses/new')} /> : undefined}
      overlay={
        <>
          <ActionSheet open={menu} onClose={() => setMenu(false)} title="Finance" actions={more} />
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open ? `${open.title || KIND_LABELS[open.kind] || 'Expense'} · ${formatINR(open.amount)}` : ''}
            message={open ? [open.payee, formatDate(open.date), open.mode ? MODE_LABELS[open.mode as keyof typeof MODE_LABELS] : null, open.reference].filter(Boolean).join(' · ') : undefined}
            actions={
              open && open.status === 'valid' && staff.can('cpitl.finance.expense_void') && open.kind === 'operating'
                ? [{ label: 'Void expense', tone: 'danger' as const, onSelect: () => (setOpen(null), setVoiding(open)) }]
                : []
            }
          />
          <ActionSheet
            open={picking}
            onClose={() => setPicking(false)}
            title="Month"
            actions={months.map((value) => ({ label: formatMonth(value.slice(0, 7)), onSelect: () => (setMonth(value), setPicking(false)) }))}
          />
          <Dialog
            open={Boolean(voiding)}
            onClose={() => setVoiding(null)}
            tone="danger"
            title="Void this expense?"
            description="It stays in the log, crossed out, with your reason."
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setVoiding(null)}>
                  Keep it
                </MobileButton>
                <MobileButton variant="destructive" loading={voidIt.isPending} onPress={confirmVoid}>
                  Void
                </MobileButton>
              </>
            }
          >
            <MobileTextField label="Reason" value={reason} onChangeText={setReason} placeholder="Entered twice, wrong amount…" maxLength={300} />
          </Dialog>
        </>
      }
    >
      <Hero tone="surface" icon={Receipt} label={`Spent in ${formatMonth(month.slice(0, 7))}`} value={formatINR(total)} detail={valid === 1 ? '1 entry' : `${valid} entries`} />
      {expenses.isPending ? (
        <CardSkeleton rows={4} />
      ) : expenses.isError ? (
        <LoadFailed what="Expenses" error={expenses.error} onRetry={expenses.refetch} />
      ) : rows.length ? (
        <ListGroup
          footer="Salaries, electricity bills and building work come from payroll and the website's finance pages."
          items={rows.map((row) => ({
            title: row.title || row.payee || KIND_LABELS[row.kind] || 'Expense',
            subtitle: [formatDate(row.date), categoryName(row.categoryId) ?? KIND_LABELS[row.kind], row.status === 'void' ? `Voided: ${row.voidReason ?? ''}` : null].filter(Boolean).join(' · '),
            value: formatINR(row.amount),
            icon: row.kind === 'fuel' ? Fuel : Receipt,
            tile: 3,
            lines: 2,
            badge: row.status === 'void' ? { label: 'Void', tone: 'neutral' as const } : undefined,
            onPress: () => setOpen(row),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Receipt} title="Nothing recorded this month" body={canLog ? 'Record a bill or a fuel fill as it is paid.' : 'Expenses the accounts office records show here.'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
