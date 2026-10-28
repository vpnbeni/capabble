import { useRouter } from 'expo-router'
import { BarChart3 } from 'lucide-react-native'

import { classLabel, formatDate, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { decimal } from '@/services/libraryService'
import { useLibraryReports } from '@/staff/libraryQueries'
import { Hero, ListGroup, MobileScreen, NavBar } from '@/ui'

const COPY_STATUS: Record<string, string> = {
  available: 'On the shelf',
  issued: 'Out with readers',
  reserved: 'Kept for someone',
  inspection: 'Being checked',
  damaged: 'Damaged',
  lost: 'Lost',
  withdrawn: 'Withdrawn',
}

const FINE_STATUS: Record<string, string> = { open: 'Not paid', settled: 'Paid', waived: 'Waived' }

/** The library's reports (the website's Library → Reports): copies by status and value, overdue books, fines. */
export default function LibraryReportsScreen() {
  const router = useRouter()
  const reports = useLibraryReports()
  const inventory = reports.data?.inventory ?? []
  const copies = inventory.reduce((sum, row) => sum + row.copies, 0)
  const value = inventory.reduce((sum, row) => sum + (decimal(row.value) ?? 0), 0)

  return (
    <MobileScreen refreshing={reports.isRefetching} onRefresh={reports.refetch} nav={<NavBar title="Library reports" back={{ label: 'Library', onPress: router.back }} />}>
      {reports.isPending ? (
        <CardSkeleton rows={6} />
      ) : reports.isError || !reports.data ? (
        <LoadFailed what="Reports" error={reports.error} onRetry={reports.refetch} />
      ) : (
        <>
          <Hero tone="surface" icon={BarChart3} label="Copies" value={`${copies}`} detail={value ? `Worth ${formatINR(value)} at the prices entered` : 'No prices entered'} />
          <ListGroup
            header="By status"
            items={inventory.map((row) => ({
              title: COPY_STATUS[row._id] ?? row._id,
              subtitle: decimal(row.value) ? formatINR(decimal(row.value) ?? 0) : undefined,
              value: `${row.copies}`,
            }))}
          />
          <ListGroup
            header={`Overdue · ${reports.data.overdue.length}`}
            footer={reports.data.overdue.length > 40 ? `And ${reports.data.overdue.length - 40} more.` : reports.data.overdue.length ? undefined : 'No book is overdue.'}
            items={reports.data.overdue.slice(0, 40).map((loan) => ({
              title: loan.copyId?.titleId?.title ?? loan.copyId?.accessionNumber ?? 'Book',
              subtitle: [loan.memberId?.name, loan.memberId?.className ? classLabel(loan.memberId.className, loan.memberId.section) : null, `due ${formatDate(loan.dueAt)}`].filter(Boolean).join(' · '),
              lines: 2 as const,
            }))}
          />
          <ListGroup
            header="Fines"
            footer={reports.data.fines.length ? undefined : 'No fines yet.'}
            items={reports.data.fines.map((row) => ({
              title: FINE_STATUS[row._id] ?? row._id,
              subtitle: row._id === 'open' && decimal(row.outstanding) ? `${formatINR(decimal(row.outstanding) ?? 0)} to collect` : undefined,
              value: `${row.count}`,
            }))}
          />
        </>
      )}
    </MobileScreen>
  )
}
