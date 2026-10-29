import { useRouter } from 'expo-router'
import { CalendarDays, FileStack } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, schoolToday } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { centreService, leftOf, serialError, spoiltOf, type AnswerSheet } from '@/services/centreService'
import { useAnswerSheets, useCentrePapers, useDaySheets, useDiscardSerials, useSaveSerials } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { BottomSheet, Callout, ChipRail, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

type Tab = 'stock' | 'day'
type Sheet = { sheet: AnswerSheet; view: 'menu' | 'serials' | 'spoilt'; from: string; to: string; reason: string }

const nameOf = (sheet: AnswerSheet) => `${sheet.answerSheetType} · ${sheet.pages} pages · ${sheet.colour}`
const rangeOf = (sheet: AnswerSheet) => {
  const ranges = sheet.serialRanges?.length ? sheet.serialRanges : sheet.serialFrom ? [{ serialFrom: sheet.serialFrom, serialTo: sheet.serialTo ?? '' }] : []
  return ranges.map((range) => `${range.serialFrom}–${range.serialTo}`).join(', ')
}

/**
 * The centre's answer sheets (the website's Answer sheets): each kind by class with the serials
 * received and how many are used, spoilt and left; enter the serials received, mark a run of
 * serials spoilt, share a kind's consolidated record; and a day's sheets handed out per paper.
 * Supplementary sheets with several serial runs, and the spreadsheet import, stay on the website.
 */
export default function CentreAnswerSheetsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('exam.conduct.write')
  const sheets = useAnswerSheets()
  const papers = useCentrePapers()
  const saveSerials = useSaveSerials()
  const discard = useDiscardSerials()
  const [tab, setTab] = useState<Tab>('stock')
  const [open, setOpen] = useState<Sheet | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dates = [...new Set((papers.data ?? []).map((paper) => String(paper.examDate).slice(0, 10)))].sort()
  const today = schoolToday()
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const day = pickedDay ?? dates.find((key) => key >= today) ?? dates[dates.length - 1] ?? null
  const daySheets = useDaySheets(tab === 'day' ? day : null)

  const list = sheets.data ?? []
  const classes = [...new Set(list.map((sheet) => String(sheet.class)))].sort()

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const show = (sheet: AnswerSheet) => {
    setError(null)
    const first = sheet.serialRanges?.[0] ?? { serialFrom: sheet.serialFrom ?? '', serialTo: sheet.serialTo ?? '' }
    const received = Boolean(sheet._id && !sheet.isTemplate)
    setOpen({ sheet, view: received ? 'menu' : 'serials', from: first.serialFrom ?? '', to: first.serialTo ?? '', reason: '' })
  }

  const doSerials = async () => {
    if (!open) return
    const problem = serialError(open.from, open.to)
    if (problem) return setError(problem)
    try {
      await saveSerials.mutateAsync({ sheet: open.sheet, from: open.from, to: open.to })
      haptic.success()
      setOpen(null)
      toast(`${nameOf(open.sheet)} serials saved`)
    } catch (failure) {
      setError(fail(failure, "The serials weren't saved. Try again."))
    }
  }

  const doSpoilt = async () => {
    if (!open?.sheet._id) return
    const problem = serialError(open.from, open.to)
    if (problem) return setError(problem)
    if (!open.reason.trim()) return setError('Say why they were spoilt, like "torn" or "misprinted".')
    try {
      await discard.mutateAsync({ id: open.sheet._id, fromSerial: open.from, toSerial: open.to, reason: open.reason.trim() })
      haptic.success()
      setOpen(null)
      toast('Spoilt serials marked')
    } catch (failure) {
      setError(fail(failure, "They weren't marked. Try again."))
    }
  }

  const shareRecord = async (sheet: AnswerSheet) => {
    if (!sheet._id) return
    setOpen(null)
    try {
      const bytes = await centreService.sheetRecord(sheet._id)
      haptic.success()
      await sharePdf(bytes, `Answer sheet record class ${sheet.class} ${sheet.answerSheetType} ${sheet.pages} pages ${sheet.colour}.pdf`.replace(/[^a-zA-Z0-9 ._-]+/g, '-'))
    } catch (failure) {
      toast(fail(failure, "The record didn't download. Try again."), 'danger')
    }
  }

  const multiple = (sheet: AnswerSheet) => (sheet.serialRanges?.length ?? 0) > 1

  return (
    <MobileScreen
      refreshing={sheets.isRefetching}
      onRefresh={() => (sheets.refetch(), papers.refetch(), daySheets.refetch())}
      nav={<NavBar title="Answer sheets" back={{ label: 'Centre', onPress: router.back }} />}
      overlay={
        <BottomSheet
          open={Boolean(open)}
          onClose={() => (open && open.view !== 'menu' && open.sheet._id && !open.sheet.isTemplate ? setOpen({ ...open, view: 'menu' }) : setOpen(null))}
          title={open ? `Class ${open.sheet.class} · ${nameOf(open.sheet)}` : ''}
          description={
            open?.view === 'serials' ? 'The first and last serial in the packets received.' : open?.view === 'spoilt' ? 'A run of serials that can’t be used. One serial: the same in both.' : undefined
          }
          footer={
            open?.view === 'serials' ? (
              <MobileButton fullWidth loading={saveSerials.isPending} onPress={doSerials}>
                Save serials
              </MobileButton>
            ) : open?.view === 'spoilt' ? (
              <MobileButton fullWidth loading={discard.isPending} onPress={doSpoilt}>
                Mark spoilt
              </MobileButton>
            ) : undefined
          }
        >
          {!open ? null : open.view === 'menu' ? (
            <ListGroup
              items={[
                ...(canWrite && !multiple(open.sheet)
                  ? [{ title: 'Change the serials received', value: rangeOf(open.sheet), lines: 2 as const, chevron: true, onPress: () => (setError(null), setOpen({ ...open, view: 'serials' })) }]
                  : []),
                ...(canWrite
                  ? [
                      {
                        title: 'Mark serials spoilt',
                        subtitle: `${spoiltOf(open.sheet)} spoilt so far`,
                        chevron: true,
                        onPress: () => (setError(null), setOpen({ ...open, view: 'spoilt', from: '', to: '' })),
                      },
                    ]
                  : []),
                { title: 'Share the consolidated record', subtitle: 'Every serial used and spoilt, as a PDF', onPress: () => shareRecord(open.sheet) },
              ]}
            />
          ) : (
            <View style={{ gap: space['space-4'] }}>
              {error ? (
                <Callout tone="danger" title="Not saved">
                  {error}
                </Callout>
              ) : null}
              <MobileTextField label="First serial" value={open.from} onChangeText={(from) => setOpen({ ...open, from })} autoCapitalize="characters" maxLength={20} returnKeyType="next" />
              <MobileTextField label="Last serial" value={open.to} onChangeText={(to) => setOpen({ ...open, to })} autoCapitalize="characters" maxLength={20} />
              {open.view === 'spoilt' ? <MobileTextField label="Why" value={open.reason} onChangeText={(reason) => setOpen({ ...open, reason })} placeholder="Torn" maxLength={200} /> : null}
            </View>
          )}
        </BottomSheet>
      }
    >
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'stock', label: 'Stock' },
          { id: 'day', label: 'By exam day' },
        ]}
      />
      {tab === 'stock' ? (
        sheets.isPending ? (
          <CardSkeleton rows={6} />
        ) : sheets.isError ? (
          <LoadFailed what="Answer sheets" error={sheets.error} onRetry={sheets.refetch} />
        ) : list.length ? (
          classes.map((cls) => (
            <ListGroup
              key={cls}
              header={`Class ${cls}`}
              items={list
                .filter((sheet) => String(sheet.class) === cls)
                .map((sheet) => {
                  const received = Boolean(sheet._id && !sheet.isTemplate)
                  return {
                    title: nameOf(sheet),
                    subtitle: received ? `${rangeOf(sheet)} · ${sheet.used} used · ${spoiltOf(sheet)} spoilt · ${leftOf(sheet)} left` : 'Not received yet',
                    lines: 2 as const,
                    chevron: received || canWrite,
                    onPress: received || canWrite ? () => show(sheet) : undefined,
                  }
                })}
            />
          ))
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={FileStack} title="No answer sheets yet" body="Enter the serials as the packets arrive from the board." />
          </Surface>
        )
      ) : !dates.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={CalendarDays} title="No exam days yet" body="Exam days come from the board's datesheet." />
        </Surface>
      ) : (
        <>
          <ChipRail label="Exam day" value={day ?? ''} onChange={setPickedDay} items={dates.map((key) => ({ id: key, label: formatDayKey(key, { weekday: 'short' }) }))} />
          {daySheets.isPending ? (
            <CardSkeleton rows={4} />
          ) : daySheets.isError ? (
            <LoadFailed what="The day's answer sheets" error={daySheets.error} onRetry={daySheets.refetch} />
          ) : Object.keys(daySheets.data?.classes ?? {}).length ? (
            Object.entries(daySheets.data?.classes ?? {}).map(([cls, summary]) => (
              <ListGroup
                key={cls}
                header={`Class ${cls} · ${summary.totalAllocated} handed out`}
                items={summary.entries.map((entry) => ({
                  title: `${entry.subjectName} · ${entry.subjectCode}`,
                  subtitle: `${entry.answerSheetType} ${entry.pages} pages · ${entry.serialFrom}–${entry.serialTo} · ${entry.sheetsAllocated} for ${entry.candidateCount}`,
                  badge: entry.insufficientSheets ? { label: 'Short', tone: 'danger' as const } : undefined,
                  lines: 2 as const,
                }))}
              />
            ))
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={FileStack} title="Nothing handed out" body="Sheets are worked out for a day once the serials are in and the papers have candidates." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
