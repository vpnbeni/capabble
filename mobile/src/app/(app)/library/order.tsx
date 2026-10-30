import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { Plus, Truck } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { decimal, type OrderLine } from '@/services/libraryService'
import { usePlaceOrder, usePurchaseRequests, useSuppliers } from '@/staff/libraryQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, OptionList, StatusView, Stepper, Surface, haptic, useToast } from '@/ui'

type Line = { key: string; title: string; author: string; isbn13: string; quantity: number; cost: string }

let nextKey = 0
const newKey = () => `line-${(nextKey += 1)}`

/**
 * A purchase order to a supplier (no website screen yet): the supplier, then each book with how
 * many and the price. Opened from an approved request it starts with that book.
 */
export default function LibraryOrderScreen() {
  const router = useRouter()
  const toast = useToast()
  const { requestId } = useLocalSearchParams<{ requestId?: string }>()
  const requests = usePurchaseRequests(Boolean(requestId))
  const suppliers = useSuppliers()
  const place = usePlaceOrder()
  const request = requestId ? requests.data?.find((row) => row._id === requestId) : undefined
  const [supplierId, setSupplierId] = useState('')
  const [edited, setLines] = useState<Line[] | null>(null)
  const [editing, setEditing] = useState<Line | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)

  // An approved request fills the first line until anything is changed.
  const lines = useMemo<Line[]>(
    () =>
      edited ??
      (request
        ? [{ key: 'request', title: request.title, author: request.author ?? '', isbn13: request.isbn13 ?? '', quantity: request.quantity, cost: decimal(request.estimatedUnitCost) ? String(decimal(request.estimatedUnitCost)) : '' }]
        : []),
    [edited, request],
  )
  const allowLeaving = usePreventRemove(!done && Boolean(edited?.length || supplierId) && !place.isPending, ({ repeat }) => setLeaving(() => repeat))

  const supplier = suppliers.data?.find((row) => row._id === supplierId)
  const books = lines.reduce((sum, line) => sum + line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.quantity * (Number(line.cost) || 0), 0)

  const keep = () => {
    if (!editing) return
    if (!editing.title.trim()) return setError('Enter the book’s title.')
    setError(null)
    setLines(lines.some((line) => line.key === editing.key) ? lines.map((line) => (line.key === editing.key ? editing : line)) : [...lines, editing])
    setEditing(null)
  }

  const submit = async () => {
    if (!supplierId) return (haptic.error(), setError('Choose the supplier.'))
    if (!lines.length) return (haptic.error(), setError('Add at least one book.'))
    const payload: OrderLine[] = lines.map((line) => ({
      title: line.title.trim(),
      author: line.author.trim() || undefined,
      isbn13: line.isbn13.replace(/[^0-9Xx]/g, '') || undefined,
      quantity: line.quantity,
      unitCost: line.cost ? Number(line.cost) : undefined,
    }))
    try {
      const order = await place.mutateAsync({ supplierId, requestId: requestId || undefined, lines: payload })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(`Order ${order.number} placed with ${supplier?.name ?? 'the supplier'}`)
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The order wasn't placed. Try again.")
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="New order" back={{ label: 'Buying books', onPress: router.back }} />}
      actionBar={
        lines.length ? (
          <ActionBar
            icon={Truck}
            summary={`${books} ${books === 1 ? 'book' : 'books'}${total ? ` · ${formatINR(total)}` : ''}`}
            detail={supplier?.name ?? 'Choose the supplier'}
            label={place.isPending ? 'Placing…' : 'Place order'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={choosing} onClose={() => setChoosing(false)} title="Supplier">
            {suppliers.data?.length ? (
              <OptionList
                label="Supplier"
                value={supplierId}
                onChange={(value) => {
                  setSupplierId(value)
                  setChoosing(false)
                }}
                options={suppliers.data.map((row) => ({ value: row._id, label: row.name, meta: row.contactName || row.phone }))}
              />
            ) : (
              <StatusView compact kind="empty" title="No suppliers yet" body="Add one under Buying books → Suppliers first." />
            )}
          </BottomSheet>
          <BottomSheet
            open={Boolean(editing)}
            onClose={() => setEditing(null)}
            title={editing && lines.some((line) => line.key === editing.key) ? 'Book' : 'Add a book'}
            footer={
              <MobileButton fullWidth onPress={keep}>
                {editing && lines.some((line) => line.key === editing.key) ? 'Done' : 'Add to order'}
              </MobileButton>
            }
          >
            {editing ? (
              <View style={{ gap: space['space-4'] }}>
                {error ? (
                  <Callout tone="danger" title="Check this">
                    {error}
                  </Callout>
                ) : null}
                <MobileTextField label="Title" value={editing.title} onChangeText={(title) => setEditing({ ...editing, title })} maxLength={500} returnKeyType="next" />
                <MobileTextField label="Author (optional)" value={editing.author} onChangeText={(author) => setEditing({ ...editing, author })} maxLength={200} returnKeyType="next" />
                <MobileTextField label="ISBN (optional)" type="number" value={editing.isbn13} onChangeText={(isbn13) => setEditing({ ...editing, isbn13 })} maxLength={17} returnKeyType="next" />
                <Stepper label="How many" value={editing.quantity} onChange={(quantity) => setEditing({ ...editing, quantity })} min={1} max={500} />
                <MobileTextField label="Price of each (optional)" type="number" prefix="₹" value={editing.cost} onChangeText={(cost) => setEditing({ ...editing, cost: cost.replace(/[^0-9.]/g, '') })} maxLength={8} />
                {lines.some((line) => line.key === editing.key) ? (
                  <ListGroup items={[{ title: 'Take off the order', tone: 'danger', onPress: () => (setLines(lines.filter((line) => line.key !== editing.key)), setEditing(null)) }]} />
                ) : null}
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard this order?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {suppliers.isPending || (requestId && requests.isPending) ? (
        <CardSkeleton rows={4} />
      ) : suppliers.isError ? (
        <LoadFailed what="Suppliers" error={suppliers.error} onRetry={suppliers.refetch} />
      ) : (
        <>
          {error && !editing ? (
            <Callout tone="danger" title="Not placed">
              {error}
            </Callout>
          ) : null}
          <ListGroup header="From" items={[{ title: 'Supplier', value: supplier?.name ?? 'Choose', onPress: () => setChoosing(true) }]} />
          <ListGroup
            header="Books"
            footer={request ? `From ${request.requestedBy}'s approved request.` : undefined}
            items={[
              ...lines.map((line) => ({
                title: line.title,
                subtitle: [line.author, `${line.quantity} ${line.quantity === 1 ? 'copy' : 'copies'}`, line.cost ? `${formatINR(Number(line.cost))} each` : null].filter(Boolean).join(' · '),
                lines: 2 as const,
                chevron: true,
                onPress: () => (setError(null), setEditing(line)),
              })),
              { title: 'Add a book', icon: Plus, tile: 1 as const, onPress: () => (setError(null), setEditing({ key: newKey(), title: '', author: '', isbn13: '', quantity: 1, cost: '' })) },
            ]}
          />
          {!lines.length ? (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Truck} title="No books on the order" body="Add each book with how many and the price." />
            </Surface>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
