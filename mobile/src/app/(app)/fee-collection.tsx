import { useRouter } from 'expo-router'
import { IndianRupee, TriangleAlert, Wallet } from 'lucide-react-native'

import { classLabel, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useFeesGlance } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { Hero, ListGroup, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

/** Principal: this session's fee collection, then each class with what is still due; the counter and dues from here. */
export default function FeeCollectionScreen() {
  const router = useRouter()
  const fees = useFeesGlance()
  const staff = useStaff()
  const data = fees.data
  const rate = data ? Math.round(data.totals.collectionRate) : 0
  const classes = [...(data?.byClass ?? [])].sort((a, b) => b.pending - a.pending)

  return (
    <MobileScreen
      refreshing={fees.isRefetching}
      onRefresh={fees.refetch}
      nav={<NavBar title="Fee collection" back={{ label: 'Today', onPress: router.back }} />}
    >
      {fees.isPending ? (
        <CardSkeleton rows={4} />
      ) : fees.isError ? (
        <LoadFailed what="Fee collection" error={fees.error} onRetry={fees.refetch} />
      ) : !data?.totals.expected ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Wallet} title="No fees set for this session" body="Dues show here once the accounts office sets the fee structures." />
        </Surface>
      ) : (
        <>
          <Hero
            tone="surface"
            icon={Wallet}
            label="Collected this session"
            value={formatINR(data.totals.collected, { compact: true })}
            detail={`${formatINR(data.totals.pending, { compact: true })} still due${data.totals.overdue ? `, ${formatINR(data.totals.overdue, { compact: true })} overdue` : ''}`}
            meta={`${rate}% of ${formatINR(data.totals.expected, { compact: true })}`}
            progress={rate}
            ariaLabel={`${formatINR(data.totals.collected)} collected, ${rate}% of ${formatINR(data.totals.expected)}. ${formatINR(data.totals.pending)} still due.`}
          />
          <ListGroup
            header="By class"
            items={classes.map((row) => ({
              title: classLabel(row.class),
              subtitle: row.defaulters ? `${row.defaulters} of ${row.students} ${row.students === 1 ? 'student' : 'students'} overdue` : `${row.students} ${row.students === 1 ? 'student' : 'students'}, none overdue`,
              value: row.pending ? `${formatINR(row.pending, { compact: true })} due` : 'Paid',
              badge: row.overdue ? { label: 'Overdue', tone: 'danger' as const } : undefined,
            }))}
          />
          {staff.canUse('cpitl_fees') ? (
            <ListGroup
              items={[
                { title: 'Fee counter', subtitle: 'Find a student, take a payment, share a receipt', icon: IndianRupee, tile: 3, onPress: () => router.push('/counter') },
                { title: 'Dues', subtitle: 'Who owes what, by class', icon: TriangleAlert, tile: 3, onPress: () => router.push('/counter/dues') },
              ]}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
