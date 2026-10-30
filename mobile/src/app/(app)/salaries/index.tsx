import { useRouter } from 'expo-router'
import { Settings2, TrendingUp, Wallet } from 'lucide-react-native'
import { useState } from 'react'

import { formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useStaffSalaries } from '@/staff/salaryQueries'
import { useStaff } from '@/staff/useStaff'
import { Hero, ListGroup, MobileScreen, NavBar, SearchBar, SegmentedControl, StatusView, Surface } from '@/ui'

type Show = 'all' | 'missing'

/**
 * Salary structures (the website's Finance → Salaries): everyone on the staff list with their
 * take-home pay, or that no salary is set. Tap someone to set their pay lines; raise several at
 * once, or change PF, ESI and PT, from the bar.
 */
export default function SalariesScreen() {
  const router = useRouter()
  const staff = useStaff()
  const list = useStaffSalaries()
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const canEdit = staff.can('cpitl.finance.payroll')

  const rows = list.data ?? []
  const set = rows.filter((row) => row.salary)
  const monthly = set.reduce((sum, row) => sum + (row.salary?.gross ?? 0), 0)
  const shown = rows
    .filter((row) => show === 'all' || !row.salary)
    .filter((row) => !query.trim() || `${row.name} ${row.designation ?? ''} ${row.employeeId ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={
        <NavBar
          title="Salaries"
          back={{ label: 'Payroll', onPress: router.back }}
          actions={
            canEdit
              ? [
                  { icon: TrendingUp, label: 'Raise several', onPress: () => router.push('/salaries/revise') },
                  { icon: Settings2, label: 'PF, ESI and pay lines', onPress: () => router.push('/salaries/settings') },
                ]
              : []
          }
        />
      }
    >
      {list.isPending ? (
        <CardSkeleton rows={6} />
      ) : list.isError ? (
        <LoadFailed what="Salaries" error={list.error} onRetry={list.refetch} />
      ) : (
        <>
          <Hero label="Gross pay a month" value={formatINR(monthly)} detail={`${set.length} of ${rows.length} people have a salary`} icon={Wallet} tone="surface" />
          <SegmentedControl
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'missing', label: `No salary (${rows.length - set.length})` },
            ]}
          />
          {rows.length > 12 ? <SearchBar label="Search staff" placeholder="Name, designation or ID" value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
          {shown.length ? (
            <ListGroup
              items={shown.map((row) => ({
                title: row.name,
                subtitle: row.salary ? `${row.designation ? `${row.designation} · ` : ''}gross ${formatINR(row.salary.gross)}` : row.designation || undefined,
                value: row.salary ? formatINR(row.salary.net) : 'No salary',
                lines: 2 as const,
                chevron: canEdit,
                onPress: canEdit ? () => router.push({ pathname: '/salaries/[id]', params: { id: row.teacherId } }) : undefined,
              }))}
              footer="Take-home pay for a full month."
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Wallet} title={show === 'missing' ? 'Everyone has a salary' : 'Nobody matches'} />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
