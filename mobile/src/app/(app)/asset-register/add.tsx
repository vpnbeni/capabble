import { usePreventRemove, useRouter } from 'expo-router'
import { PackagePlus } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { CardSkeleton } from '@/portal/states'
import type { AssetStatus } from '@/services/assetService'
import { LocationChooser } from '@/staff/LocationChooser'
import { useAddAsset, useAssetCategories, useAssetLocations, useAssetVendors } from '@/staff/assetQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, OptionList, SegmentedControl, StatusView, Stepper, haptic, useToast } from '@/ui'

type Sheet = 'category' | 'place' | 'vendor' | null

/**
 * Registering an asset (the website's Assets → Add): what it is, its category (which sets its
 * asset ID), where it is, make and serial, what it cost. Several alike at once get an ID each.
 */
export default function AddAssetScreen() {
  const router = useRouter()
  const toast = useToast()
  const categories = useAssetCategories()
  const vendors = useAssetVendors()
  const locations = useAssetLocations()
  const add = useAddAsset()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [serial, setSerial] = useState('')
  const [cost, setCost] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [status, setStatus] = useState<AssetStatus>('IN_STOCK')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [errors, setErrors] = useState<Partial<Record<'name' | 'category' | 'form', string>>>({})
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const allowLeaving = usePreventRemove(!done && Boolean(name || categoryId) && !add.isPending, ({ repeat }) => setLeaving(() => repeat))

  const category = categories.data?.find((row) => row._id === categoryId)
  const place = locations.data?.find((row) => row._id === locationId)
  const vendor = vendors.data?.find((row) => row._id === vendorId)
  const amount = cost ? Number(cost) : 0

  const submit = async () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Enter what it is, like “Steel almirah”.'
    if (!categoryId) next.category = 'Choose a category.'
    setErrors(next)
    if (Object.keys(next).length) return haptic.error()
    try {
      await add.mutateAsync({
        name: name.trim(),
        categoryId,
        locationId: locationId || undefined,
        vendorId: vendorId || undefined,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        serialNumber: quantity === 1 ? serial.trim() || undefined : undefined,
        purchaseCost: amount || undefined,
        currentValue: amount || undefined,
        condition: 'New',
        status,
        quantity,
      })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(quantity > 1 ? `${quantity} × ${name.trim()} added` : `${name.trim()} added`)
      router.back()
    } catch (failure) {
      haptic.error()
      setErrors({ form: failure instanceof ApiError ? failure.message : "It wasn't added. Check your connection and try again." })
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="Add an asset" back={{ label: 'Assets', onPress: router.back }} />}
      actionBar={
        <ActionBar
          icon={PackagePlus}
          summary={name.trim() || 'New asset'}
          detail={[quantity > 1 ? `${quantity} alike` : null, category?.name, amount ? formatINR(amount * quantity) : null].filter(Boolean).join(' · ') || 'Fill in what it is'}
          label={add.isPending ? 'Adding…' : 'Add'}
          onPress={submit}
        />
      }
      overlay={
        <>
          <BottomSheet open={sheet === 'category'} onClose={() => setSheet(null)} title="Category" detent="large">
            {categories.isPending ? (
              <CardSkeleton rows={4} />
            ) : categories.data?.length ? (
              <OptionList label="Category" value={categoryId} onChange={(value) => (setCategoryId(value), setSheet(null))} options={categories.data.map((row) => ({ value: row._id, label: row.name, meta: row.code }))} />
            ) : (
              <StatusView compact kind="empty" title="No categories yet" body="Add one under Assets → Set up → Categories." />
            )}
          </BottomSheet>
          <BottomSheet open={sheet === 'place'} onClose={() => setSheet(null)} title="Where it is" detent="large">
            <LocationChooser value={locationId} onChange={(value) => (setLocationId(value), setSheet(null))} anyLabel="Not placed yet" />
          </BottomSheet>
          <BottomSheet open={sheet === 'vendor'} onClose={() => setSheet(null)} title="Bought from" detent="large">
            <OptionList
              label="Vendor"
              value={vendorId}
              onChange={(value) => (setVendorId(value), setSheet(null))}
              options={[{ value: '', label: 'Not recorded' }, ...(vendors.data ?? []).map((row) => ({ value: row._id, label: row.name, meta: row.contactPerson || row.phone }))]}
            />
          </BottomSheet>
          <ActionSheet open={Boolean(leaving)} onClose={() => setLeaving(null)} title="Discard this asset?" actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]} cancelLabel="Keep editing" />
        </>
      }
    >
      {errors.form ? (
        <Callout tone="danger" title="Not added">
          {errors.form}
        </Callout>
      ) : null}
      <MobileTextField label="What it is" placeholder="Steel almirah" value={name} onChangeText={setName} error={errors.name} maxLength={200} />
      <ListGroup
        footer={errors.category}
        items={[
          { title: 'Category', value: category?.name ?? 'Choose', onPress: () => setSheet('category') },
          { title: 'Where it is', value: place?.name ?? 'Not placed yet', onPress: () => setSheet('place') },
          { title: 'Bought from', value: vendor?.name ?? 'Not recorded', onPress: () => setSheet('vendor') },
        ]}
      />
      <View style={{ gap: space['space-4'] }}>
        <SegmentedControl
          label="State"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'IN_STOCK', label: 'In the store' },
            { value: 'IN_USE', label: 'In use' },
          ]}
        />
        <Stepper label="How many alike" value={quantity} onChange={setQuantity} min={1} max={100} />
        <MobileTextField label="Make (optional)" placeholder="Godrej" value={brand} onChangeText={setBrand} maxLength={100} returnKeyType="next" />
        <MobileTextField label="Model (optional)" value={model} onChangeText={setModel} maxLength={100} returnKeyType="next" />
        {quantity === 1 ? <MobileTextField label="Serial number (optional)" value={serial} onChangeText={setSerial} autoCapitalize="characters" maxLength={100} returnKeyType="next" /> : null}
        <MobileTextField label={quantity > 1 ? 'Cost of each (optional)' : 'Cost (optional)'} type="number" prefix="₹" value={cost} onChangeText={(text) => setCost(text.replace(/[^0-9.]/g, ''))} maxLength={10} />
      </View>
    </MobileScreen>
  )
}
