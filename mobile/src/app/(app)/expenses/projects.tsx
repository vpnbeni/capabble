import { useRouter } from 'expo-router'
import { Building2, HandCoins, Hammer } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { InfraProject, ProjectStatus, ProjectType } from '@/services/expenseService'
import { MODE_LABELS, type PaymentMode } from '@/services/feeService'
import { usePayProject, useProjects, useSaveProject } from '@/staff/expenseQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

const STATUS: Record<ProjectStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  in_progress: { label: 'Under way', tone: 'info' },
  on_hold: { label: 'On hold', tone: 'warning' },
  completed: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}
const TYPES: Record<ProjectType, string> = {
  construction: 'Construction',
  renovation: 'Renovation',
  repair: 'Repair',
  furniture: 'Furniture',
  it_infra: 'IT and networking',
  landscaping: 'Grounds',
  other: 'Other',
}

type Sheet =
  | { kind: 'new'; title: string; type: ProjectType; vendor: string; budget: string; picking: boolean }
  | { kind: 'pay'; project: InfraProject; amount: string; mode: PaymentMode; reference: string; picking: boolean }
  | null

/**
 * Building projects (the website's Finance → Infrastructure): each with its budget and what has been
 * paid, add a project, record a payment against one (a capital expense), change its status.
 * Milestones and documents stay on the website.
 */
export default function ProjectsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canLog = staff.can('cpitl.finance.expense_log')
  const projects = useProjects()
  const save = useSaveProject()
  const pay = usePayProject()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [open, setOpen] = useState<InfraProject | null>(null)
  const [statusFor, setStatusFor] = useState<InfraProject | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    setError(failure instanceof ApiError ? failure.message : fallback)
  }

  const submit = async () => {
    if (!sheet) return
    try {
      if (sheet.kind === 'new') {
        if (!sheet.title.trim()) return setError('Enter what the project is.')
        await save.mutateAsync({ title: sheet.title.trim(), type: sheet.type, vendor: sheet.vendor.trim() || undefined, sanctionedBudget: Number(sheet.budget) || 0 })
        toast('Project added')
      } else {
        if (!(Number(sheet.amount) > 0)) return setError('Enter the amount paid.')
        await pay.mutateAsync({ id: sheet.project._id, input: { amount: Number(sheet.amount), mode: sheet.mode, date: schoolToday(), reference: sheet.reference.trim() || undefined } })
        toast(`${formatINR(Number(sheet.amount))} recorded for ${sheet.project.title}`)
      }
      haptic.success()
      setSheet(null)
    } catch (failure) {
      fail(failure, "It wasn't saved. Try again.")
    }
  }

  const setStatus = async (project: InfraProject, status: ProjectStatus) => {
    setStatusFor(null)
    try {
      await save.mutateAsync({ _id: project._id, status })
      haptic.success()
      toast(`${project.title}: ${STATUS[status].label.toLowerCase()}`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "That didn't save. Try again.", 'danger')
    }
  }

  const live = (projects.data ?? []).filter((row) => row.status !== 'completed' && row.status !== 'cancelled')

  return (
    <MobileScreen
      refreshing={projects.isRefetching}
      onRefresh={projects.refetch}
      nav={<NavBar title="Building projects" back={{ label: 'Expenses', onPress: router.back }} />}
      actionBar={canLog ? <ActionBar icon={Hammer} summary={`${live.length} under way or planned`} detail="Construction, repairs, furniture" label="Add a project" onPress={() => (setError(null), setSheet({ kind: 'new', title: '', type: 'construction', vendor: '', budget: '', picking: false }))} /> : undefined}
      overlay={
        <>
          <BottomSheet
            open={Boolean(sheet)}
            onClose={() => (sheet?.picking ? setSheet({ ...sheet, picking: false }) : setSheet(null))}
            title={sheet?.kind === 'pay' ? (sheet.picking ? 'Paid by' : `Pay for ${sheet.project.title}`) : sheet?.picking ? 'Kind' : 'Add a project'}
            description={sheet?.kind === 'pay' && !sheet.picking ? `${formatINR(sheet.project.spent ?? 0)} paid of ${formatINR(sheet.project.sanctionedBudget)}` : undefined}
            detent="large"
            footer={sheet?.picking ? undefined : <MobileButton fullWidth loading={save.isPending || pay.isPending} onPress={submit}>{sheet?.kind === 'pay' ? 'Record payment' : 'Add project'}</MobileButton>}
          >
            {sheet?.picking ? (
              sheet.kind === 'pay' ? (
                <OptionList label="Paid by" value={sheet.mode} onChange={(mode) => setSheet({ ...sheet, mode, picking: false })} options={(Object.keys(MODE_LABELS) as PaymentMode[]).map((value) => ({ value, label: MODE_LABELS[value] }))} />
              ) : (
                <OptionList label="Kind" value={sheet.type} onChange={(type) => setSheet({ ...sheet, type, picking: false })} options={(Object.keys(TYPES) as ProjectType[]).map((value) => ({ value, label: TYPES[value] }))} />
              )
            ) : sheet ? (
              <View style={{ gap: space['space-4'] }}>
                {error ? <Callout tone="danger" title="Not saved">{error}</Callout> : null}
                {sheet.kind === 'new' ? (
                  <>
                    <MobileTextField label="What it is" placeholder="New science lab" value={sheet.title} onChangeText={(title) => setSheet({ ...sheet, title })} maxLength={200} returnKeyType="next" />
                    <ListGroup items={[{ title: 'Kind', value: TYPES[sheet.type], onPress: () => setSheet({ ...sheet, picking: true }) }]} />
                    <MobileTextField label="Contractor (optional)" value={sheet.vendor} onChangeText={(vendor) => setSheet({ ...sheet, vendor })} maxLength={200} returnKeyType="next" />
                    <MobileTextField label="Budget (optional)" type="number" prefix="₹" value={sheet.budget} onChangeText={(budget) => setSheet({ ...sheet, budget: budget.replace(/[^0-9.]/g, '') })} maxLength={12} />
                  </>
                ) : (
                  <>
                    <MobileTextField label="Amount paid today" type="number" prefix="₹" value={sheet.amount} onChangeText={(amount) => setSheet({ ...sheet, amount: amount.replace(/[^0-9.]/g, '') })} maxLength={12} returnKeyType="next" />
                    <ListGroup items={[{ title: 'Paid by', value: MODE_LABELS[sheet.mode], onPress: () => setSheet({ ...sheet, picking: true }) }]} />
                    <MobileTextField label="Reference (optional)" placeholder="UTR or cheque number" value={sheet.reference} onChangeText={(reference) => setSheet({ ...sheet, reference })} maxLength={80} />
                  </>
                )}
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.title ?? ''}
            message={open ? [open.vendor, `${formatINR(open.spent ?? 0)} paid of ${formatINR(open.sanctionedBudget)}`].filter(Boolean).join(' · ') : undefined}
            actions={
              open
                ? [
                    { label: 'Record a payment', icon: HandCoins, onSelect: () => (setOpen(null), setError(null), setSheet({ kind: 'pay', project: open, amount: '', mode: 'bank_transfer', reference: '', picking: false })) },
                    { label: 'Change status', onSelect: () => (setOpen(null), setStatusFor(open)) },
                  ]
                : []
            }
          />
          <ActionSheet
            open={Boolean(statusFor)}
            onClose={() => setStatusFor(null)}
            title="Status"
            actions={statusFor ? (Object.keys(STATUS) as ProjectStatus[]).filter((value) => value !== statusFor.status).map((value) => ({ label: STATUS[value].label, onSelect: () => setStatus(statusFor, value) })) : []}
          />
        </>
      }
    >
      {projects.isPending ? (
        <CardSkeleton rows={4} />
      ) : projects.isError ? (
        <LoadFailed what="Projects" error={projects.error} onRetry={projects.refetch} />
      ) : projects.data?.length ? (
        <ListGroup
          items={projects.data.map((row) => ({
            title: row.title,
            subtitle: [TYPES[row.type], `${formatINR(row.spent ?? 0)} of ${formatINR(row.sanctionedBudget)}`, row.lastPayment ? `last paid ${formatDate(row.lastPayment)}` : null].filter(Boolean).join(' · '),
            lines: 2 as const,
            icon: Building2,
            tile: 3 as const,
            badge: STATUS[row.status],
            onPress: canLog ? () => setOpen(row) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Building2} title="No building projects" body="Construction, repairs and furniture projects with their budgets show here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
