import { useRouter } from 'expo-router'
import { BookCopy, BookOpen, CornerDownLeft, Library, Search } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate, formatINR, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Fine, Loan } from '@/services/libraryService'
import { useFines, useLibraryTitles, useLibraryToday, useLoans, useRenewLoan, useReturnBook, useWaiveFine } from '@/staff/libraryQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ChipRail, Dialog, Hero, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, SearchBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

type View_ = 'out' | 'catalogue' | 'fines'

/**
 * The library desk: books out (overdue first), return a book by its accession number, renew a
 * loan, look a title up in the catalogue, and fines. Issuing has its own screen.
 */
export default function LibraryScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const today = schoolToday()
  const [view, setView] = useState<View_>('out')
  const summary = useLibraryToday()
  const loans = useLoans()
  const [query, setQuery] = useState('')
  const titles = useLibraryTitles(query.trim(), view === 'catalogue')
  const fines = useFines(view === 'fines')
  const giveBack = useReturnBook()
  const renew = useRenewLoan()
  const waive = useWaiveFine()
  const [returning, setReturning] = useState(false)
  const [code, setCode] = useState('')
  const [condition, setCondition] = useState<'good' | 'damaged' | 'requires_inspection'>('good')
  const [open, setOpen] = useState<Loan | null>(null)
  const [waiving, setWaiving] = useState<Fine | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const out = [...(loans.data ?? [])].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const overdue = (loan: Loan) => loan.dueAt.slice(0, 10) < today

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    const message = failure instanceof ApiError ? failure.message : fallback
    return message
  }

  const doReturn = async (value = code) => {
    if (!value.trim()) return setError('Type the accession number on the book.')
    try {
      await giveBack.mutateAsync({ code: value.trim(), condition })
      haptic.success()
      toast('Book returned')
      setReturning(false)
      setCode('')
      setCondition('good')
      setError(null)
    } catch (failure) {
      setError(fail(failure, "It wasn't returned. Try again."))
    }
  }

  const doRenew = async (loan: Loan) => {
    setOpen(null)
    try {
      const next = await renew.mutateAsync(loan._id)
      haptic.success()
      toast(`Renewed until ${formatDate(next.dueAt)}`)
    } catch (failure) {
      toast(fail(failure, "It wasn't renewed. Try again."), 'danger')
    }
  }

  const doWaive = async () => {
    if (!waiving) return
    if (!reason.trim()) {
      haptic.error()
      toast('Write why the fine is waived', 'danger')
      return
    }
    try {
      await waive.mutateAsync({ id: waiving._id, reason: reason.trim() })
      haptic.medium()
      toast('Fine waived')
      setWaiving(null)
      setReason('')
    } catch (failure) {
      toast(fail(failure, "It wasn't waived. Try again."), 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={loans.isRefetching || summary.isRefetching}
      onRefresh={() => (loans.refetch(), summary.refetch())}
      nav={
        <NavBar
          title="Library"
          back={{ label: 'Back', onPress: router.back }}
          actions={staff.can('libry.circulation.return') ? [{ icon: CornerDownLeft, label: 'Return a book', onPress: () => (setError(null), setReturning(true)) }] : []}
        />
      }
      actionBar={staff.can('libry.circulation.issue') ? <ActionBar icon={BookCopy} summary={`${summary.data?.issued ?? 0} books out`} detail={summary.data?.overdue ? `${summary.data.overdue} overdue` : undefined} label="Issue a book" onPress={() => router.push('/library/issue')} /> : undefined}
      overlay={
        <>
          <BottomSheet
            open={returning}
            onClose={() => setReturning(false)}
            title="Return a book"
            description="Type the accession number on the book's label."
            footer={
              <MobileButton fullWidth loading={giveBack.isPending} onPress={() => doReturn()}>
                Return book
              </MobileButton>
            }
          >
            {error ? (
              <Callout tone="danger" title="Not returned">
                {error}
              </Callout>
            ) : null}
            <View style={{ gap: space['space-4'] }}>
              <MobileTextField label="Accession number" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={40} returnKeyType="done" onSubmitEditing={() => doReturn()} />
              <SegmentedControl
                label="Condition"
                value={condition}
                onChange={setCondition}
                options={[
                  { value: 'good', label: 'Fine' },
                  { value: 'damaged', label: 'Damaged' },
                  { value: 'requires_inspection', label: 'Check it' },
                ]}
              />
            </View>
          </BottomSheet>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open?.copyId?.titleId?.title ?? 'Book'}
            message={open ? `${open.memberId?.name ?? ''} · due ${formatDate(open.dueAt)} · ${open.copyId?.accessionNumber ?? ''}` : undefined}
            actions={
              open
                ? [
                    ...(staff.can('libry.circulation.return') ? [{ label: 'Return book', icon: CornerDownLeft, onSelect: () => (setOpen(null), doReturn(open.copyId?.accessionNumber ?? '')) }] : []),
                    ...(staff.can('libry.circulation.renew') ? [{ label: 'Renew loan', onSelect: () => doRenew(open) }] : []),
                  ]
                : []
            }
          />
          <Dialog
            open={Boolean(waiving)}
            onClose={() => setWaiving(null)}
            tone="danger"
            title={`Waive ${formatINR(waiving?.outstandingAmount ?? 0)}?`}
            description={waiving?.memberId?.name}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setWaiving(null)}>
                  Keep fine
                </MobileButton>
                <MobileButton variant="destructive" loading={waive.isPending} onPress={doWaive}>
                  Waive
                </MobileButton>
              </>
            }
          >
            <MobileTextField label="Reason" value={reason} onChangeText={setReason} placeholder="Book found, first time…" maxLength={300} />
          </Dialog>
        </>
      }
    >
      <Hero
        tone={summary.data?.overdue ? 'soft' : 'surface'}
        icon={Library}
        label="Today"
        value={`${summary.data?.dueToday ?? 0} due back`}
        detail={summary.data ? `${summary.data.overdue} overdue · ${summary.data.todayIssues} issued and ${summary.data.todayReturns} returned today` : ' '}
      />
      <ChipRail
        label="Show"
        value={view}
        onChange={setView}
        items={[
          { id: 'out', label: 'Books out', count: out.length },
          { id: 'catalogue', label: 'Catalogue' },
          { id: 'fines', label: 'Fines' },
        ]}
      />
      {view === 'out' ? (
        loans.isPending ? (
          <CardSkeleton rows={4} />
        ) : loans.isError ? (
          <LoadFailed what="Books out" error={loans.error} onRetry={loans.refetch} />
        ) : out.length ? (
          <ListGroup
            items={out.map((loan) => ({
              title: loan.copyId?.titleId?.title ?? loan.copyId?.accessionNumber ?? 'Book',
              subtitle: [loan.memberId?.name, loan.memberId?.className ? classLabel(loan.memberId.className, loan.memberId.section) : null, `due ${formatDate(loan.dueAt)}`].filter(Boolean).join(' · '),
              lines: 2,
              icon: BookOpen,
              tile: 1,
              badge: overdue(loan) ? { label: 'Overdue', tone: 'danger' as const } : loan.dueAt.slice(0, 10) === today ? { label: 'Due today', tone: 'warning' as const } : undefined,
              onPress: () => setOpen(loan),
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={BookOpen} title="No books out" body="Books you issue show here until they come back." />
          </Surface>
        )
      ) : view === 'catalogue' ? (
        <>
          <SearchBar label="Search the catalogue" placeholder="Title, author or ISBN" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
          {titles.isPending ? (
            <CardSkeleton rows={3} />
          ) : titles.isError ? (
            <LoadFailed what="The catalogue" error={titles.error} onRetry={titles.refetch} />
          ) : titles.data?.length ? (
            <ListGroup
              items={titles.data.map((title) => ({
                title: title.title,
                subtitle: [title.authors?.join(', '), title.classificationCode].filter(Boolean).join(' · ') || undefined,
                value: title.inventory ? `${title.inventory.available} of ${title.inventory.copies}` : undefined,
                lines: 2,
                icon: BookOpen,
                tile: 1,
              }))}
              footer="Copies on the shelf, of all copies."
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Search} title={query.trim() ? 'No book found' : 'The catalogue is empty'} body={query.trim() ? 'Try the author, or part of the title.' : 'Books are added to the catalogue on the website.'} />
            </Surface>
          )}
        </>
      ) : fines.isPending ? (
        <CardSkeleton rows={3} />
      ) : fines.isError ? (
        <LoadFailed what="Fines" error={fines.error} onRetry={fines.refetch} />
      ) : fines.data?.length ? (
        <ListGroup
          items={fines.data.map((fine) => ({
            title: fine.memberId?.name ?? 'Member',
            subtitle: [fine.reason || fine.kind, formatDate(fine.createdAt)].filter(Boolean).join(' · '),
            value: formatINR(fine.status === 'open' ? fine.outstandingAmount : fine.amount),
            badge: fine.status === 'open' ? { label: 'Open', tone: 'warning' as const } : { label: fine.status === 'waived' ? 'Waived' : 'Paid', tone: 'neutral' as const },
            lines: 2,
            onPress: fine.status === 'open' && staff.can('libry.fines.waive') ? () => setWaiving(fine) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" title="No fines" body="Fines for late or lost books show here." />
        </Surface>
      )}
    </MobileScreen>
  )
}
