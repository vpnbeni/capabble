import { useRouter } from 'expo-router'
import { UserPlus, Users } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useAllHosts, useCreateHost, useHostCandidates, useUpdateHost } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, Avatar, BottomSheet, ListGroup, MobileScreen, NavBar, SearchBar, StatusView, Surface, Switch, haptic, useToast } from '@/ui'

/**
 * Who takes meetings: turn a host on or off, open their hours and days off, and add a staff
 * member as a host. Principal and office (appointment settings).
 */
export default function MeetingHostsScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canSet = staff.can('appnt.appointments.settings')
  const hosts = useAllHosts(canSet)
  const update = useUpdateHost()
  const create = useCreateHost()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const candidates = useHostCandidates(adding)

  const fail = (error: unknown) => {
    haptic.error()
    toast(error instanceof ApiError ? error.message : "That didn't save. Try again.", 'danger')
  }

  const toggle = async (id: string, isActive: boolean, name: string) => {
    try {
      await update.mutateAsync({ id, changes: { isActive } })
      haptic.selection()
      toast(isActive ? `${name} takes meetings again` : `${name} no longer takes meetings`)
    } catch (error) {
      fail(error)
    }
  }

  const add = async (teacherId: string, name: string) => {
    try {
      await create.mutateAsync(teacherId)
      haptic.success()
      setAdding(false)
      setQuery('')
      toast(`${name} now takes meetings. Set their hours next.`)
    } catch (error) {
      fail(error)
    }
  }

  const takeCount = (hosts.data ?? []).filter((row) => row.isActive).length
  const people = (candidates.data ?? []).filter((row) => !row.isHost).filter((row) => !query.trim() || row.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <MobileScreen
      refreshing={hosts.isRefetching}
      onRefresh={hosts.refetch}
      nav={<NavBar title="Hosts" back={{ label: 'Meetings', onPress: router.back }} />}
      actionBar={canSet ? <ActionBar icon={UserPlus} summary={takeCount === 1 ? '1 person takes meetings' : `${takeCount} people take meetings`} label="Add a host" onPress={() => setAdding(true)} /> : undefined}
      overlay={
        <BottomSheet open={adding} onClose={() => setAdding(false)} detent="large" title="Add a host" description="They take meetings in the hours they set.">
          <SearchBar label="Find a staff member" placeholder="Search staff" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
          {candidates.isPending ? (
            <CardSkeleton rows={4} />
          ) : candidates.isError ? (
            <LoadFailed what="Staff" error={candidates.error} onRetry={candidates.refetch} />
          ) : people.length ? (
            <ListGroup
              items={people.slice(0, 40).map((row) => ({
                title: row.name,
                subtitle: row.designation,
                avatar: <Avatar name={row.name} size={36} />,
                onPress: () => add(row._id, row.name),
              }))}
            />
          ) : (
            <StatusView compact kind="empty" icon={Users} title="Nobody to add" body="Everyone found already takes meetings, or check the spelling." />
          )}
        </BottomSheet>
      }
    >
      {!canSet ? (
        <Surface padded={false}>
          <StatusView compact kind="permission" title="Only the principal or office sets hosts" body="Ask them to add someone or change their hours." />
        </Surface>
      ) : hosts.isPending ? (
        <CardSkeleton rows={4} />
      ) : hosts.isError ? (
        <LoadFailed what="Hosts" error={hosts.error} onRetry={hosts.refetch} />
      ) : hosts.data?.length ? (
        <ListGroup
          footer="Tap someone for their hours and days off."
          items={hosts.data.map((host) => ({
            title: host.displayName,
            subtitle: [host.title, host.location, host.absentToday ? 'Absent today' : null, host.isActive ? null : 'Not taking meetings'].filter(Boolean).join(' · ') || undefined,
            lines: 2,
            avatar: <Avatar name={host.displayName} size={36} />,
            onPress: () => router.push({ pathname: '/meetings/hours', params: { hostId: host._id } }),
            accessory: <Switch label={`${host.displayName} takes meetings`} value={host.isActive} onChange={(on) => toggle(host._id, on, host.displayName)} />,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title="Nobody takes meetings yet" body="Add the principal, teachers or office staff who meet families." />
        </Surface>
      )}
    </MobileScreen>
  )
}
