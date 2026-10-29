import { useRouter } from 'expo-router'
import { MapPin, Plus, Tags, Truck } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { AssetCategory, AssetLocation, AssetVendor } from '@/services/assetService'
import { useAddLocation, useAssetCategories, useAssetLocations, useAssetVendors, useRenameLocation, useSaveCategory, useSaveVendor } from '@/staff/assetQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, BottomSheet, Callout, ChipRail, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, StatusView, Surface, haptic, useToast } from '@/ui'

type Tab = 'categories' | 'vendors' | 'places'

// Places nest campus › block › floor › room; a new place is the next level down from its parent.
const CHILD: Record<string, string> = { '': 'Campus', Campus: 'Block', Block: 'Floor', Floor: 'Room' }
const LEVEL = (type?: string) => (type === 'Campus' || type === 'Block' || type === 'Floor' ? type : 'Room')
const ROOM_TYPES = ['Classroom', 'Laboratory', 'Office', 'Staff Room', 'Store', 'Library', 'Hall', 'Other']

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A short code from a name for a new category ("Furniture" → "FUR"), which starts its asset IDs. */
const codeOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)

/**
 * Setting up the asset register (the website's Assets → Categories, Vendors and Locations): add or
 * rename a category (its code starts the asset IDs), a vendor with their contact, and places inside
 * one another (campus, block, floor, room). Removing them stays on the website.
 */
export default function AssetSetupScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canEdit = staff.can('asets.assets.edit')
  const [tab, setTab] = useState<Tab>('categories')
  const categories = useAssetCategories()
  const vendors = useAssetVendors()
  const locations = useAssetLocations()
  const saveCategory = useSaveCategory()
  const saveVendor = useSaveVendor()
  const addLocation = useAddLocation()
  const rename = useRenameLocation()

  const [category, setCategory] = useState<Partial<AssetCategory> | null>(null)
  const [vendor, setVendor] = useState<Partial<AssetVendor> | null>(null)
  const [place, setPlace] = useState<{ existing?: AssetLocation; name: string; parentId: string; roomType: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    setError(failure instanceof ApiError ? failure.message : fallback)
  }

  const submitCategory = async () => {
    if (!category) return
    const name = category.name?.trim() ?? ''
    const code = (category.code || codeOf(name)).trim().toUpperCase()
    if (!name) return setError('Enter the category’s name.')
    if (!/^[A-Z0-9]{2,8}$/.test(code)) return setError('The code is 2 to 8 capital letters or digits, like FUR.')
    try {
      await saveCategory.mutateAsync({ _id: category._id, name, code })
      haptic.success()
      setCategory(null)
      toast(category._id ? 'Category saved' : 'Category added')
    } catch (failure) {
      fail(failure, "It wasn't saved. Try again.")
    }
  }

  const submitVendor = async () => {
    if (!vendor) return
    if (!vendor.name?.trim()) return setError('Enter the vendor’s name.')
    try {
      await saveVendor.mutateAsync({
        _id: vendor._id,
        name: vendor.name.trim(),
        contactPerson: vendor.contactPerson?.trim(),
        phone: vendor.phone?.trim(),
        email: vendor.email?.trim(),
        gstin: vendor.gstin?.trim().toUpperCase(),
      })
      haptic.success()
      setVendor(null)
      toast(vendor._id ? 'Vendor saved' : 'Vendor added')
    } catch (failure) {
      fail(failure, "It wasn't saved. Try again.")
    }
  }

  const parent = place ? locations.data?.find((row) => row._id === place.parentId) : undefined
  const newType = place && !place.existing ? CHILD[parent ? LEVEL(parent.type) : ''] : undefined

  const submitPlace = async () => {
    if (!place) return
    const name = place.name.trim()
    if (!name) return setError('Enter the place’s name.')
    try {
      if (place.existing) await rename.mutateAsync({ id: place.existing._id, name })
      else
        await addLocation.mutateAsync({
          name,
          type: newType ?? 'Room',
          parentId: place.parentId || undefined,
          roomType: newType === 'Room' ? place.roomType : undefined,
          isStore: newType === 'Room' && place.roomType === 'Store' ? true : undefined,
        })
      haptic.success()
      setPlace(null)
      toast(place.existing ? 'Place renamed' : `${name} added`)
    } catch (failure) {
      fail(failure, "It wasn't saved. Try again.")
    }
  }

  const parents = (locations.data ?? []).filter((row) => LEVEL(row.type) !== 'Room')
  const busy = saveCategory.isPending || saveVendor.isPending || addLocation.isPending || rename.isPending

  const actionBar = !canEdit
    ? undefined
    : tab === 'categories'
      ? <ActionBar icon={Tags} summary={plural(categories.data?.length ?? 0, 'category', 'categories')} detail="Furniture, IT, lab equipment…" label="Add a category" onPress={() => (setError(null), setCategory({ name: '', code: '' }))} />
      : tab === 'vendors'
        ? <ActionBar icon={Truck} summary={plural(vendors.data?.length ?? 0, 'vendor', 'vendors')} detail="Who the school buys from" label="Add a vendor" onPress={() => (setError(null), setVendor({ name: '' }))} />
        : <ActionBar icon={MapPin} summary={plural(locations.data?.length ?? 0, 'place', 'places')} detail="Campus, blocks, floors and rooms" label="Add a place" onPress={() => (setError(null), setPlace({ name: '', parentId: '', roomType: 'Classroom' }))} />

  const list = tab === 'categories' ? categories : tab === 'vendors' ? vendors : locations

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={<NavBar title="Set up" back={{ label: 'Assets', onPress: router.back }} />}
      actionBar={actionBar}
      overlay={
        <>
          <BottomSheet
            open={Boolean(category)}
            onClose={() => setCategory(null)}
            title={category?._id ? 'Category' : 'Add a category'}
            footer={
              <MobileButton fullWidth loading={busy} onPress={submitCategory}>
                Save
              </MobileButton>
            }
          >
            {error ? <Callout tone="danger" title="Not saved">{error}</Callout> : null}
            {category ? (
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField label="Name" placeholder="Furniture" value={category.name ?? ''} onChangeText={(name) => setCategory({ ...category, name })} maxLength={100} returnKeyType="next" />
                <MobileTextField
                  label="Code"
                  hint={category._id ? 'New asset IDs start with it.' : `Asset IDs start with it, like ${(category.code || codeOf(category.name ?? '') || 'FUR')}-0001.`}
                  placeholder={codeOf(category.name ?? '') || 'FUR'}
                  value={category.code ?? ''}
                  onChangeText={(code) => setCategory({ ...category, code: code.toUpperCase() })}
                  autoCapitalize="characters"
                  maxLength={8}
                />
              </View>
            ) : null}
          </BottomSheet>
          <BottomSheet
            open={Boolean(vendor)}
            onClose={() => setVendor(null)}
            title={vendor?._id ? 'Vendor' : 'Add a vendor'}
            detent="large"
            footer={
              <MobileButton fullWidth loading={busy} onPress={submitVendor}>
                Save
              </MobileButton>
            }
          >
            {error ? <Callout tone="danger" title="Not saved">{error}</Callout> : null}
            {vendor ? (
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField label="Name" placeholder="Sharma Furnitures" value={vendor.name ?? ''} onChangeText={(name) => setVendor({ ...vendor, name })} maxLength={200} returnKeyType="next" />
                <MobileTextField label="Contact person (optional)" value={vendor.contactPerson ?? ''} onChangeText={(contactPerson) => setVendor({ ...vendor, contactPerson })} maxLength={200} returnKeyType="next" />
                <MobileTextField label="Phone (optional)" type="tel" value={vendor.phone ?? ''} onChangeText={(phone) => setVendor({ ...vendor, phone })} maxLength={20} returnKeyType="next" />
                <MobileTextField label="Email (optional)" type="email" value={vendor.email ?? ''} onChangeText={(email) => setVendor({ ...vendor, email })} maxLength={200} returnKeyType="next" />
                <MobileTextField label="GSTIN (optional)" value={vendor.gstin ?? ''} onChangeText={(gstin) => setVendor({ ...vendor, gstin })} autoCapitalize="characters" maxLength={15} />
              </View>
            ) : null}
          </BottomSheet>
          <BottomSheet
            open={Boolean(place)}
            onClose={() => setPlace(null)}
            title={place?.existing ? 'Rename place' : `Add a ${(newType ?? 'place').toLowerCase()}`}
            description={place?.existing ? place.existing.path : parent ? `Inside ${parent.path ?? parent.name}` : 'The school’s grounds: blocks go inside it'}
            detent="large"
            footer={
              <MobileButton fullWidth loading={busy} onPress={submitPlace}>
                Save
              </MobileButton>
            }
          >
            {error ? <Callout tone="danger" title="Not saved">{error}</Callout> : null}
            {place ? (
              <View style={{ gap: space['space-4'] }}>
                <MobileTextField label="Name" placeholder={newType === 'Room' ? 'Room 12' : newType === 'Floor' ? 'First floor' : newType === 'Block' ? 'Main block' : 'Main campus'} value={place.name} onChangeText={(name) => setPlace({ ...place, name })} maxLength={120} />
                {place.existing ? null : (
                  <>
                    <OptionList
                      header="Inside"
                      label="Inside"
                      value={place.parentId}
                      onChange={(parentId) => setPlace({ ...place, parentId })}
                      options={[{ value: '', label: 'Nothing: a new campus' }, ...parents.map((row) => ({ value: row._id, label: row.name, meta: [LEVEL(row.type), (row.path ?? '').split(' › ').slice(0, -1).join(' › ')].filter(Boolean).join(' · ') }))]}
                    />
                    {newType === 'Room' ? <OptionList header="Kind of room" label="Kind of room" value={place.roomType} onChange={(roomType) => setPlace({ ...place, roomType })} options={ROOM_TYPES.map((value) => ({ value, label: value }))} /> : null}
                  </>
                )}
              </View>
            ) : null}
          </BottomSheet>
        </>
      }
    >
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'categories', label: 'Categories' },
          { id: 'vendors', label: 'Vendors' },
          { id: 'places', label: 'Places' },
        ]}
      />
      {list.isPending ? (
        <CardSkeleton rows={5} />
      ) : list.isError ? (
        <LoadFailed what="The list" error={list.error} onRetry={list.refetch} />
      ) : tab === 'categories' ? (
        categories.data?.length ? (
          <ListGroup
            footer={canEdit ? 'Tap one to rename it or change its code.' : undefined}
            items={categories.data.map((row) => ({ title: row.name, value: row.code, onPress: canEdit ? () => (setError(null), setCategory(row)) : undefined }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Tags} title="No categories yet" body="Every asset belongs to one, like Furniture or IT." />
          </Surface>
        )
      ) : tab === 'vendors' ? (
        vendors.data?.length ? (
          <ListGroup
            items={vendors.data.map((row) => ({
              title: row.name,
              subtitle: [row.contactPerson, row.phone, row.gstin].filter(Boolean).join(' · ') || undefined,
              lines: 2 as const,
              onPress: canEdit ? () => (setError(null), setVendor(row)) : row.phone ? () => Linking.openURL(`tel:${row.phone}`) : undefined,
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Truck} title="No vendors yet" body="Shops and suppliers the school buys from." />
          </Surface>
        )
      ) : locations.data?.length ? (
        <ListGroup
          items={[...locations.data]
            .sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name))
            .map((row) => ({
              title: row.name,
              subtitle: [LEVEL(row.type), row.path && row.path !== row.name ? row.path.split(' › ').slice(0, -1).join(' › ') : null].filter(Boolean).join(' · '),
              lines: 2 as const,
              onPress: canEdit ? () => (setError(null), setPlace({ existing: row, name: row.name, parentId: '', roomType: '' })) : undefined,
            }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Plus} title="No places yet" body="Start with the campus, then its blocks, floors and rooms." />
        </Surface>
      )}
    </MobileScreen>
  )
}
