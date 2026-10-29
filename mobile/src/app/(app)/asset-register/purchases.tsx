import { useRouter } from 'expo-router'
import { PackageCheck, ShoppingCart } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { AssetPurchase } from '@/services/assetService'
import { useAssetPurchases, useReceivePurchase } from '@/staff/assetQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, Dialog, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, haptic, useToast } from '@/ui'

const BADGE: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  Requested: { label: 'Ordered', tone: 'warning' },
  Ordered: { label: 'Ordered', tone: 'warning' },
  Draft: { label: 'Draft', tone: 'neutral' },
  Received: { label: 'Received', tone: 'success' },
  Cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/**
 * Purchases for the asset register (the website's Assets → Procurement): what was bought, from
 * whom, how many at what price; marking one received makes its assets (each with an ID, in the
 * store) or, for consumables, its stock item.
 */
export default function AssetPurchasesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canBuy = staff.can('asets.assets.procure')
  const purchases = useAssetPurchases()
  const receive = useReceivePurchase()
  const [receiving, setReceiving] = useState<AssetPurchase | null>(null)

  const open = (purchases.data ?? []).filter((row) => row.status !== 'Received' && row.status !== 'Cancelled')

  const doReceive = async () => {
    if (!receiving) return
    try {
      const result = await receive.mutateAsync(receiving._id)
      haptic.success()
      setReceiving(null)
      toast(receiving.trackingMode === 'consumable' ? `${receiving.quantity} added to stock` : `${result.generatedCount} ${result.generatedCount === 1 ? 'asset' : 'assets'} added to the register`)
    } catch (failure) {
      haptic.error()
      setReceiving(null)
      toast(failure instanceof ApiError ? failure.message : "It wasn't received. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={purchases.isRefetching}
      onRefresh={purchases.refetch}
      nav={<NavBar title="Purchases" back={{ label: 'Assets', onPress: router.back }} />}
      actionBar={canBuy ? <ActionBar icon={ShoppingCart} summary={`${open.length} waiting to arrive`} detail="Furniture, computers, lab kit" label="Record a purchase" onPress={() => router.push('/asset-register/purchase')} /> : undefined}
      overlay={
        <Dialog
          open={Boolean(receiving)}
          onClose={() => setReceiving(null)}
          title={`Mark ${receiving?.itemName || receiving?.title || ''} received?`}
          description={
            receiving?.trackingMode === 'consumable'
              ? `${receiving.quantity} go into stock.`
              : receiving?.quantity === 1
                ? 'It goes on the register with its own asset ID, in the store.'
                : `${receiving?.quantity ?? 0} assets go on the register, each with its own ID, in the store.`
          }
          footer={
            <>
              <MobileButton variant="gray" onPress={() => setReceiving(null)}>
                Not now
              </MobileButton>
              <MobileButton loading={receive.isPending} onPress={doReceive}>
                Received
              </MobileButton>
            </>
          }
        />
      }
    >
      {purchases.isPending ? (
        <CardSkeleton rows={4} />
      ) : purchases.isError ? (
        <LoadFailed what="Purchases" error={purchases.error} onRetry={purchases.refetch} />
      ) : purchases.data?.length ? (
        <ListGroup
          footer={canBuy && open.length ? 'Tap one when it arrives.' : undefined}
          items={purchases.data.map((row) => ({
            title: row.itemName || row.title,
            subtitle: [`${row.quantity} × ${formatINR(row.unitCost)}`, row.vendorId?.name, formatDate(row.receiptDate ?? row.createdAt)].filter(Boolean).join(' · '),
            lines: 2 as const,
            icon: PackageCheck,
            tile: 2 as const,
            badge: BADGE[row.status] ?? { label: row.status, tone: 'neutral' as const },
            onPress: canBuy && row.status !== 'Received' && row.status !== 'Cancelled' ? () => setReceiving(row) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={ShoppingCart} title="No purchases yet" body="Record what the school buys; its assets are added when it arrives." />
        </Surface>
      )}
    </MobileScreen>
  )
}
