import { useQueryClient } from '@tanstack/react-query'
import { useRouter, type Href } from 'expo-router'
import { Building2, ClipboardCheck, DoorOpen, FileStack, FileUp, Printer, UserCheck } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { PDF, pickDocument } from '@/lib/pickFile'
import { uploadService } from '@/services/uploadService'
import { useCentreDetails, useCentrePapers, useExamRooms } from '@/staff/centreQueries'
import { staffKeys } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionSheet, ListGroup, MobileScreen, NavBar, haptic, useToast, type ListGroupItem } from '@/ui'

type BoardFile = 'datesheet' | 'candidates'

/**
 * The board exam centre (the website's Exam centre pages), for the centre superintendent: what the
 * centre is, its rooms, who sits in each room on a day, the answer sheets, and every printed form
 * (seating, stickers, dispatch slip, duty record, Form 66) as a PDF; and the board's datesheet and
 * candidate PDFs, picked from Files. The seating plan layout is designed on the website.
 */
export default function CentreScreen() {
  const router = useRouter()
  const staff = useStaff()
  const details = useCentreDetails()
  const rooms = useExamRooms()
  const papers = useCentrePapers()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<BoardFile | null>(null)
  const [importing, setImporting] = useState<BoardFile | null>(null)

  const importBoard = async (what: BoardFile) => {
    setAsking(null)
    const picked = await pickDocument(PDF)
    if (!picked) return
    setImporting(what)
    try {
      const message = what === 'datesheet' ? await uploadService.boardDatesheet(picked) : await uploadService.candidates(picked)
      haptic.success()
      await queryClient.invalidateQueries({ queryKey: staffKeys.all })
      toast(message || (what === 'datesheet' ? 'Datesheet imported' : 'Candidates imported'))
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The file wasn't imported. Try again.", 'danger')
    } finally {
      setImporting(null)
    }
  }

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

  const boardItems: ListGroupItem[] = [
    ...(staff.can('exam.setup.write') && staff.canUse('datesheets')
      ? [
          {
            title: 'Import the datesheet',
            subtitle: importing === 'datesheet' ? 'Reading the PDF…' : 'The board’s datesheet PDF',
            icon: FileUp,
            tile: 3 as const,
            lines: 2 as const,
            onPress: importing ? undefined : () => setAsking('datesheet'),
          },
        ]
      : []),
    ...(staff.can('exam.candidates.write') && staff.canUse('candidates')
      ? [
          {
            title: 'Import candidates',
            subtitle: importing === 'candidates' ? 'Reading the PDF…' : 'The board’s candidate list PDF',
            icon: FileUp,
            tile: 3 as const,
            lines: 2 as const,
            onPress: importing ? undefined : () => setAsking('candidates'),
          },
        ]
      : []),
  ]

  return (
    <MobileScreen
      refreshing={details.isRefetching || rooms.isRefetching || papers.isRefetching}
      onRefresh={() => (details.refetch(), rooms.refetch(), papers.refetch())}
      nav={<NavBar title="Board exam centre" back={{ label: 'Back', onPress: router.back }} />}
      overlay={
        <ActionSheet
          open={Boolean(asking)}
          onClose={() => setAsking(null)}
          title={asking === 'datesheet' ? 'Import the board’s datesheet?' : 'Import candidates?'}
          message={
            asking === 'datesheet'
              ? 'Choose the datesheet PDF from the board. It replaces the datesheet the centre has now.'
              : 'Choose the candidate list PDF from the board. Candidates already here are kept; new roll numbers are added.'
          }
          actions={[{ label: 'Choose the PDF', onSelect: () => asking && importBoard(asking) }]}
        />
      }
    >
      <ListGroup items={items} />
      {boardItems.length ? <ListGroup header="From the board" footer="PDFs from the board's portal, from Files, Drive or WhatsApp." items={boardItems} /> : null}
    </MobileScreen>
  )
}
