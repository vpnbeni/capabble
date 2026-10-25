import { useRouter } from 'expo-router'
import { ExternalLink, Wallet } from 'lucide-react-native'

import { classLabel, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useFeesGlance } from '@/staff/queries'
import { openWebsite } from '@/staff/useStaff'
import { Hero, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

/** Principal: this session's fee collection, then each class with what is still due. Read-only. */
export default function FeeCollectionScreen() {
  const router = useRouter()
  const fees = useFeesGlance()
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
          <StatusView compact kind="empty" icon={Wallet} title="No fees set for this session" body="Fee structures are set on the website." />
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
          <MobileButton variant="gray" size="medium" icon={ExternalLink} onPress={() => openWebsite('/cpitl/collection')}>
            Open fees on the website
          </MobileButton>
        </>
      )}
    </MobileScreen>
  )
}
