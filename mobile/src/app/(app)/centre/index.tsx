import { useRouter, type Href } from 'expo-router'
import { Building2, ClipboardCheck, DoorOpen, FileStack, Printer, UserCheck } from 'lucide-react-native'

import { useStaff } from '@/staff/useStaff'
import { useCentreDetails, useCentrePapers, useExamRooms } from '@/staff/centreQueries'
import { ListGroup, MobileScreen, NavBar, type ListGroupItem } from '@/ui'

/**
 * The board exam centre (the website's Exam centre pages), for the centre superintendent: what the
 * centre is, its rooms, who sits in each room on a day, the answer sheets, and every printed form
 * (seating, stickers, dispatch slip, duty record, Form 66) as a PDF. Importing the board's
 * datesheet, candidates and Form 66 needs a file and stays on the website until the app can pick one.
 */
export default function CentreScreen() {
  const router = useRouter()
  const staff = useStaff()
  const details = useCentreDetails()
  const rooms = useExamRooms()
  const papers = useCentrePapers()

  const setup = staff.can('exam.setup.read')
  const conduct = staff.can('exam.conduct.read')
  const duties = staff.can('exam.duties.read')
  const centreName = details.data?.centreName || details.data?.centreNo
  const roomCount = rooms.data?.length ?? 0
  const paperCount = papers.data?.length ?? 0
  const dates = new Set((papers.data ?? []).map((paper) => String(paper.examDate).slice(0, 10))).size

  const go = (path: Href) => () => router.push(path)
  const items: ListGroupItem[] = [
    ...(setup && staff.canUse('centre_details')
      ? [
          {
            title: 'Centre details',
            subtitle: centreName ? `${centreName}${details.data?.centreNo ? ` · No. ${details.data.centreNo}` : ''}` : 'Number, superintendent, packing and dispatch',
            icon: Building2,
            tile: 3 as const,
            lines: 2 as const,
            chevron: true,
            onPress: go('/centre/details'),
          },
        ]
      : []),
    ...(conduct && staff.canUse('examrooms')
      ? [
          {
            title: 'Rooms',
            subtitle: rooms.data ? `${roomCount} ${roomCount === 1 ? 'room' : 'rooms'} · ${rooms.data.reduce((sum, room) => sum + (room.capacity || 0), 0)} seats` : 'Exam rooms and their seats',
            icon: DoorOpen,
            tile: 2 as const,
            lines: 2 as const,
            chevron: true,
            onPress: go('/centre/rooms'),
          },
        ]
      : []),
    ...(duties && staff.canUse('duties')
      ? [{ title: 'Room duties', subtitle: 'Who invigilates each room on a day', icon: UserCheck, tile: 1 as const, lines: 2 as const, chevron: true, onPress: go('/centre/duties') }]
      : []),
    ...(conduct && (staff.canUse('seatingplan') || staff.canUse('dispatch_slip'))
      ? [
          {
            title: 'Papers and printing',
            subtitle: papers.data
              ? `${paperCount} ${paperCount === 1 ? 'paper' : 'papers'} on ${dates} ${dates === 1 ? 'day' : 'days'} · seating, stickers, dispatch`
              : 'Seating, stickers and dispatch slips',
            icon: Printer,
            tile: 6 as const,
            lines: 2 as const,
            chevron: true,
            onPress: go('/centre/papers'),
          },
        ]
      : []),
    ...(conduct && staff.canUse('answersheets')
      ? [{ title: 'Answer sheets', subtitle: 'Serials received, used and spoilt', icon: FileStack, tile: 4 as const, lines: 2 as const, chevron: true, onPress: go('/centre/answer-sheets') }]
      : []),
    ...(conduct && staff.canUse('form66')
      ? [{ title: 'Form 66', subtitle: 'Attendance sheets by day and subject', icon: ClipboardCheck, tile: 5 as const, lines: 2 as const, chevron: true, onPress: go('/centre/form66') }]
      : []),
  ]

  return (
    <MobileScreen
      refreshing={details.isRefetching || rooms.isRefetching || papers.isRefetching}
      onRefresh={() => (details.refetch(), rooms.refetch(), papers.refetch())}
      nav={<NavBar title="Board exam centre" back={{ label: 'Back', onPress: router.back }} />}
    >
      <ListGroup items={items} footer="Importing the board's datesheet, candidates and Form 66 files is done on the website." />
    </MobileScreen>
  )
}
