import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { PackageCheck } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { decimal, libraryService, type OrderLine } from '@/services/libraryService'
import { accessionRun, copiesError, orderCounts, useCreateTitle, usePurchaseOrders, useReceiveOrder } from '@/staff/libraryQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Stepper, Surface, haptic, useToast } from '@/ui'

/** What arrived of one line: how many, the first accession number, the price of each. */
type Arrival = { count: number; first: string; price: string }

const outstanding = (line: OrderLine) => Math.max(0, line.quantity - (line.receivedQuantity ?? 0))

/**
 * Books arriving against a purchase order (no website screen yet): for each book, how many came
 * and their accession numbers. Each book is matched to the catalogue by ISBN or exact title, or
 * added to it, and the copies go on the shelf as available.
 */
export default function ReceiveOrderScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const orders = usePurchaseOrders()
  const order = orders.data?.find((row) => row._id === id)
  const receive = useReceiveOrder()
  const createTitle = useCreateTitle()
  const [arrivals, setArrivals] = useState<Record<string, Arrival>>({})
  const [editing, setEditing] = useState<{ line: OrderLine; arrival: Arrival } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const total = Object.values(arrivals).reduce((sum, row) => sum + row.count, 0)
  const allowLeaving = usePreventRemove(total > 0 && !working, ({ repeat }) => setLeaving(() => repeat))

  const open = (order?.lines ?? []).filter((line) => outstanding(line) > 0)

  const keep = () => {
    if (!editing?.line._id) return
    const { line, arrival } = editing
    if (arrival.count && !arrival.first.trim()) return setError('Enter the accession number of the first copy.')
    if (arrival.count && !accessionRun(arrival.first, arrival.count)) return setError('For more than one copy, the number must end in digits, like LIB-0098.')
    setError(null)
    setArrivals({ ...arrivals, [line._id as string]: arrival })
    setEditing(null)
  }

  // The catalogue title for a line: by ISBN, else a title with the same name, else a new one.
  const titleFor = async (line: OrderLine) => {
    const isbn = (line.isbn13 ?? '').replace(/[^0-9Xx]/g, '')
    if (isbn) {
      try {
        return (await libraryService.titleByIsbn(isbn))._id
      } catch (failure) {
        if (!(failure instanceof ApiError && failure.status === 404)) throw failure
      }
    }
    const same = (await libraryService.titles(line.title)).items.find((row) => row.title.trim().toLowerCase() === line.title.trim().toLowerCase())
    if (same) return same._id
    return (await createTitle.mutateAsync({ title: line.title, authors: line.author || undefined, isbn13: isbn || undefined }))._id
  }

  const submit = async () => {
    if (!order || !total) return
    setWorking(true)
    try {
      const copies: { titleId: string; accessionNumber: string; price?: number; lineId: string }[] = []
      for (const line of open) {
        const arrival = arrivals[line._id as string]
        if (!arrival?.count) continue
        const titleId = await titleFor(line)
        const price = arrival.price ? Number(arrival.price) : decimal(line.unitCost) ?? undefined
        ;(accessionRun(arrival.first, arrival.count) ?? []).forEach((accessionNumber) => copies.push({ titleId, accessionNumber, price, lineId: line._id as string }))
      }
      const numbers = copies.map((copy) => copy.accessionNumber)
      if (new Set(numbers).size !== numbers.length) throw new ApiError('Two books use the same accession numbers. Start one of them from another number.', 400)
      await receive.mutateAsync({ id: order._id, copies })
      haptic.success()
      allowLeaving()
      toast(`${copies.length} ${copies.length === 1 ? 'book' : 'books'} received and on the shelf`)
      router.back()
    } catch (failure) {
      haptic.error()
      setError(copiesError(failure, "The books weren't received. Check your connection and try again."))
    } finally {
      setWorking(false)
    }
  }

  const counts = order ? orderCounts(order) : null

  return (
    <MobileScreen
      refreshing={orders.isRefetching}
      onRefresh={orders.refetch}
      nav={<NavBar title={order?.number ?? 'Order'} back={{ label: 'Buying books', onPress: router.back }} />}
      actionBar={
        total ? (
          <ActionBar icon={PackageCheck} summary={`${total} ${total === 1 ? 'book' : 'books'} arrived`} detail="They go on the shelf as available" label={working ? 'Receiving…' : 'Receive'} onPress={submit} />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet
            open={Boolean(editing)}
            onClose={() => setEditing(null)}
            title={editing?.line.title ?? ''}
            description={editing ? `${outstanding(editing.line)} still to come` : undefined}
            footer={
              <MobileButton fullWidth onPress={keep}>
                Done
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
                <Stepper label="How many arrived" value={editing.arrival.count} onChange={(count) => setEditing({ ...editing, arrival: { ...editing.arrival, count } })} min={0} max={outstanding(editing.line)} />
                <MobileTextField
                  label="Accession number of the first copy"
                  hint="The other copies follow on from it."
                  value={editing.arrival.first}
                  onChangeText={(first) => setEditing({ ...editing, arrival: { ...editing.arrival, first } })}
                  autoCapitalize="characters"
                  maxLength={40}
                  returnKeyType="next"
                />
                <MobileTextField label="Price of each (optional)" type="number" prefix="₹" value={editing.arrival.price} onChangeText={(price) => setEditing({ ...editing, arrival: { ...editing.arrival, price: price.replace(/[^0-9.]/g, '') } })} maxLength={8} />
              </View>
            ) : null}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard what you entered?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
        </>
      }
    >
      {orders.isPending ? (
        <CardSkeleton rows={4} />
      ) : !order ? (
        <LoadFailed what="The order" error={orders.error} onRetry={orders.refetch} />
      ) : (
        <>
          {error && !editing ? (
            <Callout tone="danger" title="Not received">
              {error}
            </Callout>
          ) : null}
          {open.length ? (
            <ListGroup
              header={`${counts?.received ?? 0} of ${counts?.ordered ?? 0} received so far`}
              footer="Tap a book to enter how many came and their accession numbers."
              items={open.map((line) => {
                const arrival = arrivals[line._id as string]
                const run = arrival?.count ? accessionRun(arrival.first, arrival.count) : null
                return {
                  title: line.title,
                  subtitle: run ? `${run.length} arrived: ${run[0]}${run.length > 1 ? ` to ${run[run.length - 1]}` : ''}` : `${outstanding(line)} of ${line.quantity} still to come`,
                  lines: 2 as const,
                  chevron: true,
                  onPress: () => {
                    setError(null)
                    setEditing({ line, arrival: arrival ?? { count: outstanding(line), first: '', price: decimal(line.unitCost) ? String(decimal(line.unitCost)) : '' } })
                  },
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="success" icon={PackageCheck} title="Everything has arrived" body="All the books on this order are received." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
