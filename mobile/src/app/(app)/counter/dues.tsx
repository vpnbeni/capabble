import { useRouter } from 'expo-router'
import { IndianRupee, Phone } from 'lucide-react-native'
import { useState } from 'react'
import { Linking } from 'react-native'

import { classLabel, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useFeeStudents } from '@/staff/feeQueries'
import { ChipRail, Hero, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

/** Who owes what is due by the end of this month, by class, biggest first: open one or call the guardian. */
export default function DuesScreen() {
  const router = useRouter()
  const [cls, setCls] = useState('all')
  const students = useFeeStudents('', '')
  const owing = (students.data ?? []).filter((row) => row.dueNow > 0)
  const classes = [...new Set(owing.map((row) => row.class))].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
  const shown = owing.filter((row) => cls === 'all' || row.class === cls).sort((a, b) => b.dueNow - a.dueNow)
  const total = shown.reduce((sum, row) => sum + row.dueNow, 0)

  return (
    <MobileScreen refreshing={students.isRefetching} onRefresh={students.refetch} nav={<NavBar title="Dues" back={{ label: 'Counter', onPress: router.back }} />}>
      <Hero tone="surface" icon={IndianRupee} label="Due by the end of this month" value={formatINR(total)} detail={`${shown.length} ${shown.length === 1 ? 'student' : 'students'}`} />
      {classes.length > 1 ? (
        <ChipRail label="Class" value={cls} onChange={setCls} items={[{ id: 'all', label: 'All' }, ...classes.map((name) => ({ id: name, label: classLabel(name) }))]} />
      ) : null}
      {students.isPending ? (
        <CardSkeleton rows={5} />
      ) : students.isError ? (
        <LoadFailed what="Dues" error={students.error} onRetry={students.refetch} />
      ) : shown.length ? (
        <ListGroup
          footer={(students.data?.length ?? 0) >= 200 ? 'The first 200 students. Pick a class to see the rest.' : undefined}
          items={shown.map((row) => ({
            title: row.name,
            subtitle: `${classLabel(row.class, row.section)} · ${formatINR(row.dueNow)} due`,
            lines: 2,
            onPress: () => router.push({ pathname: '/counter/[id]', params: { id: row._id } }),
            accessory: row.guardianPhone ? (
              <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${row.fatherName || 'the guardian'} of ${row.name}`} onPress={() => Linking.openURL(`tel:${String(row.guardianPhone).replace(/\s+/g, '')}`)} />
            ) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={IndianRupee} title="Nothing due" body="Every student is paid up to this month." />
        </Surface>
      )}
    </MobileScreen>
  )
}
