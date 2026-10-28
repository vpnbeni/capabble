import { useRouter } from 'expo-router'
import { ClipboardCheck, ScanLine } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatRelative, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Stocktake } from '@/services/libraryService'
import { useCheckCopy, useCloseStocktake, useStartStocktake, useStocktakes } from '@/staff/libraryQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, Callout, Dialog, Hero, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Surface, haptic, useToast, type MobileTextFieldRef } from '@/ui'

const tally = (stocktake: Stocktake) => ({
  total: stocktake.items.length,
  found: stocktake.items.filter((item) => item.state === 'verified').length,
  missing: stocktake.items.filter((item) => item.state === 'missing').length,
})

/**
 * Checking the shelves (the website's Library → Stocktake): start one, type each copy's accession
 * number as you find it (scanning waits for the camera build), then close it: copies not found go
 * on its missing list (the copies themselves don't change).
 */
export default function StocktakeScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canManage = staff.can('libry.stocktake.manage')
  const stocktakes = useStocktakes()
  const start = useStartStocktake()
  const check = useCheckCopy()
  const close = useCloseStocktake()
  const field = useRef<MobileTextFieldRef>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'start' | 'close' | null>(null)
  const [name, setName] = useState('')

  const list = stocktakes.data ?? []
  const current = list.find((row) => row.status === 'open')
  const lastClosed = list.find((row) => row.status === 'closed')
  const counts = current ? tally(current) : null
  const recent = current ? current.items.filter((item) => item.state === 'verified' && item.scannedAt).sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt))).slice(0, 8) : []

  const found = async () => {
    const value = code.trim()
    if (!current || !value) return
    const already = current.items.find((item) => item.accessionNumber === value && item.state === 'verified')
    if (already) {
      haptic.error()
      setError(`${value} is already counted.`)
      return
    }
    try {
      await check.mutateAsync({ id: current._id, code: value })
      haptic.light()
      setCode('')
      setError(null)
      field.current?.focus()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? (failure.status === 404 ? `${value} isn't in the library's copies. Check the number.` : failure.message) : "It wasn't counted. Try again.")
    }
  }

  const act = async () => {
    try {
      if (confirm === 'start') {
        await start.mutateAsync(name.trim() || `Stocktake ${formatDayKey(schoolToday(), { year: true })}`)
        toast('Stocktake started')
      } else if (current) {
        const missing = (counts?.total ?? 0) - (counts?.found ?? 0)
        await close.mutateAsync(current._id)
        toast(missing ? `Closed. ${missing} ${missing === 1 ? 'copy' : 'copies'} not found.` : 'Closed. Every copy was found.')
      }
      haptic.success()
      setConfirm(null)
    } catch (failure) {
      haptic.error()
      setConfirm(null)
      toast(failure instanceof ApiError ? failure.message : "That didn't work. Try again.", 'danger')
    }
  }

  const missingList = lastClosed?.items.filter((item) => item.state === 'missing') ?? []

  return (
    <MobileScreen
      refreshing={stocktakes.isRefetching}
      onRefresh={stocktakes.refetch}
      nav={<NavBar title="Stocktake" back={{ label: 'Library', onPress: router.back }} />}
      actionBar={
        !canManage || stocktakes.isPending ? undefined : current ? (
          <ActionBar icon={ClipboardCheck} summary={`${counts?.found ?? 0} of ${counts?.total ?? 0} found`} detail="Close when the shelves are done" label="Close stocktake" onPress={() => setConfirm('close')} />
        ) : (
          <ActionBar icon={ScanLine} summary="Count every copy on the shelves" detail={lastClosed ? `Last: ${formatDate(lastClosed.closedAt ?? lastClosed.createdAt)}` : undefined} label="Start a stocktake" onPress={() => (setName(''), setConfirm('start'))} />
        )
      }
      overlay={
        <Dialog
          open={Boolean(confirm)}
          onClose={() => setConfirm(null)}
          tone={confirm === 'close' ? 'danger' : 'default'}
          title={confirm === 'start' ? 'Start a stocktake?' : 'Close the stocktake?'}
          description={
            confirm === 'start'
              ? 'Every copy the library has goes on the list to find.'
              : `${(counts?.total ?? 0) - (counts?.found ?? 0)} copies not found go on its missing list. Nothing more can be counted after.`
          }
          footer={
            <>
              <MobileButton variant="gray" onPress={() => setConfirm(null)}>
                Not now
              </MobileButton>
              <MobileButton variant={confirm === 'close' ? 'destructive' : 'filled'} loading={start.isPending || close.isPending} onPress={act}>
                {confirm === 'start' ? 'Start' : 'Close'}
              </MobileButton>
            </>
          }
        >
          {confirm === 'start' ? <MobileTextField label="Name (optional)" placeholder={`Stocktake ${formatDayKey(schoolToday(), { year: true })}`} value={name} onChangeText={setName} maxLength={200} /> : null}
        </Dialog>
      }
    >
      {stocktakes.isPending ? (
        <CardSkeleton rows={4} />
      ) : stocktakes.isError ? (
        <LoadFailed what="Stocktakes" error={stocktakes.error} onRetry={stocktakes.refetch} />
      ) : current && counts ? (
        <>
          <Hero
            tone="soft"
            icon={ClipboardCheck}
            label={current.name}
            value={`${counts.total - counts.found} to find`}
            detail={`${counts.found} of ${counts.total} found · started ${formatRelative(current.createdAt).toLowerCase()}`}
            progress={counts.total ? counts.found / counts.total : 0}
          />
          {canManage ? (
            <Surface>
              <View style={{ gap: space['space-3'] }}>
                {error ? (
                  <Callout tone="danger" title="Not counted">
                    {error}
                  </Callout>
                ) : null}
                <MobileTextField
                  ref={field}
                  label="Accession number"
                  hint="Type the number on each copy you find, then Found."
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  maxLength={40}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={found}
                />
                <MobileButton variant="tinted" fullWidth loading={check.isPending} onPress={found}>
                  Found
                </MobileButton>
              </View>
            </Surface>
          ) : null}
          {recent.length ? (
            <ListGroup header="Just found" items={recent.map((item) => ({ title: item.accessionNumber, value: item.scannedAt ? formatRelative(item.scannedAt) : undefined }))} />
          ) : null}
        </>
      ) : (
        <>
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={ScanLine} title="No stocktake going on" body={canManage ? 'Start one to count the shelves. When you close it, copies not found are listed as missing.' : 'The librarian starts stocktakes.'} />
          </Surface>
          {lastClosed ? (
            <ListGroup
              header={`Missing after ${lastClosed.name}`}
              footer={missingList.length > 30 ? `And ${missingList.length - 30} more.` : missingList.length ? undefined : 'Every copy was found.'}
              items={missingList.slice(0, 30).map((item) => ({ title: item.accessionNumber, badge: { label: 'Missing', tone: 'danger' as const } }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
