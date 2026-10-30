import { useRouter } from 'expo-router'
import { BookOpen } from 'lucide-react-native'
import { useState } from 'react'

import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useCoverage } from '@/staff/queries'
import { ChipRail, ListGroup, MobileScreen, NavBar, StatusView, Surface } from '@/ui'

/** How much of each subject's syllabus is taught, class by class (the website's Academics overview). */
export default function CoverageScreen() {
  const router = useRouter()
  const overview = useCoverage()
  const rows = overview.data?.coverage ?? []
  const classes = [...new Set(rows.map((row) => `${row.className}|${row.section}`))]
  const [picked, setPicked] = useState<string | null>(null)
  const current = picked ?? classes[0] ?? ''
  const shown = rows.filter((row) => `${row.className}|${row.section}` === current)
  const label = (key: string) => classLabel(...(key.split('|') as [string, string]))

  return (
    <MobileScreen refreshing={overview.isRefetching} onRefresh={overview.refetch} nav={<NavBar title="Syllabus covered" back={{ label: 'Back', onPress: router.back }} />}>
      {classes.length > 1 ? <ChipRail label="Class" value={current} onChange={setPicked} items={classes.map((key) => ({ id: key, label: label(key) }))} /> : null}
      {overview.isPending ? (
        <CardSkeleton rows={4} />
      ) : overview.isError ? (
        <LoadFailed what="Syllabus coverage" error={overview.error} onRetry={overview.refetch} />
      ) : shown.length ? (
        <ListGroup
          header={label(current)}
          footer="Topics move to covered when a lesson on them is marked taught."
          items={shown
            .sort((a, b) => a.percent - b.percent)
            .map((row) => ({
              title: row.subjectName,
              subtitle: `${row.covered} of ${row.total} topics`,
              value: `${Math.round(row.percent)}%`,
            }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={BookOpen} title="No syllabus published yet" body="Coverage shows here once a class's syllabus is published." />
        </Surface>
      )}
    </MobileScreen>
  )
}
