import { useRouter } from 'expo-router'
import { ClipboardCheck, ScanLine } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { AuditItem, AuditItemState } from '@/services/assetService'
import { LocationChooser } from '@/staff/LocationChooser'
import { useAssetAudit, useAssetAudits, useAssetCategories, useCheckAsset, useCloseAudit, useMarkAuditItem, useStartAudit } from '@/staff/assetQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  Dialog,
  Hero,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  NavBar,
  OptionList,
  SegmentedControl,
  StatusView,
  Surface,
  haptic,
  useToast,
  type MobileTextFieldRef,
} from '@/ui'

type Scope = 'Full' | 'Location' | 'Category'

const STATE: Record<AuditItemState, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  Verified: { label: 'Found', tone: 'success' },
  Missing: { label: 'Missing', tone: 'danger' },
  'Not Found': { label: 'Missing', tone: 'danger' },
  Damaged: { label: 'Damaged', tone: 'warning' },
  'Wrong Location': { label: 'Wrong place', tone: 'warning' },
  Unverified: { label: 'Not checked', tone: 'neutral' },
}

/**
 * Checking the assets (the website's Assets → Audits): start an audit of the whole school, one
 * place or one category, type each asset ID you find (scanning waits for the camera build), mark
 * what is missing or damaged (that changes the asset), then close it.
 */
export default function AssetAuditScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canAudit = staff.can('asets.assets.audit')
  const audits = useAssetAudits()
  const current = (audits.data ?? []).find((row) => row.status !== 'Closed')
  const detail = useAssetAudit(current?._id)
  const categories = useAssetCategories(canAudit)
  const start = useStartAudit()
  const check = useCheckAsset()
  const mark = useMarkAuditItem()
  const close = useCloseAudit()
  const field = useRef<MobileTextFieldRef>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [scope, setScope] = useState<Scope>('Full')
  const [target, setTarget] = useState('')
  const [open, setOpen] = useState<AuditItem | null>(null)
  const [closing, setClosing] = useState(false)

  const items = detail.data?.items ?? []
  const found = items.filter((item) => item.state !== 'Unverified').length
  const pending = items.filter((item) => item.state === 'Unverified')
  const marked = items.filter((item) => item.state !== 'Unverified' && item.state !== 'Verified')

  const doCheck = async () => {
    const value = code.trim()
    if (!current || !value) return
    try {
      await check.mutateAsync({ id: current._id, code: value })
      haptic.light()
      setCode('')
      setError(null)
      field.current?.focus()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? (failure.status === 404 ? `${value} isn't an asset ID, barcode or tag of this school.` : failure.message) : "It wasn't checked. Try again.")
    }
  }

  const doStart = async () => {
    if (scope !== 'Full' && !target) return setError(scope === 'Location' ? 'Choose the place.' : 'Choose the category.')
    const label = scope === 'Location' ? 'place' : scope === 'Category' ? (categories.data?.find((row) => row._id === target)?.name ?? 'category') : 'whole school'
    try {
      await start.mutateAsync({
        title: `Audit ${formatDayKey(schoolToday(), { year: true })} · ${label}`,
        scopeType: scope,
        locationId: scope === 'Location' ? target : undefined,
        categoryId: scope === 'Category' ? target : undefined,
      })
      haptic.success()
      setStarting(false)
      toast('Audit started')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It didn't start. Try again.")
    }
  }

  const doMark = async (item: AuditItem, state: AuditItemState) => {
    if (!current) return
    setOpen(null)
    try {
      await mark.mutateAsync({ id: current._id, itemId: item._id, state })
      haptic.success()
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "That didn't save. Try again.", 'danger')
    }
  }

  const doClose = async () => {
    if (!current) return
    try {
      await close.mutateAsync(current._id)
      haptic.success()
      setClosing(false)
      toast('Audit closed')
    } catch (failure) {
      haptic.error()
      setClosing(false)
      toast(failure instanceof ApiError ? failure.message : "It wasn't closed. Try again.", 'danger')
    }
  }

  const last = (audits.data ?? []).find((row) => row.status === 'Closed')

  return (
    <MobileScreen
      refreshing={audits.isRefetching || detail.isRefetching}
      onRefresh={() => (audits.refetch(), detail.refetch())}
      nav={<NavBar title="Audit" back={{ label: 'Assets', onPress: router.back }} />}
      actionBar={
        !canAudit || audits.isPending ? undefined : current ? (
          <ActionBar icon={ClipboardCheck} summary={`${found} of ${items.length} checked`} detail="Close it when every place is done" label="Close audit" onPress={() => setClosing(true)} />
        ) : (
          <ActionBar icon={ScanLine} summary="Check that every asset is where it should be" detail={last ? `Last: ${formatDate(last.closedAt ?? last.createdAt)}` : undefined} label="Start an audit" onPress={() => (setError(null), setTarget(''), setStarting(true))} />
        )
      }
      overlay={
        <>
          <BottomSheet open={starting} onClose={() => setStarting(false)} title="Start an audit" detent="large" footer={<MobileButton fullWidth loading={start.isPending} onPress={doStart}>Start</MobileButton>}>
            {error ? <Callout tone="danger" title="Not started">{error}</Callout> : null}
            <SegmentedControl
              label="What to check"
              value={scope}
              onChange={(value) => (setScope(value), setTarget(''))}
              options={[
                { value: 'Full', label: 'All' },
                { value: 'Location', label: 'Place' },
                { value: 'Category', label: 'Category' },
              ]}
            />
            {scope === 'Location' ? <LocationChooser value={target} onChange={setTarget} /> : null}
            {scope === 'Category' ? <OptionList label="Category" value={target} onChange={setTarget} options={(categories.data ?? []).map((row) => ({ value: row._id, label: row.name, meta: row.code }))} /> : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.assetId?.name ?? 'Asset'}
            message={open ? [open.assetId?.assetId, open.expectedLocationId?.path ?? open.expectedLocationId?.name].filter(Boolean).join(' · ') : undefined}
            actions={
              open
                ? [
                    { label: 'Found', onSelect: () => doMark(open, 'Verified') },
                    { label: 'Found in the wrong place', onSelect: () => doMark(open, 'Wrong Location') },
                    { label: 'Damaged', onSelect: () => doMark(open, 'Damaged') },
                    { label: 'Missing', tone: 'danger' as const, onSelect: () => doMark(open, 'Missing') },
                  ]
                : []
            }
          />
          <Dialog
            open={closing}
            onClose={() => setClosing(false)}
            tone="danger"
            title="Close the audit?"
            description={`${pending.length ? `${pending.length} ${pending.length === 1 ? 'asset wasn’t' : 'assets weren’t'} checked and stay${pending.length === 1 ? 's' : ''} that way. ` : ''}A closed audit can’t be changed.`}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setClosing(false)}>
                  Not now
                </MobileButton>
                <MobileButton variant="destructive" loading={close.isPending} onPress={doClose}>
                  Close
                </MobileButton>
              </>
            }
          />
        </>
      }
    >
      {audits.isPending || (current && detail.isPending) ? (
        <CardSkeleton rows={5} />
      ) : audits.isError ? (
        <LoadFailed what="Audits" error={audits.error} onRetry={audits.refetch} />
      ) : current ? (
        <>
          <Hero tone="soft" icon={ClipboardCheck} label={current.title} value={`${pending.length} to check`} detail={`${found} of ${items.length} checked · ${marked.length} missing, damaged or misplaced`} progress={items.length ? found / items.length : 0} />
          {canAudit ? (
            <Surface>
              <View style={{ gap: space['space-3'] }}>
                {error ? <Callout tone="danger" title="Not checked">{error}</Callout> : null}
                <MobileTextField ref={field} label="Asset ID" hint="Type the ID on the tag of each asset you find." value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={60} returnKeyType="done" blurOnSubmit={false} onSubmitEditing={doCheck} />
                <MobileButton variant="tinted" fullWidth loading={check.isPending} onPress={doCheck}>
                  Found
                </MobileButton>
              </View>
            </Surface>
          ) : null}
          {marked.length ? (
            <ListGroup header="Marked" items={marked.map((item) => ({ title: item.assetId?.name ?? 'Asset', subtitle: item.assetId?.assetId, badge: STATE[item.state], onPress: canAudit ? () => setOpen(item) : undefined }))} />
          ) : null}
          {pending.length ? (
            <ListGroup
              header="Not checked yet"
              footer={pending.length > 40 ? `And ${pending.length - 40} more.` : canAudit ? 'Tap one to mark it missing, damaged or found.' : undefined}
              items={pending.slice(0, 40).map((item) => ({
                title: item.assetId?.name ?? 'Asset',
                subtitle: [item.assetId?.assetId, item.expectedLocationId?.name].filter(Boolean).join(' · '),
                lines: 2 as const,
                onPress: canAudit ? () => setOpen(item) : undefined,
              }))}
            />
          ) : null}
        </>
      ) : (
        <>
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={ScanLine} title="No audit going on" body={canAudit ? 'Start one to check every asset, one place or one category.' : 'The assets in-charge starts audits.'} />
          </Surface>
          {last?.summary ? (
            <ListGroup
              header={`Last audit · ${formatDate(last.closedAt ?? last.createdAt)}`}
              items={[
                { title: 'Found', value: `${last.summary.found}` },
                { title: 'Missing', value: `${last.summary.missing}` },
                { title: 'Damaged', value: `${last.summary.damaged}` },
                { title: 'In the wrong place', value: `${last.summary.wrongLocation}` },
                { title: 'Not checked', value: `${last.summary.unverified}` },
              ]}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
