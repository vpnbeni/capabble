import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { BookPlus } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { libraryService, type LibraryTitle } from '@/services/libraryService'
import { accessionRun, copiesError, useAddCopies, useCreateTitle } from '@/staff/libraryQueries'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, Stepper, haptic, useToast } from '@/ui'

/**
 * Adding a book to the catalogue (the website's Catalogue → Add title, then its copies): look it up
 * by ISBN, or type its details, then its copies as a run of accession numbers. Opened from a
 * catalogue title it only adds copies.
 */
export default function AddBookScreen() {
  const router = useRouter()
  const toast = useToast()
  const params = useLocalSearchParams<{ titleId?: string; title?: string }>()
  const createTitle = useCreateTitle()
  const addCopies = useAddCopies()
  const [existing, setExisting] = useState<Pick<LibraryTitle, '_id' | 'title' | 'authors'> | null>(params.titleId ? { _id: params.titleId, title: params.title ?? 'Book' } : null)
  const [isbn, setIsbn] = useState('')
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [publisher, setPublisher] = useState('')
  const [year, setYear] = useState('')
  const [classCode, setClassCode] = useState('')
  const [first, setFirst] = useState('')
  const [count, setCount] = useState(1)
  const [price, setPrice] = useState('')
  const [looking, setLooking] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<'title' | 'first' | 'year' | 'form', string>>>({})
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [done, setDone] = useState(false)
  const busy = createTitle.isPending || addCopies.isPending
  const touched = !done && Boolean(title || first || isbn || authors)
  const allowLeaving = usePreventRemove(touched && !busy, ({ repeat }) => setLeaving(() => repeat))

  const run = first.trim() ? accessionRun(first, count) : null

  const lookUp = async () => {
    const code = isbn.replace(/[^0-9Xx]/g, '')
    if (!code || existing) return
    setLooking(true)
    try {
      const found = await libraryService.titleByIsbn(code)
      setExisting(found)
      haptic.success()
    } catch (failure) {
      // Not in the catalogue yet: they type the details.
      if (!(failure instanceof ApiError && failure.status === 404)) setErrors({ form: copiesError(failure, "The ISBN look-up didn't work. Type the book's details.") })
    } finally {
      setLooking(false)
    }
  }

  const submit = async () => {
    const next: typeof errors = {}
    const yearNumber = Number(year)
    if (!existing && !title.trim()) next.title = 'Enter the book’s title.'
    if (year && (!Number.isInteger(yearNumber) || yearNumber < 1500 || yearNumber > 2100)) next.year = 'Enter a year like 2024.'
    if (!first.trim()) next.first = 'Enter the accession number on the first copy.'
    else if (!run) next.first = 'For more than one copy, the number must end in digits, like LIB-0098.'
    setErrors(next)
    if (Object.keys(next).length || !run) return haptic.error()
    const each = price ? Number(price) : undefined
    try {
      // Keep a title made on an earlier try, so trying again only adds the copies.
      const book =
        existing ??
        (await createTitle.mutateAsync({
          title: title.trim(),
          authors: authors.trim() || undefined,
          isbn13: isbn.replace(/[^0-9Xx]/g, '') || undefined,
          publisher: publisher.trim() || undefined,
          publicationYear: year ? yearNumber : undefined,
          classificationCode: classCode.trim() || undefined,
        }))
      setExisting(book)
      await addCopies.mutateAsync({ titleId: book._id, copies: run.map((accessionNumber) => ({ accessionNumber, price: each })) })
      haptic.success()
      setDone(true)
      allowLeaving()
      toast(`${book.title}: ${run.length} ${run.length === 1 ? 'copy' : 'copies'} added`)
      router.back()
    } catch (failure) {
      haptic.error()
      setErrors({ form: copiesError(failure, "The book wasn't added. Check your connection and try again.") })
    }
  }

  return (
    <MobileScreen
      nav={<NavBar title={params.titleId ? 'Add copies' : 'Add a book'} back={{ label: 'Library', onPress: router.back }} />}
      actionBar={
        <ActionBar
          icon={BookPlus}
          summary={existing?.title ?? (title.trim() || 'New book')}
          detail={run ? `${run.length} ${run.length === 1 ? 'copy' : 'copies'}: ${run[0]}${run.length > 1 ? ` to ${run[run.length - 1]}` : ''}` : 'Add its copies below'}
          label={busy ? 'Adding…' : existing ? 'Add copies' : 'Add book'}
          onPress={submit}
        />
      }
      overlay={
        <ActionSheet
          open={Boolean(leaving)}
          onClose={() => setLeaving(null)}
          title="Discard this book?"
          actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
          cancelLabel="Keep editing"
        />
      }
    >
      {errors.form ? (
        <Callout tone="danger" title="Not added">
          {errors.form}
        </Callout>
      ) : null}
      {existing ? (
        <ListGroup
          header="Book"
          footer={params.titleId ? undefined : 'Already in the catalogue: these copies are added to it.'}
          items={[{ title: existing.title, subtitle: existing.authors?.join(', ') || undefined, lines: 2 }]}
        />
      ) : (
        <View style={{ gap: space['space-4'] }}>
          <MobileTextField
            label="ISBN (optional)"
            hint={looking ? 'Looking it up…' : 'From the back cover. If the library has it, its details fill in.'}
            type="number"
            value={isbn}
            onChangeText={setIsbn}
            onBlur={lookUp}
            onSubmitEditing={lookUp}
            maxLength={17}
            returnKeyType="next"
          />
          <MobileTextField label="Title" value={title} onChangeText={setTitle} error={errors.title} maxLength={500} returnKeyType="next" />
          <MobileTextField label="Authors (optional)" hint="Separate several with commas." value={authors} onChangeText={setAuthors} maxLength={300} returnKeyType="next" />
          <MobileTextField label="Publisher (optional)" value={publisher} onChangeText={setPublisher} maxLength={200} returnKeyType="next" />
          <MobileTextField label="Year (optional)" type="number" value={year} onChangeText={(text) => setYear(text.replace(/[^0-9]/g, ''))} error={errors.year} maxLength={4} returnKeyType="next" />
          <MobileTextField label="Class number (optional)" hint="Where it sits on the shelf, like 823.914." value={classCode} onChangeText={setClassCode} maxLength={40} returnKeyType="next" />
        </View>
      )}
      <View style={{ gap: space['space-4'] }}>
        <MobileTextField
          label="Accession number of the first copy"
          hint="The other copies follow on from it."
          value={first}
          onChangeText={setFirst}
          error={errors.first}
          autoCapitalize="characters"
          maxLength={40}
          returnKeyType="next"
        />
        <Stepper label="How many copies" value={count} onChange={setCount} min={1} max={50} />
        <MobileTextField label="Price of each (optional)" type="number" prefix="₹" value={price} onChangeText={(text) => setPrice(text.replace(/[^0-9.]/g, ''))} maxLength={8} />
      </View>
    </MobileScreen>
  )
}
