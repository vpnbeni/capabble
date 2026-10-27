import { useLocalSearchParams } from 'expo-router'

import { TargetTimetable } from '@/staff/MyTimetable'

/** One class's or one teacher's week from the published timetable. */
export default function TimetableViewScreen() {
  const { type, id, title } = useLocalSearchParams<{ type: 'class' | 'teacher'; id: string; title?: string }>()
  return <TargetTimetable target={{ type: type === 'teacher' ? 'teacher' : 'class', id }} title={title || 'Timetable'} />
}
