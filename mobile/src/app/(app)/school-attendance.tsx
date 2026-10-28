import { useRouter } from 'expo-router'
import { CalendarOff, ClipboardCheck } from 'lucide-react-native'
import { View } from 'react-native'

import { classLabel, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useAttendanceGlance, useRegisters } from '@/staff/queries'
import { space } from '@/theme/tokens'
import { Hero, ListGroup, MobileScreen, NavBar, ProgressRing, StatusView, Surface, Text } from '@/ui'

/**
 * Principal: today's student attendance for the school, then every class register, not marked
 * first. Only absences are recorded, so a class not marked counts everyone present until it is.
 */
export default function SchoolAttendanceScreen() {
  const router = useRouter()
  const today = schoolToday()
  const glance = useAttendanceGlance(today)
  const registers = useRegisters(today)
  const students = glance.data?.students
  const list = [...(registers.data?.registers ?? [])].sort((a, b) => Number(a.marked) - Number(b.marked))
  const notMarked = list.filter((register) => !register.marked).length
  const percent = students?.strength ? Math.round((students.todayPresent / students.strength) * 1000) / 10 : null
  const off = glance.data?.today && !glance.data.today.working

  return (
    <MobileScreen
      refreshing={glance.isRefetching || registers.isRefetching}
      onRefresh={() => {
        glance.refetch()
        registers.refetch()
      }}
      nav={<NavBar title="Attendance today" back={{ label: 'Today', onPress: router.back }} />}
    >
      {glance.isPending || registers.isPending ? (
        <CardSkeleton rows={4} />
      ) : glance.isError ? (
        <LoadFailed what="Today's attendance" error={glance.error} onRetry={glance.refetch} />
      ) : off ? (
        <Hero tone="surface" icon={CalendarOff} label="No school today" value={glance.data?.today.label || 'Day off'} />
      ) : (
        <>
          <Surface>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-4'] }}>
              <ProgressRing
                value={percent ?? 0}
                label={percent != null ? `${percent}%` : '—'}
                sublabel="present"
                size={96}
                ariaLabel={percent != null ? `${percent}% of students present today` : 'No students'}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" tone="muted">
                  {formatDayKey(today, { weekday: 'long' })}
                </Text>
                <Text variant="m-nav-title">{students ? `${students.todayPresent} of ${students.strength} students` : '—'}</Text>
                <Text variant="m-subhead" tone={notMarked ? 'warning' : 'muted'}>
                  {notMarked ? `${notMarked} ${notMarked === 1 ? 'register' : 'registers'} not marked yet` : 'Every register is marked'}
                </Text>
              </View>
            </View>
          </Surface>
          {list.length ? (
            <ListGroup
              header="Classes"
              footer="A class not marked counts everyone present until its teacher marks it."
              items={list.map((register) => ({
                title: classLabel(register.className, register.section),
                subtitle: register.marked ? `${register.absent} absent of ${register.students}` : `${register.students} ${register.students === 1 ? 'student' : 'students'}`,
                icon: ClipboardCheck,
                tile: 5 as const,
                badge: register.marked ? { label: 'Marked', tone: 'success' as const } : { label: 'Not marked', tone: 'warning' as const },
                onPress: register.canMark
                  ? () => router.push({ pathname: '/roll-call', params: { className: register.className, section: register.section, date: today } })
                  : undefined,
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={ClipboardCheck} title="No classes yet" body="Classes show here once students are added." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
