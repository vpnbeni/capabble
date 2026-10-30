import { useLocalSearchParams, useRouter } from 'expo-router'
import { UserPlus, Users } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { CouncilApplication } from '@/services/activityService'
import type { StudentRow } from '@/services/studentService'
import { useAddApplication, useCouncil, useRemoveApplication, useRemovePost, useSavePost, useSetApplication } from '@/staff/activityQueries'
import { POST_FIELDS, POST_STATUS, postInput, postValues } from '@/staff/activitySetupKinds'
import { useStudentSearch } from '@/staff/queries'
import { RecordSheet, type RecordValues } from '@/staff/RecordSheet'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileScreen, NavBar, SearchBar, Section, StatusView, Surface, Switch, haptic, useToast } from '@/ui'

const APPLICATION: Record<CouncilApplication['status'], { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  accepted: { label: 'Chosen', tone: 'success' },
  rejected: { label: 'Not chosen', tone: 'danger' },
}

/**
 * A council post (the website's Student council): its details, whether it is taking applications,
 * and the students who applied, each chosen or not. Choosing stops at the post's seats. The
 * in-charge puts a student forward here as on the website.
 */
export default function CouncilPostScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('actvt.activities.write')
  const { councilId, postId } = useLocalSearchParams<{ councilId: string; postId: string }>()
  const council = useCouncil(councilId)
  const savePost = useSavePost()
  const removePost = useRemovePost()
  const addApplication = useAddApplication()
  const setApplication = useSetApplication()
  const removeApplication = useRemoveApplication()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState<CouncilApplication | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [query, setQuery] = useState('')
  const students = useStudentSearch(adding ? query.trim() : '')

  const post = council.data?.posts.find((row) => row._id === postId)
  const applications = (council.data?.registrations ?? []).filter((row) => String(row.postId) === postId)
  const initial = useMemo(() => postValues(post), [post])
  const taking = post?.registrationStatus === 'open' || post?.registrationStatus === 'accepting'
  const isHouse = council.data?.council.councilType === 'house'

  const fail = (failure: unknown, fallback: string) => {
    haptic.error()
    toast(failure instanceof ApiError ? failure.message : fallback, 'danger')
  }

  const saveDetails = async (changes: RecordValues) => {
    if (!Object.keys(changes).length) return setEditing(false)
    try {
      await savePost.mutateAsync({ council: council.data!.council, id: postId, input: postInput(changes) })
      haptic.success()
      setEditing(false)
      toast('Saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const setTaking = async (on: boolean) => {
    try {
      await savePost.mutateAsync({ council: council.data!.council, id: postId, input: { registrationStatus: on ? 'open' : 'closed' } })
      haptic.success()
    } catch (failure) {
      fail(failure, "It didn't change. Try again.")
    }
  }

  const decide = async (row: CouncilApplication, status: CouncilApplication['status']) => {
    setChoosing(null)
    try {
      await setApplication.mutateAsync({ id: row._id, status })
      haptic.success()
      toast(status === 'accepted' ? `${row.studentName} chosen` : status === 'rejected' ? `${row.studentName} not chosen` : `${row.studentName} back to waiting`)
    } catch (failure) {
      fail(failure, "It didn't change. Try again.")
    }
  }

  const withdraw = async (row: CouncilApplication) => {
    setChoosing(null)
    try {
      await removeApplication.mutateAsync(row._id)
      haptic.medium()
      toast(`${row.studentName}'s application removed`)
    } catch (failure) {
      fail(failure, "It wasn't removed. Try again.")
    }
  }

  const putForward = async (student: StudentRow) => {
    setAdding(false)
    setQuery('')
    try {
      await addApplication.mutateAsync({ postId, student })
      haptic.success()
      toast(`${student.name} applied`)
    } catch (failure) {
      fail(failure, "The application wasn't saved. Try again.")
    }
  }

  const doRemovePost = async () => {
    setConfirmRemove(false)
    try {
      await removePost.mutateAsync(postId)
      haptic.medium()
      toast('Post removed')
      router.back()
    } catch (failure) {
      fail(failure, "The post wasn't removed. Try again.")
    }
  }

  return (
    <MobileScreen
      refreshing={council.isRefetching}
      onRefresh={council.refetch}
      nav={<NavBar title={post?.title ?? 'Post'} back={{ label: 'Council', onPress: router.back }} />}
      actionBar={
        canWrite && post && taking ? (
          <ActionBar
            icon={UserPlus}
            summary={`${post.acceptedCount} of ${post.seats} chosen`}
            detail={`${applications.length} applied`}
            label="Add an applicant"
            onPress={() => (setQuery(''), setAdding(true))}
          />
        ) : undefined
      }
      overlay={
        <>
          <RecordSheet
            open={editing}
            onClose={() => setEditing(false)}
            title={post?.title ?? 'Post'}
            fields={POST_FIELDS}
            initial={initial}
            isNew={false}
            saving={savePost.isPending}
            error={error}
            onSave={saveDetails}
            onRemove={() => (setEditing(false), setConfirmRemove(true))}
            removeLabel="Remove post"
          />
          <ActionSheet
            open={confirmRemove}
            onClose={() => setConfirmRemove(false)}
            title={`Remove ${post?.title ?? 'this post'}?`}
            message="Its applications leave the lists too."
            actions={[{ label: 'Remove post', tone: 'danger', onSelect: doRemovePost }]}
          />
          <ActionSheet
            open={Boolean(choosing)}
            onClose={() => setChoosing(null)}
            title={choosing?.studentName ?? ''}
            message={choosing ? classLabel(choosing.className, choosing.section) : undefined}
            actions={
              choosing
                ? [
                    ...(choosing.status !== 'accepted' ? [{ label: 'Choose for the post', onSelect: () => decide(choosing, 'accepted') }] : []),
                    ...(choosing.status !== 'rejected' ? [{ label: 'Not chosen', onSelect: () => decide(choosing, 'rejected') }] : []),
                    ...(choosing.status !== 'pending' ? [{ label: 'Back to waiting', onSelect: () => decide(choosing, 'pending') }] : []),
                    { label: 'Remove the application', tone: 'danger' as const, onSelect: () => withdraw(choosing) },
                  ]
                : []
            }
          />
          <BottomSheet open={adding} onClose={() => (setAdding(false), setQuery(''))} title="Add an applicant" detent="large">
            <View style={{ gap: space['space-3'] }}>
              <SearchBar label="Search students" placeholder="Name or admission number" value={query} onChange={setQuery} />
              {query.trim().length < 2 ? (
                <StatusView compact kind="empty" icon={Users} title="Type two letters of the name" />
              ) : (
                <ListGroup
                  items={(students.data ?? [])
                    .filter((row) => !applications.some((application) => application.studentId === row._id))
                    .map((row) => ({
                      title: row.name,
                      subtitle: [classLabel(row.class, row.section), row.rollNumber].filter(Boolean).join(' · '),
                      onPress: () => putForward(row),
                    }))}
                />
              )}
            </View>
          </BottomSheet>
        </>
      }
    >
      {council.isPending ? (
        <CardSkeleton rows={5} />
      ) : council.isError || !post ? (
        <LoadFailed what="The post" error={council.error} onRetry={council.refetch} />
      ) : (
        <>
          {isHouse && canWrite ? (
            <Callout tone="info" title="A house council post">
              New posts go on every house’s council; a change here is for this house only.
            </Callout>
          ) : null}
          <ListGroup
            items={[
              {
                title: post.title,
                subtitle:
                  [
                    `${post.seats} ${post.seats === 1 ? 'seat' : 'seats'}`,
                    post.preferredGender ? `${post.preferredGender}s` : null,
                    post.preferredClasses?.length ? `class ${post.preferredClasses.join(', ')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') + (post.description ? `\n${post.description}` : ''),
                lines: 3 as const,
                chevron: canWrite,
                onPress: canWrite ? () => (setError(null), setEditing(true)) : undefined,
              },
              {
                title: 'Taking applications',
                badge: taking ? undefined : POST_STATUS.closed,
                accessory: canWrite ? <Switch label="Taking applications" value={taking} onChange={setTaking} /> : undefined,
              },
            ]}
          />
          <Section title="Applied">
            {applications.length ? (
              <ListGroup
                footer={post.acceptedCount >= post.seats ? 'Every seat is filled; free one before choosing someone else.' : undefined}
                items={applications.map((row) => ({
                  title: row.studentName,
                  subtitle: classLabel(row.className, row.section) || undefined,
                  badge: APPLICATION[row.status],
                  onPress: canWrite ? () => setChoosing(row) : undefined,
                }))}
              />
            ) : (
              <Surface padded={false}>
                <StatusView compact kind="empty" icon={Users} title="Nobody has applied yet" body={taking ? undefined : 'Turn on taking applications first.'} />
              </Surface>
            )}
          </Section>
        </>
      )}
    </MobileScreen>
  )
}
