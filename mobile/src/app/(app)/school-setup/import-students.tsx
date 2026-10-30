import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { FileSpreadsheet, FileUp } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { SPREADSHEET, pickDocument } from '@/lib/pickFile'
import { shareBytes } from '@/lib/sharePdf'
import { uploadService, type StudentImportResult } from '@/services/uploadService'
import { staffKeys } from '@/staff/queries'
import { ActionBar, Callout, ListGroup, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Students from a spreadsheet (the website's Students → Import): get the template, fill it on a
 * computer or in Sheets, choose it from Files. New admission numbers are added, existing ones
 * updated; the result says what happened to each row that didn't go in.
 */
export default function ImportStudentsScreen() {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<StudentImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const template = async () => {
    try {
      await shareBytes(await uploadService.studentsTemplate(), 'Student import template.xlsx', XLSX)
    } catch (failure) {
      toast(failure instanceof ApiError ? failure.message : "The template didn't download. Try again.", 'danger')
    }
  }

  const choose = async () => {
    const picked = await pickDocument(SPREADSHEET)
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const done = await uploadService.students(picked)
      haptic.success()
      setResult(done)
      await queryClient.invalidateQueries({ queryKey: staffKeys.all })
    } catch (failure) {
      haptic.error()
      setResult(null)
      setError(failure instanceof ApiError ? failure.message : "The spreadsheet wasn't imported. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="Import students" back={{ label: 'Setup', onPress: router.back }} />}
      actionBar={
        <ActionBar icon={FileUp} summary="A filled template" detail="From Files, Drive or WhatsApp" label={busy ? 'Importing…' : 'Choose the spreadsheet'} onPress={() => !busy && choose()} />
      }
    >
      {error ? (
        <Callout tone="danger" title="Not imported">
          {error}
        </Callout>
      ) : null}
      <ListGroup
        header="1. The template"
        footer="Keep the column headings as they are. One row per student."
        items={[{ title: 'Get the template', subtitle: 'A spreadsheet to share to a computer or open in Sheets', icon: FileSpreadsheet, tile: 4, lines: 2, onPress: template }]}
      />
      {result ? (
        <>
          <ListGroup
            header="Imported"
            items={[
              { title: 'Added', value: String(result.created) },
              { title: 'Updated', value: String(result.updated) },
              { title: 'Skipped', value: String(result.skipped) },
              ...(result.errors.length ? [{ title: 'Not read', value: String(result.errors.length) }] : []),
            ]}
          />
          {result.errors.length ? (
            <ListGroup header="Rows not read" items={result.errors.slice(0, 50).map((row) => ({ title: row.row ? `Row ${row.row}` : 'A row', subtitle: row.message, lines: 3 }))} />
          ) : null}
        </>
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={FileUp} title="2. Choose the filled spreadsheet" body="What was added, updated and skipped shows here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
