import { useRouter } from 'expo-router'
import { ClipboardCheck, FileText, FileUp } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { TEXT, pickDocument } from '@/lib/pickFile'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { centreService } from '@/services/centreService'
import { uploadService } from '@/services/uploadService'
import { useForm66Dates, useForm66Subjects } from '@/staff/centreQueries'
import { useStaff } from '@/staff/useStaff'
import { ChipRail, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

/**
 * Form 66 (the website's Form 66): import the board's Form 66 text file from Files, then the
 * attendance sheets by exam day as PDFs to print: the whole day or one subject. A file replaces
 * the records of the days it has.
 */
export default function CentreForm66Screen() {
  const router = useRouter()
  const toast = useToast()
  const dates = useForm66Dates()
  const list = dates.data ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked ?? list[list.length - 1] ?? null
  const subjects = useForm66Subjects(date)
  const [making, setMaking] = useState<string | null>(null)
  const staff = useStaff()
  const [importing, setImporting] = useState(false)

  const importFile = async () => {
    const picked = await pickDocument(TEXT)
    if (!picked) return
    setImporting(true)
    try {
      const result = await uploadService.form66(picked)
      haptic.success()
      await dates.refetch()
      toast(`${result.count ?? 0} candidates on ${result.dateCount ?? 0} ${result.dateCount === 1 ? 'day' : 'days'} imported`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "Form 66 wasn't imported. Try again.", 'danger')
    } finally {
      setImporting(false)
    }
  }

  const share = async (subjectCode?: string) => {
    if (!date || making) return
    setMaking(subjectCode ?? 'day')
    try {
      const bytes = await centreService.form66Pdf(date, subjectCode)
      haptic.success()
      await sharePdf(bytes, `Form 66 ${date}${subjectCode ? ` ${subjectCode}` : ''}.pdf`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "Form 66 didn't download. Try again.", 'danger')
    } finally {
      setMaking(null)
    }
  }

  const total = (subjects.data ?? []).reduce((sum, row) => sum + row.count, 0)

  return (
    <MobileScreen
      refreshing={dates.isRefetching || subjects.isRefetching}
      onRefresh={() => (dates.refetch(), subjects.refetch())}
      nav={
        <NavBar
          title="Form 66"
          back={{ label: 'Centre', onPress: router.back }}
          actions={staff.can('exam.conduct.write') ? [{ label: importing ? 'Importing…' : 'Import the board’s file', icon: FileUp, onPress: () => !importing && importFile() }] : undefined}
        />
      }
    >
      {dates.isPending ? (
        <CardSkeleton rows={4} />
      ) : dates.isError ? (
        <LoadFailed what="Form 66" error={dates.error} onRetry={dates.refetch} />
      ) : !list.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={ClipboardCheck} title="No Form 66 yet" body="Import the board's Form 66 text file with the button at the top." />
        </Surface>
      ) : (
        <>
          {/* The board writes days as 05.03.2027. */}
          <ChipRail label="Exam day" value={date ?? ''} onChange={setPicked} items={list.map((key) => ({ id: key, label: key }))} />
          {subjects.isPending ? (
            <CardSkeleton rows={4} />
          ) : subjects.isError ? (
            <LoadFailed what="Subjects" error={subjects.error} onRetry={subjects.refetch} />
          ) : (
            <ListGroup
              footer="The PDF opens in the share sheet: print it, save it or send it."
              items={[
                {
                  title: 'The whole day',
                  subtitle: `${total} ${total === 1 ? 'candidate' : 'candidates'}`,
                  icon: FileText,
                  tile: 5 as const,
                  value: making === 'day' ? 'Making…' : undefined,
                  chevron: making !== 'day',
                  onPress: () => share(),
                },
                ...(subjects.data ?? []).map((row) => ({
                  title: row.name ? `${row.name} · ${row.code}` : row.code,
                  subtitle: `${row.count} ${row.count === 1 ? 'candidate' : 'candidates'}`,
                  value: making === row.code ? 'Making…' : undefined,
                  chevron: making !== row.code,
                  onPress: () => share(row.code),
                })),
              ]}
            />
          )}
        </>
      )}
    </MobileScreen>
  )
}
