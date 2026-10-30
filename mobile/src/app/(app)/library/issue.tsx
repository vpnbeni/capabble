import { useRouter } from 'expo-router'
import { BookCopy } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { libraryService, type LibraryCopy, type LibraryMember } from '@/services/libraryService'
import { useIssueBook } from '@/staff/libraryQueries'
import { space } from '@/theme/tokens'
import { ScanSheet } from '@/staff/ScanSheet'
import { ActionBar, Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, NavBar, SearchBar, haptic, useToast } from '@/ui'

type Borrower = { member: LibraryMember; activeLoans: number; eligible: boolean; policy: { maxActiveLoans: number; loanDays: number } | null }

/**
 * Issue a book at the desk: find the borrower (their library ID, or search by name), type the
 * book's accession number, issue. The due date follows the borrower's policy and school days.
 */
export default function IssueBookScreen() {
  const router = useRouter()
  const toast = useToast()
  const issue = useIssueBook()
  const [memberCode, setMemberCode] = useState('')
  const [borrower, setBorrower] = useState<Borrower | null>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<LibraryMember[]>([])
  const [bookCode, setBookCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [copy, setCopy] = useState<LibraryCopy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const message = (failure: unknown, fallback: string) => (failure instanceof ApiError ? failure.message : fallback)

  const findMember = async (code = memberCode) => {
    if (!code.trim()) return
    setBusy(true)
    try {
      setBorrower(await libraryService.member(code.trim()))
      setError(null)
      setMatches([])
    } catch (failure) {
      haptic.error()
      setBorrower(null)
      setError(message(failure, "Couldn't find that borrower."))
    } finally {
      setBusy(false)
    }
  }

  const searchMembers = async (text: string) => {
    setQuery(text)
    if (text.trim().length < 2) return setMatches([])
    try {
      setMatches((await libraryService.members(text.trim())).items.slice(0, 20))
    } catch {
      setMatches([])
    }
  }

  const findCopy = async (scanned?: string) => {
    const value = (scanned ?? bookCode).trim()
    if (!value) return
    if (scanned) setBookCode(scanned)
    setBusy(true)
    try {
      const found = await libraryService.copy(value)
      setCopy(found)
      setError(found.status === 'available' ? null : `This copy is ${found.status}, not on the shelf.`)
    } catch (failure) {
      haptic.error()
      setCopy(null)
      setError(message(failure, "Couldn't find that book."))
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!borrower) return setError('Find the borrower first.')
    if (!borrower.eligible) return setError(borrower.policy ? `${borrower.member.name} already has ${borrower.activeLoans} of ${borrower.policy.maxActiveLoans} books.` : 'There is no borrowing policy for this kind of member.')
    if (!copy) return setError('Type the accession number and find the book.')
    try {
      await issue.mutateAsync({ memberId: borrower.member._id, copyId: copy._id })
      haptic.success()
      toast(`${copy.titleId?.title ?? 'Book'} issued to ${borrower.member.name}`)
      // Ready for the next book to the same borrower.
      setCopy(null)
      setBookCode('')
      setBorrower({ ...borrower, activeLoans: borrower.activeLoans + 1, eligible: Boolean(borrower.policy) && borrower.activeLoans + 1 < (borrower.policy?.maxActiveLoans ?? 0) })
      setError(null)
    } catch (failure) {
      haptic.error()
      setError(message(failure, "The book wasn't issued. Try again."))
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title="Issue a book" back={{ label: 'Library', onPress: router.back }} />}
      actionBar={
        borrower && copy ? (
          <ActionBar icon={BookCopy} summary={copy.titleId?.title ?? copy.accessionNumber} detail={`To ${borrower.member.name}`} label={issue.isPending ? 'Issuing…' : 'Issue book'} onPress={submit} />
        ) : undefined
      }
      overlay={<ScanSheet open={scanning} onClose={() => setScanning(false)} onScan={(value) => findCopy(value)} title="Scan the book's label" />}
    >
      {error ? (
        <Callout tone="danger" title="Can't issue yet">
          {error}
        </Callout>
      ) : null}
      {borrower ? (
        <ListGroup
          header="Borrower"
          items={[
            {
              title: borrower.member.name,
              subtitle: [borrower.member.memberId, borrower.member.className ? classLabel(borrower.member.className, borrower.member.section) : borrower.member.memberType, borrower.policy ? `${borrower.activeLoans} of ${borrower.policy.maxActiveLoans} books out` : null]
                .filter(Boolean)
                .join(' · '),
              lines: 2,
              badge: borrower.eligible ? undefined : { label: 'Limit reached', tone: 'warning' as const },
              onPress: () => (setBorrower(null), setCopy(null)),
            },
          ]}
          footer="Tap to change the borrower."
        />
      ) : (
        <View style={{ gap: space['space-3'] }}>
          <MobileTextField label="Borrower's library ID" value={memberCode} onChangeText={setMemberCode} autoCapitalize="characters" returnKeyType="search" onSubmitEditing={() => findMember()} maxLength={40} />
          <MobileButton variant="tinted" loading={busy} onPress={() => findMember()}>
            Find borrower
          </MobileButton>
          <SearchBar label="Or search by name" placeholder="Or search by name" value={query} onChange={searchMembers} onCancel={() => searchMembers('')} />
          {matches.length ? (
            <ListGroup
              items={matches.map((member) => ({
                title: member.name,
                subtitle: [member.memberId, member.className ? classLabel(member.className, member.section) : member.memberType].filter(Boolean).join(' · '),
                onPress: () => (setMemberCode(member.memberId), findMember(member.memberId)),
              }))}
            />
          ) : null}
        </View>
      )}
      {borrower ? (
        copy ? (
          <ListGroup
            header="Book"
            items={[{ title: copy.titleId?.title ?? 'Book', subtitle: [copy.accessionNumber, copy.titleId?.authors?.join(', '), copy.shelfLocation].filter(Boolean).join(' · '), lines: 2, onPress: () => setCopy(null) }]}
            footer="Tap to choose another book."
          />
        ) : (
          <View style={{ gap: space['space-3'] }}>
            <MobileTextField label="Accession number" hint="On the label inside the book." value={bookCode} onChangeText={setBookCode} autoCapitalize="characters" returnKeyType="search" onSubmitEditing={() => findCopy()} maxLength={40} />
            <MobileButton variant="tinted" loading={busy} onPress={() => findCopy()}>
              Find book
            </MobileButton>
            <MobileButton variant="gray" onPress={() => setScanning(true)}>
              Scan the label
            </MobileButton>
          </View>
        )
      ) : null}
    </MobileScreen>
  )
}
