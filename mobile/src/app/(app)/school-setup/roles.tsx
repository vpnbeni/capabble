import { useRouter } from 'expo-router'
import { ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useRoleList } from '@/staff/schoolSetupQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, BottomSheet, ListGroup, MobileScreen, NavBar, OptionList } from '@/ui'

const people = (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`

/**
 * Settings → Roles: the built-in roles (read only; copy one to change it) and the school's own,
 * each with how many logins hold it. A new role starts empty or from a built-in one.
 */
export default function RolesScreen() {
  const router = useRouter()
  const staff = useStaff()
  const canManage = staff.can('core.users.manage')
  const roles = useRoleList()
  const [starting, setStarting] = useState(false)

  const list = roles.data ?? []
  const own = list.filter((role) => !role.isSystem)
  const builtIn = list.filter((role) => role.isSystem)

  const open = (key: string) => router.push({ pathname: '/school-setup/role', params: { key } })

  return (
    <MobileScreen
      refreshing={roles.isRefetching}
      onRefresh={roles.refetch}
      nav={<NavBar title="Roles" back={{ label: 'Setup', onPress: router.back }} />}
      actionBar={
        canManage ? <ActionBar icon={ShieldCheck} summary={`${own.length} of the school’s own`} detail={`${builtIn.length} built in`} label="New role" onPress={() => setStarting(true)} /> : undefined
      }
      overlay={
        <BottomSheet open={starting} onClose={() => setStarting(false)} title="Start the new role from" detent="large">
          <OptionList
            label="Start from"
            value=""
            onChange={(value) => {
              setStarting(false)
              router.push({ pathname: '/school-setup/role', params: value ? { from: value } : {} })
            }}
            options={[
              { value: '', label: 'Nothing', meta: 'Choose every permission yourself' },
              ...builtIn.filter((role) => !role.locked).map((role) => ({ value: role.key, label: role.name, meta: role.description })),
            ]}
          />
        </BottomSheet>
      }
    >
      {roles.isPending ? (
        <CardSkeleton rows={6} />
      ) : roles.isError ? (
        <LoadFailed what="Roles" error={roles.error} onRetry={roles.refetch} />
      ) : (
        <>
          {own.length ? (
            <ListGroup
              header="The school’s own"
              footer="Changing a role signs out the people who hold it, so they sign in with the new access."
              items={own.map((role) => ({
                title: role.name,
                subtitle: [people(role.userCount), role.description].filter(Boolean).join(' · '),
                lines: 2 as const,
                chevron: true,
                onPress: () => open(role.key),
              }))}
            />
          ) : null}
          <ListGroup
            header="Built in"
            items={builtIn.map((role) => ({
              title: role.name,
              subtitle: [people(role.userCount), role.description].filter(Boolean).join(' · '),
              lines: 2 as const,
              chevron: true,
              onPress: () => open(role.key),
            }))}
          />
        </>
      )}
    </MobileScreen>
  )
}
