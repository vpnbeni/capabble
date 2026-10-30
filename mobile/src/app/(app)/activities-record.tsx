import { useLocalSearchParams, useRouter } from 'expo-router'
import { Flag, Image as ImageIcon, Plus, Trophy, UserPlus, Users } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel } from '@/lib/format'
import { pickImage } from '@/lib/pickFile'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Club, CouncilMember, House, HouseTeacher, SetupKind, SetupRecord } from '@/services/activityService'
import { useActivityImage, useCouncil, useSaveSetupRecord, useSavePost, useSetupRecords, useUpdateHouse } from '@/staff/activityQueries'
import { KINDS, POST_FIELDS, POST_STATUS, postInput, postValues, valuesOf } from '@/staff/activitySetupKinds'
import { useColleagues, useStudentSearch } from '@/staff/queries'
import { RecordSheet, type RecordValues } from '@/staff/RecordSheet'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, Avatar, BottomSheet, ListGroup, MobileScreen, NavBar, OptionList, SearchBar, Section, StatusView, Surface, haptic, useToast } from '@/ui'

type Kind = Extract<SetupKind, 'houses' | 'clubs' | 'councils'>

const TEACHER_ROLES = ['House Master', 'House Mistress', 'Assistant House Teacher', 'Mentor', 'House Teacher']
const MEMBER_ROLES = ['House Captain', 'Vice Captain', 'Secretary', 'Prefect', 'Sports Captain', 'Cultural Captain', 'Member']

/**
 * A house, club or council from Set up activities (the website's house, club and council pages):
 * its details, a house's or club's logo (and a house's flag) from the phone's photos, a house's
 * teachers and council members, and a council's posts. Each change saves on its own.
 */
export default function ActivityRecordScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { kind, id } = useLocalSearchParams<{ kind: Kind; id: string }>()
  const spec = KINDS[kind]
  const records = useSetupRecords(kind)
  const record = records.data?.find((row) => row._id === id)
  const council = useCouncil(kind === 'councils' ? id : '')
  const saveRecord = useSaveSetupRecord()
  const updateHouse = useUpdateHouse()
  const image = useActivityImage()
  const savePost = useSavePost()
  const canWrite = staff.can('actvt.activities.write')

  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageMenu, setImageMenu] = useState<'logo' | 'flag' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Adding a house teacher or council member: pick the person, then their role.
  const [adding, setAdding] = useState<null | 'teacher' | 'member'>(null)
  const [person, setPerson] = useState<null | { teacher?: HouseTeacher; member?: CouncilMember }>(null)
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<null | { teacher?: number; member?: number }>(null)
  const [addingPost, setAddingPost] = useState(false)
  const colleagues = useColleagues(adding === 'teacher' ? query.trim() : '')
  const students = useStudentSearch(adding === 'member' ? query.trim() : '')
  const initial = useMemo(() => valuesOf(spec.fields, record), [spec.fields, record])
  const newPost = useMemo(() => postValues(), [])

  const house = kind === 'houses' ? (record as unknown as House | undefined) : undefined
  const club = kind === 'clubs' ? (record as unknown as Club | undefined) : undefined
  const name = String(record?.[spec.title] ?? '')

  const saveDetails = async (changes: RecordValues) => {
    if (!Object.keys(changes).length) return setEditing(false)
    try {
      await saveRecord.mutateAsync({ kind, id, input: changes })
      haptic.success()
      setEditing(false)
      toast('Saved')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.")
    }
  }

  const changeImage = async (field: 'logo' | 'flag', from: 'gallery' | 'camera' | 'clear') => {
    setImageMenu(null)
    const picked = from === 'clear' ? null : await pickImage({ camera: from === 'camera', square: field === 'logo' })
    if (from !== 'clear' && !picked) return
    setBusy(field)
    try {
      await image.mutateAsync({ kind: kind === 'clubs' ? 'clubs' : 'houses', id, field, picked })
      haptic.success()
      toast(from === 'clear' ? 'Logo removed' : field === 'flag' ? 'Flag changed' : 'Logo changed')
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The photo wasn't saved. Try again.", 'danger')
    } finally {
      setBusy(null)
    }
  }

  /** Sends the house's whole list of teachers or members with the one change. */
  const saveHouseList = async (input: { teachers?: HouseTeacher[]; councilMembers?: CouncilMember[] }, done: string) => {
    try {
      await updateHouse.mutateAsync({ id, input })
      haptic.success()
      toast(done)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't saved. Try again.", 'danger')
    }
  }

  const addWithRole = (role: string) => {
    if (!house || !person) return
    const added = person
    setAdding(null)
    setPerson(null)
    setQuery('')
    if (added.teacher) void saveHouseList({ teachers: [...(house.teachers ?? []), { ...added.teacher, role }] }, `${added.teacher.name} added`)
    if (added.member) void saveHouseList({ councilMembers: [...(house.councilMembers ?? []), { ...added.member, role }] }, `${added.member.name} added`)
  }

  const doRemove = () => {
    if (!house || !removing) return
    const which = removing
    setRemoving(null)
    if (which.teacher !== undefined) void saveHouseList({ teachers: (house.teachers ?? []).filter((_, index) => index !== which.teacher) }, 'Removed from the house')
    if (which.member !== undefined) void saveHouseList({ councilMembers: (house.councilMembers ?? []).filter((_, index) => index !== which.member) }, 'Removed from the council')
  }

  const addPost = async (values: RecordValues) => {
    const target = council.data?.council
    if (!target) return
    try {
      await savePost.mutateAsync({ council: target, input: postInput(values) })
      haptic.success()
      setAddingPost(false)
      toast(target.councilType === 'house' ? `${values.title} added to every house council` : `${values.title} added`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The post wasn't added. Try again.")
    }
  }

  const removingName = removing?.teacher !== undefined ? house?.teachers?.[removing.teacher]?.name : removing?.member !== undefined ? house?.councilMembers?.[removing.member]?.name : ''
  const pickingRole = Boolean(person)
  const loading = records.isPending || (kind === 'councils' && council.isPending)
  const failed = records.isError || (kind === 'councils' && council.isError)

  return (
    <MobileScreen
      refreshing={records.isRefetching || council.isRefetching}
      onRefresh={() => (records.refetch(), kind === 'councils' ? council.refetch() : undefined)}
      nav={<NavBar title={name || spec.chip} back={{ label: 'Set up', onPress: router.back }} />}
      actionBar={
        canWrite && kind === 'councils' && council.data ? (
          <ActionBar
            icon={Plus}
            summary={`${council.data.posts.length} posts`}
            detail={council.data.council.councilType === 'house' ? 'Posts are the same on every house council' : undefined}
            label="Add a post"
            onPress={() => (setError(null), setAddingPost(true))}
          />
        ) : undefined
      }
      overlay={
        <>
          <RecordSheet
            open={editing}
            onClose={() => setEditing(false)}
            title={name}
            fields={spec.fields}
            initial={initial}
            isNew={false}
            saving={saveRecord.isPending}
            error={error}
            onSave={saveDetails}
          />
          <RecordSheet
            open={addingPost}
            onClose={() => setAddingPost(false)}
            title="Add a post"
            fields={POST_FIELDS}
            initial={newPost}
            isNew
            saving={savePost.isPending}
            error={error}
            onSave={addPost}
          />
          <ActionSheet
            open={Boolean(imageMenu)}
            onClose={() => setImageMenu(null)}
            title={imageMenu === 'flag' ? 'The house flag' : 'The logo'}
            actions={[
              { label: 'Choose a photo', onSelect: () => imageMenu && changeImage(imageMenu, 'gallery') },
              { label: 'Take a photo', onSelect: () => imageMenu && changeImage(imageMenu, 'camera') },
              ...(imageMenu === 'logo' && (house?.logo || club?.logo) ? [{ label: 'Remove the logo', tone: 'danger' as const, onSelect: () => changeImage('logo', 'clear') }] : []),
            ]}
          />
          <ActionSheet
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            title={`Remove ${removingName}?`}
            actions={[{ label: removing?.teacher !== undefined ? 'Remove from the house' : 'Remove from the council', tone: 'danger', onSelect: doRemove }]}
          />
          <BottomSheet
            open={Boolean(adding)}
            onClose={() => (pickingRole ? setPerson(null) : (setAdding(null), setQuery('')))}
            title={pickingRole ? `${person?.teacher?.name ?? person?.member?.name}: role` : adding === 'teacher' ? 'Add a house teacher' : 'Add a council member'}
            detent="large"
          >
            {pickingRole ? (
              <OptionList label="Role" value="" onChange={addWithRole} options={(adding === 'teacher' ? TEACHER_ROLES : MEMBER_ROLES).map((value) => ({ value, label: value }))} />
            ) : (
              <View style={{ gap: space['space-3'] }}>
                <SearchBar
                  label={adding === 'teacher' ? 'Search staff' : 'Search students'}
                  placeholder={adding === 'teacher' ? 'Name or phone' : 'Name or admission number'}
                  value={query}
                  onChange={setQuery}
                />
                {adding === 'teacher' ? (
                  <ListGroup
                    items={(colleagues.data ?? [])
                      .filter((row) => !(house?.teachers ?? []).some((teacher) => teacher.teacherId === row._id))
                      .slice(0, 30)
                      .map((row) => ({
                        title: row.name,
                        subtitle: row.designation || undefined,
                        onPress: () => setPerson({ teacher: { name: row.name, teacherId: row._id, phone: row.mobileNo || row.phone || '', email: row.email || '' } }),
                      }))}
                  />
                ) : query.trim().length < 2 ? (
                  <StatusView compact kind="empty" icon={Users} title="Type two letters of the name" />
                ) : (
                  <ListGroup
                    items={(students.data ?? []).map((row) => ({
                      title: row.name,
                      subtitle: [classLabel(row.class, row.section), row.rollNumber].filter(Boolean).join(' · '),
                      onPress: () => setPerson({ member: { name: row.name, studentId: row._id, className: row.class, section: row.section } }),
                    }))}
                  />
                )}
              </View>
            )}
          </BottomSheet>
        </>
      }
    >
      {loading ? (
        <CardSkeleton rows={5} />
      ) : failed || !record ? (
        <LoadFailed what={spec.chip} error={records.error ?? council.error} onRetry={() => (records.refetch(), council.refetch())} />
      ) : (
        <>
          <ListGroup
            items={[
              {
                title: name,
                subtitle: spec.subtitle(record as SetupRecord) || undefined,
                lines: 2,
                avatar: house || club ? <Avatar name={name} src={house?.logo || club?.logo || undefined} square /> : undefined,
                icon: house || club ? undefined : Trophy,
                tile: 1 as const,
                chevron: canWrite,
                onPress: canWrite ? () => (setError(null), setEditing(true)) : undefined,
              },
            ]}
            footer={canWrite ? 'Tap to change the details.' : undefined}
          />
          {(house || club) && canWrite ? (
            <ListGroup
              header="Pictures"
              items={[
                { title: 'Logo', icon: ImageIcon, tile: 1 as const, value: busy === 'logo' ? 'Saving…' : house?.logo || club?.logo ? 'Change' : 'Add', onPress: () => setImageMenu('logo') },
                ...(house
                  ? [
                      {
                        title: 'Flag',
                        icon: Flag,
                        tile: 1 as const,
                        avatar: house.flag ? <Avatar name="Flag" src={house.flag} square size={32} /> : undefined,
                        value: busy === 'flag' ? 'Saving…' : house.flag ? 'Change' : 'Add',
                        onPress: () => setImageMenu('flag'),
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}
          {house ? (
            <>
              <Section title="House teachers">
                <ListGroup
                  items={[
                    ...(house.teachers ?? []).map((teacher, index) => ({
                      title: teacher.name,
                      subtitle: [teacher.role, teacher.phone].filter(Boolean).join(' · ') || undefined,
                      onPress: canWrite ? () => setRemoving({ teacher: index }) : undefined,
                    })),
                    ...(canWrite ? [{ title: 'Add a house teacher', icon: UserPlus, tile: 1 as const, onPress: () => (setQuery(''), setAdding('teacher')) }] : []),
                  ]}
                />
              </Section>
              <Section title="House council">
                <ListGroup
                  footer="Students in the house are those whose record names it."
                  items={[
                    ...(house.councilMembers ?? []).map((member, index) => ({
                      title: member.name,
                      subtitle: [member.role, classLabel(member.className, member.section)].filter(Boolean).join(' · ') || undefined,
                      onPress: canWrite ? () => setRemoving({ member: index }) : undefined,
                    })),
                    ...(canWrite ? [{ title: 'Add a council member', icon: UserPlus, tile: 1 as const, onPress: () => (setQuery(''), setAdding('member')) }] : []),
                  ]}
                />
              </Section>
            </>
          ) : null}
          {kind === 'councils' && council.data ? (
            <Section title="Posts">
              {council.data.posts.length ? (
                <ListGroup
                  items={council.data.posts.map((post) => ({
                    title: post.title,
                    subtitle: `${post.acceptedCount} of ${post.seats} chosen${post.pendingCount ? ` · ${post.pendingCount} waiting` : ''}`,
                    badge: POST_STATUS[post.registrationStatus ?? 'closed'] ?? POST_STATUS.closed,
                    lines: 2 as const,
                    chevron: true,
                    onPress: () => router.push({ pathname: '/activities-post', params: { councilId: id, postId: post._id } }),
                  }))}
                />
              ) : (
                <Surface padded={false}>
                  <StatusView compact kind="empty" icon={Trophy} title="No posts yet" body={canWrite ? 'Add the posts students can apply for.' : undefined} />
                </Surface>
              )}
            </Section>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
