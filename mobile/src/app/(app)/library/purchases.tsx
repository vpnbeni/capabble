import { useRouter } from 'expo-router'
import { Check, PackageCheck, PackagePlus, Phone, ShoppingCart, Truck, X } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDate, formatINR } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { decimal, type PurchaseOrder, type PurchaseRequest } from '@/services/libraryService'
import { orderCounts, useAddSupplier, usePurchaseOrders, usePurchaseRequests, useRequestBook, useReviewRequest, useSuppliers } from '@/staff/libraryQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ChipRail, Dialog, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, StatusView, Stepper, Surface, haptic, useToast } from '@/ui'

type Tab = 'requests' | 'orders' | 'suppliers'

const REQUEST_BADGE: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' | 'danger' }> = {
  requested: { label: 'Waiting', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  ordered: { label: 'Ordered', tone: 'neutral' },
  received: { label: 'Received', tone: 'neutral' },
}

const ORDER_BADGE: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  ordered: { label: 'Ordered', tone: 'warning' },
  partially_received: { label: 'Part received', tone: 'warning' },
  received: { label: 'Received', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
}

const supplierName = (order: PurchaseOrder) => (typeof order.supplierId === 'object' && order.supplierId ? order.supplierId.name : 'Supplier')

/**
 * Buying books (the website's Library → Acquisitions): requests and approving them (not your own),
 * purchase orders and receiving them, and suppliers. Each part shows to the logins that can use it.
 */
export default function LibraryPurchasesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canView = staff.can('libry.acquisitions.view')
  const canRequest = staff.can('libry.acquisitions.request')
  const canApprove = staff.can('libry.acquisitions.approve')
  const canManage = staff.can('libry.acquisitions.manage')
  const canReceive = staff.can('libry.acquisitions.receive')
  // The server records who asked by name, or by email when the login has no name.
  const mine = (row: PurchaseRequest) => [staff.user?.name, staff.user?.email].some((value) => value && value === row.requestedBy)
  const [tab, setTab] = useState<Tab>('requests')
  const requests = usePurchaseRequests(canView)
  const orders = usePurchaseOrders(canView && tab === 'orders')
  const suppliers = useSuppliers(canView && tab === 'suppliers')
  const ask = useRequestBook()
  const review = useReviewRequest()
  const addSupplier = useAddSupplier()

  const [asking, setAsking] = useState(false)
  const [form, setForm] = useState({ title: '', author: '', cost: '', purpose: '' })
  const [quantity, setQuantity] = useState(1)
  const [open, setOpen] = useState<PurchaseRequest | null>(null)
  const [rejecting, setRejecting] = useState<PurchaseRequest | null>(null)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [supplier, setSupplier] = useState({ name: '', contactName: '', phone: '', email: '' })
  const [error, setError] = useState<string | null>(null)

  const pending = (requests.data ?? []).filter((row) => row.status === 'requested')
  const openOrders = (orders.data ?? []).filter((row) => row.status === 'ordered' || row.status === 'partially_received')

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    return failure instanceof ApiError ? failure.message : fallback
  }

  const sendRequest = async () => {
    const cost = form.cost ? Number(form.cost) : undefined
    if (!form.title.trim()) return setError('Enter the book’s title.')
    if (!form.purpose.trim()) return setError('Say what it is for, like “Class 9 reading list”.')
    try {
      await ask.mutateAsync({ title: form.title.trim(), author: form.author.trim() || undefined, quantity, estimatedUnitCost: cost, purpose: form.purpose.trim() })
      haptic.success()
      setAsking(false)
      setForm({ title: '', author: '', cost: '', purpose: '' })
      setQuantity(1)
      toast(canApprove ? 'Request sent. Someone else approves it.' : 'Request sent for approval')
    } catch (failure) {
      setError(fail(failure, "The request wasn't sent. Try again."))
    }
  }

  const decide = async (row: PurchaseRequest, decision: 'approved' | 'rejected', reason = '') => {
    setOpen(null)
    try {
      await review.mutateAsync({ id: row._id, decision, note: reason })
      haptic.success()
      setRejecting(null)
      setNote('')
      toast(decision === 'approved' ? `${row.title} approved` : `${row.title} rejected`)
    } catch (failure) {
      setRejecting(null)
      toast(fail(failure, "That didn't save. Try again."), 'danger')
    }
  }

  const saveSupplier = async () => {
    if (!supplier.name.trim()) return setError('Enter the supplier’s name.')
    try {
      await addSupplier.mutateAsync({ name: supplier.name.trim(), contactName: supplier.contactName.trim() || undefined, phone: supplier.phone.trim() || undefined, email: supplier.email.trim() || undefined })
      haptic.success()
      setAdding(false)
      setSupplier({ name: '', contactName: '', phone: '', email: '' })
      toast('Supplier added')
    } catch (failure) {
      setError(fail(failure, "The supplier wasn't added. Try again."))
    }
  }

  const actionBar =
    tab === 'requests' && canRequest ? (
      <ActionBar icon={ShoppingCart} summary={`${pending.length} waiting for approval`} detail="Books the library should buy" label="Request a book" onPress={() => (setError(null), setAsking(true))} />
    ) : tab === 'orders' && canManage ? (
      <ActionBar icon={Truck} summary={`${openOrders.length} open ${openOrders.length === 1 ? 'order' : 'orders'}`} detail="Waiting for books to arrive" label="New order" onPress={() => router.push('/library/order')} />
    ) : tab === 'suppliers' && canManage ? (
      <ActionBar icon={PackagePlus} summary={`${suppliers.data?.length ?? 0} suppliers`} detail="Booksellers the library buys from" label="Add a supplier" onPress={() => (setError(null), setAdding(true))} />
    ) : undefined

  const requestActions = (row: PurchaseRequest) => [
    ...(canApprove && row.status === 'requested' && !mine(row)
      ? [
          { label: 'Approve', icon: Check, onSelect: () => decide(row, 'approved') },
          { label: 'Reject', icon: X, tone: 'danger' as const, onSelect: () => (setOpen(null), setNote(''), setRejecting(row)) },
        ]
      : []),
    ...(canManage && row.status === 'approved' ? [{ label: 'Order it', icon: Truck, onSelect: () => (setOpen(null), router.push({ pathname: '/library/order', params: { requestId: row._id } })) }] : []),
  ]

  return (
    <MobileScreen
      refreshing={requests.isRefetching || orders.isRefetching || suppliers.isRefetching}
      onRefresh={() => (tab === 'requests' ? requests.refetch() : tab === 'orders' ? orders.refetch() : suppliers.refetch())}
      nav={<NavBar title="Buying books" back={{ label: 'Library', onPress: router.back }} />}
      actionBar={actionBar}
      overlay={
        <>
          <BottomSheet
            open={asking}
            onClose={() => setAsking(false)}
            title="Request a book"
            footer={
              <MobileButton fullWidth loading={ask.isPending} onPress={sendRequest}>
                Send request
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not sent">
                {error}
              </Callout>
            ) : null}
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Title" value={form.title} onChangeText={(title) => setForm({ ...form, title })} maxLength={500} returnKeyType="next" />
              <MobileTextField label="Author (optional)" value={form.author} onChangeText={(author) => setForm({ ...form, author })} maxLength={200} returnKeyType="next" />
              <Stepper label="How many copies" value={quantity} onChange={setQuantity} min={1} max={200} />
              <MobileTextField label="Price of each, about (optional)" type="number" prefix="₹" value={form.cost} onChangeText={(cost) => setForm({ ...form, cost: cost.replace(/[^0-9.]/g, '') })} maxLength={8} />
              <MobileTextField label="What it is for" placeholder="Class 9 reading list" value={form.purpose} onChangeText={(purpose) => setForm({ ...form, purpose })} maxLength={1000} />
            </View>
          </BottomSheet>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.title ?? ''}
            message={
              open
                ? [
                    `For: ${open.purpose}`,
                    open.reviewNote ? `${open.reviewedBy || 'Reviewer'}: ${open.reviewNote}` : null,
                    mine(open) && open.status === 'requested' ? 'You asked for this: someone else approves it.' : null,
                  ]
                    .filter(Boolean)
                    .join('\n')
                : undefined
            }
            actions={open ? requestActions(open) : []}
          />
          <Dialog
            open={Boolean(rejecting)}
            onClose={() => setRejecting(null)}
            tone="danger"
            title={`Reject ${rejecting?.title ?? ''}?`}
            description={`${rejecting?.requestedBy ?? 'They'} sees why.`}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setRejecting(null)}>
                  Not now
                </MobileButton>
                <MobileButton variant="destructive" loading={review.isPending} onPress={() => rejecting && decide(rejecting, 'rejected', note.trim())}>
                  Reject
                </MobileButton>
              </>
            }
          >
            <MobileTextField label="Why (optional)" value={note} onChangeText={setNote} placeholder="Already have 4 copies" maxLength={300} />
          </Dialog>
          <BottomSheet
            open={adding}
            onClose={() => setAdding(false)}
            title="Add a supplier"
            footer={
              <MobileButton fullWidth loading={addSupplier.isPending} onPress={saveSupplier}>
                Add supplier
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not added">
                {error}
              </Callout>
            ) : null}
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Name" placeholder="City Book Depot" value={supplier.name} onChangeText={(name) => setSupplier({ ...supplier, name })} maxLength={200} returnKeyType="next" />
              <MobileTextField label="Contact person (optional)" value={supplier.contactName} onChangeText={(contactName) => setSupplier({ ...supplier, contactName })} maxLength={200} returnKeyType="next" />
              <MobileTextField label="Phone (optional)" type="tel" value={supplier.phone} onChangeText={(phone) => setSupplier({ ...supplier, phone })} maxLength={20} returnKeyType="next" />
              <MobileTextField label="Email (optional)" type="email" value={supplier.email} onChangeText={(email) => setSupplier({ ...supplier, email })} maxLength={200} />
            </View>
          </BottomSheet>
        </>
      }
    >
      <ChipRail
        label="Show"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'requests', label: 'Requests', count: pending.length || undefined },
          { id: 'orders', label: 'Orders' },
          { id: 'suppliers', label: 'Suppliers' },
        ]}
      />
      {tab === 'requests' ? (
        requests.isPending ? (
          <CardSkeleton rows={4} />
        ) : requests.isError ? (
          <LoadFailed what="Requests" error={requests.error} onRetry={requests.refetch} />
        ) : requests.data?.length ? (
          <ListGroup
            items={requests.data.map((row) => {
              const cost = decimal(row.estimatedUnitCost)
              return {
                title: row.title,
                subtitle: `${row.quantity} ${row.quantity === 1 ? 'copy' : 'copies'}${cost ? ` at about ${formatINR(cost)}` : ''} · ${row.requestedBy}, ${formatDate(row.createdAt, { year: false })}`,
                lines: 2,
                badge: REQUEST_BADGE[row.status] ?? { label: row.status, tone: 'neutral' as const },
                onPress: () => setOpen(row),
              }
            })}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={ShoppingCart} title="No requests" body="Books staff ask the library to buy show here for approval." />
          </Surface>
        )
      ) : tab === 'orders' ? (
        orders.isPending ? (
          <CardSkeleton rows={4} />
        ) : orders.isError ? (
          <LoadFailed what="Orders" error={orders.error} onRetry={orders.refetch} />
        ) : orders.data?.length ? (
          <ListGroup
            footer={canReceive && openOrders.length ? 'Open an order when its books arrive.' : undefined}
            items={orders.data.map((row) => {
              const { ordered, received } = orderCounts(row)
              const receivable = canReceive && (row.status === 'ordered' || row.status === 'partially_received')
              return {
                title: supplierName(row),
                subtitle: `${row.number} · ${received} of ${ordered} ${ordered === 1 ? 'book' : 'books'} received · ${formatDate(row.orderedAt ?? row.createdAt)}`,
                lines: 2,
                icon: PackageCheck,
                tile: 1,
                badge: ORDER_BADGE[row.status] ?? { label: row.status, tone: 'neutral' as const },
                chevron: receivable,
                onPress: receivable ? () => router.push({ pathname: '/library/receive', params: { id: row._id } }) : undefined,
              }
            })}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Truck} title="No orders yet" body="Purchase orders to booksellers show here until the books arrive." />
          </Surface>
        )
      ) : suppliers.isPending ? (
        <CardSkeleton rows={3} />
      ) : suppliers.isError ? (
        <LoadFailed what="Suppliers" error={suppliers.error} onRetry={suppliers.refetch} />
      ) : suppliers.data?.length ? (
        <ListGroup
          items={suppliers.data.map((row) => ({
            title: row.name,
            subtitle: [row.contactName, row.phone, row.email].filter(Boolean).join(' · ') || undefined,
            lines: 2,
            onPress: row.phone ? () => Linking.openURL(`tel:${row.phone}`) : undefined,
            icon: row.phone ? Phone : undefined,
            tile: row.phone ? (1 as const) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" title="No suppliers yet" body="Add the booksellers the library buys from." />
        </Surface>
      )}
    </MobileScreen>
  )
}
