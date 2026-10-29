import { usePreventRemove, useRouter } from 'expo-router'
import { ShoppingCart } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { LocationChooser } from '@/staff/LocationChooser'
import { useAddPurchase, useAssetCategories, useAssetLocations, useAssetVendors } from '@/staff/assetQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, OptionList, SegmentedControl, Stepper, Text, haptic, useToast } from '@/ui'

type Sheet = 'category' | 'vendor' | 'place' | null

/**
 * Recording a purchase (the website's Assets → Procurement → New): what, how many, the price, who
 * from, where it will go, and whether each one is tracked (assets) or counted (stock).
 */
export default function AssetPurchaseScreen() {
  const router = useRouter()
  const toast = useToast()
  const categories = useAssetCategories()
  const vendors = useAssetVendors()
  const locations = useAssetLocations()
  const add = useAddPurchase()
  const [item, setItem] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [cost, setCost] = useState('')
  const [warranty, setWarranty] = useState('')
  const [mode, setMode] = useState<'individual' | 'consumable'>('individual')
  const [categoryId, setCategoryId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const allowLeaving = usePreventRemove(!done && Boolean(item || cost) && !add.isPending, ({ repeat }) => setLeaving(() => repeat))

  const category = categories.data?.find((row) => row._id === categoryId)
  const vendor = vendors.data?.find((row) => row._id === vendorId)
  const place = locations.data?.find((row) => row._id === locationId)
  const each = Number(cost) || 0

  const submit = async () => {
    if (!item.trim()) return (haptic.error(), setError('Enter what was bought.'))
    if (mode === 'individual' && !categoryId) return (haptic.error(), setError('Choose a category: each asset gets an ID from it.'))
    try {
      await add.mutateAsync({
        title: item.trim(),
        itemName: item.trim(),
        categoryId: categoryId || undefined,
        vendorId: vendorId || undefined,
        locationId: locationId || undefined,
        quantity,
        unitCost: each,
        warrantyMonths: warranty ? Number(warranty) : undefined,
        trackingMode: mode,
        status: 'Ordered',
      })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast('Purchase recorded')
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="Record a purchase" back={{ label: 'Purchases', onPress: router.back }} />}
      actionBar={<ActionBar icon={ShoppingCart} summary={item.trim() || 'New purchase'} detail={`${quantity} × ${formatINR(each)} = ${formatINR(quantity * each)}`} label={add.isPending ? 'Saving…' : 'Save'} onPress={submit} />}
      overlay={
        <>
          <BottomSheet open={sheet === 'category'} onClose={() => setSheet(null)} title="Category" detent="large">
            <OptionList label="Category" value={categoryId} onChange={(value) => (setCategoryId(value), setSheet(null))} options={(categories.data ?? []).map((row) => ({ value: row._id, label: row.name, meta: row.code }))} />
          </BottomSheet>
          <BottomSheet open={sheet === 'vendor'} onClose={() => setSheet(null)} title="Vendor" detent="large">
            <OptionList label="Vendor" value={vendorId} onChange={(value) => (setVendorId(value), setSheet(null))} options={[{ value: '', label: 'Not recorded' }, ...(vendors.data ?? []).map((row) => ({ value: row._id, label: row.name }))]} />
          </BottomSheet>
          <BottomSheet open={sheet === 'place'} onClose={() => setSheet(null)} title="Where it goes" detent="large">
            <LocationChooser value={locationId} onChange={(value) => (setLocationId(value), setSheet(null))} anyLabel="Decide later" />
          </BottomSheet>
          <ActionSheet open={Boolean(leaving)} onClose={() => setLeaving(null)} title="Discard this purchase?" actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]} cancelLabel="Keep editing" />
        </>
      }
    >
      {error ? (
        <Callout tone="danger" title="Not saved">
          {error}
        </Callout>
      ) : null}
      <View style={{ gap: space['space-4'] }}>
        <MobileTextField label="What was bought" placeholder="Student desk" value={item} onChangeText={setItem} maxLength={200} />
        <SegmentedControl
          label="Kind"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'individual', label: 'Assets' },
            { value: 'consumable', label: 'Stock' },
          ]}
        />
        <Text variant="m-subhead" tone="muted">
          {mode === 'individual' ? 'Each one gets an asset ID, like a desk or a projector.' : 'Counted, not tracked one by one, like chalk or paper.'}
        </Text>
        <Stepper label="How many" value={quantity} onChange={setQuantity} min={1} max={500} />
        <MobileTextField label="Price of each" type="number" prefix="₹" value={cost} onChangeText={(text) => setCost(text.replace(/[^0-9.]/g, ''))} maxLength={10} returnKeyType="next" />
        {mode === 'individual' ? <MobileTextField label="Warranty in months (optional)" type="number" value={warranty} onChangeText={(text) => setWarranty(text.replace(/[^0-9]/g, ''))} maxLength={3} /> : null}
      </View>
      <ListGroup
        items={[
          { title: 'Category', value: category?.name ?? (mode === 'individual' ? 'Choose' : 'Optional'), onPress: () => setSheet('category') },
          { title: 'Vendor', value: vendor?.name ?? 'Not recorded', onPress: () => setSheet('vendor') },
          { title: 'Where it goes', value: place?.name ?? 'Decide later', onPress: () => setSheet('place') },
        ]}
      />
    </MobileScreen>
  )
}
