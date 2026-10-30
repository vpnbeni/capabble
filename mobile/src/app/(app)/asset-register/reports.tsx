import { useRouter } from 'expo-router'
import { BarChart3, Share2 } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatINR, schoolToday } from '@/lib/format'
import { shareText } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { assetService, type Asset } from '@/services/assetService'
import { useAssetReports } from '@/staff/assetQueries'
import { ActionBar, Hero, ListGroup, MobileScreen, NavBar, haptic, useToast } from '@/ui'

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The register as a spreadsheet anyone can open: one row per asset. */
const registerCsv = (rows: Asset[]) =>
  [
    ['Asset ID', 'Name', 'Category', 'Place', 'Status', 'Make', 'Model', 'Serial', 'Cost', 'Value now'],
    ...rows.map((row) => [row.assetId, row.name, row.categoryId?.name, row.locationPath, row.status, row.brand, row.model, row.serialNumber, row.purchaseCost, row.currentValue]),
  ]
    .map((line) => line.map(csvCell).join(','))
    .join('\n')

/**
 * Asset reports (the website's Assets → Reports): how many and what they are worth by category and
 * by place, and the whole register shared as a CSV file for the accounts or the auditor.
 */
export default function AssetReportsScreen() {
  const router = useRouter()
  const toast = useToast()
  const reports = useAssetReports()
  const [sharing, setSharing] = useState(false)
  const byCategory = reports.data?.byCategory ?? []
  const count = byCategory.reduce((sum, row) => sum + row.count, 0)
  const value = byCategory.reduce((sum, row) => sum + (row.value || 0), 0)

  const share = async () => {
    setSharing(true)
    try {
      const rows = await assetService.report<Asset>('register')
      await shareText(registerCsv(rows), `Asset register ${schoolToday()}.csv`)
      haptic.success()
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The register didn't download. Try again.", 'danger')
    } finally {
      setSharing(false)
    }
  }

  return (
    <MobileScreen
      refreshing={reports.isRefetching}
      onRefresh={reports.refetch}
      nav={<NavBar title="Asset reports" back={{ label: 'Assets', onPress: router.back }} />}
      actionBar={reports.isSuccess && count ? <ActionBar icon={Share2} summary="The whole register" detail="A CSV file for a spreadsheet" label={sharing ? 'Making…' : 'Share'} onPress={share} /> : undefined}
    >
      {reports.isPending ? (
        <CardSkeleton rows={6} />
      ) : reports.isError || !reports.data ? (
        <LoadFailed what="Reports" error={reports.error} onRetry={reports.refetch} />
      ) : (
        <>
          <Hero tone="surface" icon={BarChart3} label="Assets" value={`${count}`} detail={`Worth ${formatINR(value)} now`} />
          <ListGroup header="By category" items={byCategory.map((row) => ({ title: row.name ?? 'No category', subtitle: formatINR(row.value || 0), value: `${row.count}` }))} />
          <ListGroup
            header="By place"
            items={reports.data.byLocation.map((row) => ({
              title: row.name ?? 'Not placed',
              subtitle: [row.path && row.path !== row.name ? row.path.split(' › ').slice(0, -1).join(' › ') : null, formatINR(row.value || 0)].filter(Boolean).join(' · '),
              value: `${row.count}`,
              lines: 2 as const,
            }))}
          />
        </>
      )}
    </MobileScreen>
  )
}
