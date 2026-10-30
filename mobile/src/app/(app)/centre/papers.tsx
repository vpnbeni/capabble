import { useRouter } from 'expo-router'
import { FileText, Printer } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey, schoolToday } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { centreService, type CentrePaper, type SeatingFormat } from '@/services/centreService'
import { useCentrePapers } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionSheet, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast, type SheetAction } from '@/ui'

type Print = SeatingFormat | 'dispatch'

const PRINTS: Record<Print, { label: string; file: string }> = {
  'main-gate': { label: 'Main gate list and roll number stickers', file: 'Main gate' },
  'room-folder-slip': { label: 'Invigilator slips', file: 'Invigilator slips' },
  'room-door-slip': { label: 'Room door slips', file: 'Room door slips' },
  'cbse-copy': { label: 'Seating plan for the board', file: 'Board seating plan' },
  dispatch: { label: 'Dispatch slip', file: 'Dispatch slip' },
}

const dayOf = (paper: CentrePaper) => String(paper.examDate).slice(0, 10)

/**
 * The board's papers at this centre (the website's Seating plan, Stickers and Dispatch slip pages):
 * each paper by day with its candidates and rooms, and its printed forms as PDFs to the share
 * sheet. Seating is worked out by the server from the rooms and the website's seating plan mode;
 * layouts are designed on the website.
 */
export default function CentrePapersScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const papers = useCentrePapers()
  const [chosen, setChosen] = useState<CentrePaper | null>(null)
  const [making, setMaking] = useState<string | null>(null)

  const canSeating = staff.canUse('seatingplan')
  const canDispatch = staff.canUse('dispatch_slip')
  const today = schoolToday()
  const list = [...(papers.data ?? [])].sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || a.class.localeCompare(b.class) || a.subjectCode.localeCompare(b.subjectCode))
  const upcoming = list.filter((paper) => dayOf(paper) >= today)
  const past = list.filter((paper) => dayOf(paper) < today)

  const print = async (paper: CentrePaper, what: Print) => {
    setMaking(paper._id)
    try {
      const bytes = what === 'dispatch' ? await centreService.dispatchSlip(paper._id) : await centreService.seatingPdf(paper._id, what)
      haptic.success()
      await sharePdf(bytes, `${PRINTS[what].file} ${dayOf(paper)} class ${paper.class} ${paper.subjectCode}.pdf`.replace(/[^a-zA-Z0-9 ._-]+/g, '-'))
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : `${PRINTS[what].label} didn't download. Try again.`, 'danger')
    } finally {
      setMaking(null)
    }
  }

  const actions: SheetAction[] = chosen
    ? (Object.keys(PRINTS) as Print[]).filter((what) => (what === 'dispatch' ? canDispatch : canSeating)).map((what) => ({ label: PRINTS[what].label, onSelect: () => print(chosen, what) }))
    : []

  const group = (header: string, rows: CentrePaper[]) =>
    rows.length ? (
      <ListGroup
        key={header}
        header={header}
        items={rows.map((paper) => ({
          title: `${paper.subjectName} · class ${paper.class}`,
          subtitle: `${formatDayKey(dayOf(paper), { weekday: 'short' })} · ${paper.subjectCode} · ${paper.candidateCount} ${paper.candidateCount === 1 ? 'candidate' : 'candidates'} · ${paper.roomsNeeded} ${paper.roomsNeeded === 1 ? 'room' : 'rooms'}`,
          icon: FileText,
          tile: 6 as const,
          lines: 2 as const,
          value: making === paper._id ? 'Making…' : undefined,
          chevron: making !== paper._id,
          onPress: making ? undefined : () => setChosen(paper),
        }))}
      />
    ) : null

  return (
    <MobileScreen
      refreshing={papers.isRefetching}
      onRefresh={papers.refetch}
      nav={<NavBar title="Papers and printing" back={{ label: 'Centre', onPress: router.back }} />}
      overlay={
        <ActionSheet
          open={Boolean(chosen)}
          onClose={() => setChosen(null)}
          title={chosen ? `${chosen.subjectName} · class ${chosen.class}` : ''}
          message="The PDF opens in the share sheet: print it, save it or send it."
          actions={actions}
        />
      }
    >
      {papers.isPending ? (
        <CardSkeleton rows={5} />
      ) : papers.isError ? (
        <LoadFailed what="Papers" error={papers.error} onRetry={papers.refetch} />
      ) : !list.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Printer} title="No papers yet" body="Papers come from the board's datesheet and candidate lists, imported on the website." />
        </Surface>
      ) : (
        <>
          {group('Coming up', upcoming)}
          {group('Done', past.reverse())}
        </>
      )}
    </MobileScreen>
  )
}
