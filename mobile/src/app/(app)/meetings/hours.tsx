import { useLocalSearchParams } from 'expo-router'

import { MyHours } from '@/staff/MyHours'

/** A host's weekly meeting hours and days off: your own, or (`?hostId=`) a host's for the principal. */
export default function MeetingHoursScreen() {
  const { hostId } = useLocalSearchParams<{ hostId?: string }>()
  return <MyHours hostId={hostId} />
}
