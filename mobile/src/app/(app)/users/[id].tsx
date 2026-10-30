import { useLocalSearchParams, useRouter } from 'expo-router'
import { Eye, KeyRound, LogOut, ShieldCheck, UserX } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Delivery } from '@/services/usersService'
import { useSession } from '@/session/SessionProvider'
import { CredentialResult } from '@/staff/CredentialResult'
import { loginBadge } from '@/staff/loginUi'
import { useLogin, useResetPassword, useRoles, useSignOutEverywhere, useUpdateLogin } from '@/staff/userQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionSheet, Avatar, Badge, BottomSheet, DetailList, Dialog, ListGroup, MobileButton, MobileScreen, NavBar, OptionList, Surface, Text, haptic, useToast } from '@/ui'

/** One login: who it is, its roles, and the fixes an administrator makes from the phone. */
export default function LoginScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const login = useLogin(id)
  const data = login.data
  const roles = useRoles(data?.kind === 'staff')
  const update = useUpdateLogin()
  const reset = useResetPassword()
  const signOut = useSignOutEverywhere()
  const [editingRoles, setEditingRoles] = useState<string[] | null>(null)
  const [resetting, setResetting] = useState(false)
  const [turningOff, setTurningOff] = useState(false)
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [confirmViewAs, setConfirmViewAs] = useState(false)
  const [startingViewAs, setStartingViewAs] = useState(false)
  const { startViewAs } = useSession()
  const self = data?._id === staff.user?._id
  const badge = data ? loginBadge(data) : undefined
  // Administrators only, never as another administrator or a turned-off login (the server checks the same).
  const canViewAs = Boolean(staff.user?.isAdmin) && !self && Boolean(data?.isActive) && !data?.roles.some((role) => role.key === 'administrator')
  const shortName = data ? (data.name || data.loginId).split(' ').filter((part) => !/^(mr|mrs|ms|dr)\.?$/i.test(part))[0] || data.name : ''

  const fail = (error: unknown) => {
    haptic.error()
    toast(error instanceof ApiError ? error.message : "That didn't save. Try again.", 'danger')
  }

  const saveRoles = async () => {
    if (!data || !editingRoles) return
    if (!editingRoles.length) {
      haptic.error()
      toast('Keep at least one role', 'danger')
      return
    }
    try {
      await update.mutateAsync({ id: data._id, changes: { roles: editingRoles } })
      haptic.success()
      setEditingRoles(null)
      toast('Roles changed. They see the change the next time the app refreshes.')
    } catch (error) {
      fail(error)
    }
  }

  const doReset = async (method: 'invite' | 'temporary') => {
    if (!data) return
    setResetting(false)
    try {
      const result = await reset.mutateAsync({ id: data._id, method })
      haptic.success()
      setDelivery(result)
    } catch (error) {
      fail(error)
    }
  }

  const setActive = async (isActive: boolean) => {
    if (!data) return
    setTurningOff(false)
    try {
      await update.mutateAsync({ id: data._id, changes: { isActive } })
      haptic.medium()
      toast(isActive ? 'Login turned on' : 'Login turned off. They are signed out.')
    } catch (error) {
      fail(error)
    }
  }

  const viewAs = async () => {
    if (!data) return
    setConfirmViewAs(false)
    setStartingViewAs(true)
    try {
      await startViewAs(data._id)
      haptic.medium()
      if (router.canDismiss()) router.dismissAll()
      router.replace('/')
    } catch (error) {
      fail(error)
    } finally {
      setStartingViewAs(false)
    }
  }

  if (delivery && data) {
    return (
      <MobileScreen nav={<NavBar title="Password reset" back={{ label: 'Login', onPress: () => setDelivery(null) }} />}>
        <CredentialResult delivery={delivery} name={data.name.split(' ')[0]} loginId={data.loginId} onDone={() => setDelivery(null)} />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      refreshing={login.isRefetching}
      onRefresh={login.refetch}
      nav={<NavBar title="Login" back={{ label: 'Users', onPress: router.back }} />}
      overlay={
        <>
          <ActionSheet
            open={confirmViewAs}
            onClose={() => setConfirmViewAs(false)}
            title={`View as ${data?.name || 'this person'}?`}
            message="You see the app as they do. Nothing can be changed while viewing. It ends after 30 minutes or when you stop, and it's recorded in their activity."
            actions={[{ label: `View as ${shortName}`, icon: Eye, onSelect: viewAs }]}
          />
          <ActionSheet
            open={resetting}
            onClose={() => setResetting(false)}
            title="Reset the password?"
            message="They are signed out on every phone and computer."
            actions={[
              ...(data?.email ? [{ label: `Email a link to ${data.email}`, onSelect: () => doReset('invite') }] : []),
              { label: 'Make a temporary password', onSelect: () => doReset('temporary') },
            ]}
          />
          <BottomSheet
            open={Boolean(editingRoles)}
            onClose={() => setEditingRoles(null)}
            detent="large"
            title="Roles"
            description="What they can see and do. Role permissions are set on the website."
            footer={
              <MobileButton fullWidth loading={update.isPending} onPress={saveRoles}>
                Save roles
              </MobileButton>
            }
          >
            <OptionList
              multiple
              label="Roles"
              value={editingRoles ?? []}
              onChange={setEditingRoles}
              options={(roles.data ?? []).map((role) => ({ value: role.key, label: role.name, meta: role.description }))}
            />
          </BottomSheet>
          <Dialog
            open={turningOff}
            onClose={() => setTurningOff(false)}
            tone="danger"
            title={`Turn off ${data?.name || 'this login'}?`}
            description="They are signed out and can't sign in until it is turned on again. Nothing they made is deleted."
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setTurningOff(false)}>
                  Keep it on
                </MobileButton>
                <MobileButton variant="destructive" loading={update.isPending} onPress={() => setActive(false)}>
                  Turn off
                </MobileButton>
              </>
            }
          />
        </>
      }
    >
      {login.isPending ? (
        <CardSkeleton rows={4} />
      ) : login.isError || !data ? (
        <LoadFailed what="The login" error={login.error} onRetry={login.refetch} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Avatar name={data.name || data.loginId} size={72} />
            <Text variant="m-section" accessibilityRole="header" style={{ textAlign: 'center' }}>
              {data.name || data.loginId}
            </Text>
            <Text variant="m-subhead" tone="muted" style={{ textAlign: 'center' }}>
              {data.loginId}
            </Text>
            {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
          </View>
          <Surface>
            <DetailList
              items={[
                { label: 'Kind', value: data.kind === 'staff' ? 'Staff' : data.kind === 'parent' ? 'Parent' : 'Student' },
                ...(data.kind === 'staff' ? [{ label: 'Roles', value: data.roles.map((role) => role.name).join(', ') || null, wide: true }] : []),
                ...(data.teacher ? [{ label: 'Staff record', value: `${data.teacher.name}${data.teacher.designation ? ` · ${data.teacher.designation}` : ''}`, wide: true }] : []),
                ...(data.linkedStudents.length
                  ? [{ label: data.kind === 'parent' ? 'Children' : 'Student', value: data.linkedStudents.map((link) => `${link.name}, ${classLabel(link.className, link.section)}`).join('\n'), wide: true }]
                  : []),
                { label: 'Last signed in', value: data.lastLogin ? formatDate(data.lastLogin) : 'Never' },
              ]}
            />
          </Surface>
          <ListGroup
            items={[
              ...(data.kind === 'staff' && !self ? [{ title: 'Change roles', icon: ShieldCheck, tile: 4 as const, onPress: () => setEditingRoles(data.roles.map((role) => role.key)) }] : []),
              ...(canViewAs ? [{ title: startingViewAs ? 'Opening…' : `View as ${shortName}`, subtitle: 'See what they see, read-only', icon: Eye, tile: 4 as const, onPress: () => setConfirmViewAs(true) }] : []),
              { title: 'Reset password', icon: KeyRound, tile: 4 as const, onPress: () => setResetting(true) },
              { title: 'Sign out everywhere', icon: LogOut, tile: 4 as const, onPress: async () => {
                try {
                  await signOut.mutateAsync(data._id)
                  haptic.success()
                  toast('Signed out on every phone and computer')
                } catch (error) {
                  fail(error)
                }
              } },
            ]}
          />
          {self ? null : (
            <ListGroup
              items={[
                data.isActive
                  ? { title: 'Turn off login', icon: UserX, tile: 4 as const, tone: 'danger' as const, onPress: () => setTurningOff(true) }
                  : { title: 'Turn login on', icon: UserX, tile: 4 as const, onPress: () => setActive(true) },
              ]}
            />
          )}
        </>
      )}
    </MobileScreen>
  )
}
