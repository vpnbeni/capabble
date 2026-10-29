import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router'
import { ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { grantsOf, type Grant, type PermissionCatalog, type RoleRecord, type Scope } from '@/services/schoolSetupService'
import { usePermissionCatalog, useRemoveRole, useRoleList, useSaveRole } from '@/staff/schoolSetupQueries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionBar, ActionSheet, BottomSheet, Callout, ListGroup, MobileScreen, MobileTextField, NavBar, Switch, haptic, useToast } from '@/ui'

type Draft = { name: string; description: string; grants: Record<string, Scope> }

const toDraft = (role: RoleRecord | undefined, copy: boolean): Draft => ({
  name: role ? (copy ? `${role.name} (copy)` : role.name) : '',
  description: role?.description ?? '',
  grants: Object.fromEntries(
    role
      ? grantsOf(role)
          .filter((grant) => grant.key !== '*')
          .map((grant) => [grant.key, grant.scope])
      : [],
  ),
})

const sameDraft = (a: Draft, b: Draft) =>
  a.name.trim() === b.name.trim() &&
  a.description.trim() === b.description.trim() &&
  Object.keys(a.grants).length === Object.keys(b.grants).length &&
  Object.entries(a.grants).every(([key, scope]) => b.grants[key] === scope)

const label = (catalog: PermissionCatalog, action: string) => catalog.actionLabels[action] ?? action

/**
 * One role (the website's Settings → Roles editor), one module at a time instead of the grid: a
 * module shows its parts with a switch for each thing the role may do there and, where it applies,
 * "own classes only". Built-in roles are read only; copy one to change it. Saving replaces the
 * role whole and signs out the people who hold it, which the confirm says.
 */
export default function RoleScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { key, from } = useLocalSearchParams<{ key?: string; from?: string }>()
  const roles = useRoleList()
  const catalog = usePermissionCatalog()
  const save = useSaveRole()
  const remove = useRemoveRole()
  const role = roles.data?.find((row) => row.key === (key ?? from))
  const isNew = !key
  const readOnly = !staff.can('core.users.manage') || Boolean(role?.isSystem && !isNew)
  const everything = role ? grantsOf(role).some((grant) => grant.key === '*') : false

  const start = roles.data ? toDraft(role, Boolean(from)) : null
  const [edited, setDraft] = useState<Draft | null>(null)
  const draft = edited ?? start
  const [module, setModule] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const dirty = Boolean(draft && start && !readOnly && (isNew ? draft.name.trim() || Object.keys(draft.grants).length : !sameDraft(draft, start)))
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const resources = catalog.data?.resources ?? []
  const modules = (catalog.data?.modules ?? []).filter((row) => resources.some((resource) => resource.module === row.key))
  const countIn = (moduleKey: string) => resources.filter((resource) => resource.module === moduleKey).flatMap((resource) => resource.actions.map((action) => `${resource.key}.${action}`))

  const toggle = (permission: string, on: boolean, scope: Scope) => {
    if (!draft) return
    const grants = { ...draft.grants }
    if (on) grants[permission] = scope
    else delete grants[permission]
    setDraft({ ...draft, grants })
  }

  const setScope = (resourceKey: string, ownOnly: boolean) => {
    if (!draft) return
    const grants = Object.fromEntries(
      Object.entries(draft.grants).map(([permission, scope]) => [permission, permission.startsWith(`${resourceKey}.`) ? (ownOnly ? 'assigned' : 'all') : scope]),
    ) as Record<string, Scope>
    setDraft({ ...draft, grants })
  }

  const doSave = async () => {
    if (!draft) return
    setConfirming(false)
    if (draft.name.trim().length < 2) return setError('Give the role a name of 2 letters or more.')
    if (!Object.keys(draft.grants).length) return setError('Turn on at least one thing the role may do.')
    const permissions: Grant[] = Object.entries(draft.grants).map(([permission, scope]) => ({ key: permission, scope }))
    try {
      await save.mutateAsync({
        id: isNew ? undefined : role?._id,
        input: { name: draft.name.trim(), description: draft.description.trim(), basedOn: isNew ? (from ?? '') : (role?.basedOn ?? ''), permissions },
      })
      haptic.success()
      allowLeaving()
      toast(isNew ? `${draft.name.trim()} added` : `${draft.name.trim()} saved`)
      router.back()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The role wasn't saved. Try again.")
    }
  }

  const doRemove = async () => {
    if (!role?._id) return
    setRemoving(false)
    try {
      await remove.mutateAsync(role._id)
      haptic.medium()
      allowLeaving()
      toast(`${role.name} removed`)
      router.back()
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't removed. Try again.", 'danger')
    }
  }

  const holders = role?.userCount ?? 0
  const shown = modules.find((row) => row.key === module)
  const granted = draft ? Object.keys(draft.grants).length : 0

  return (
    <MobileScreen
      refreshing={roles.isRefetching}
      onRefresh={roles.refetch}
      nav={<NavBar title={isNew ? 'New role' : (role?.name ?? 'Role')} back={{ label: 'Roles', onPress: router.back }} />}
      actionBar={
        readOnly ? (
          role && staff.can('core.users.manage') && !role.locked ? (
            <ActionBar
              icon={ShieldCheck}
              summary="Built in"
              detail="Copy it to change it"
              label="Make a copy"
              onPress={() => router.replace({ pathname: '/school-setup/role', params: { from: role.key } })}
            />
          ) : undefined
        ) : dirty ? (
          <ActionBar
            icon={ShieldCheck}
            summary={draft?.name.trim() || 'New role'}
            detail={`${granted} ${granted === 1 ? 'permission' : 'permissions'}`}
            label={save.isPending ? 'Saving…' : 'Save'}
            onPress={() => (setError(null), !isNew && holders ? setConfirming(true) : doSave())}
          />
        ) : undefined
      }
      overlay={
        <>
          <ActionSheet
            open={confirming}
            onClose={() => setConfirming(false)}
            title={`Save and sign out ${holders} ${holders === 1 ? 'person' : 'people'}?`}
            message="Everyone with this role is signed out, so they sign in again with the new access."
            actions={[{ label: 'Save and sign them out', onSelect: doSave }]}
          />
          <ActionSheet
            open={removing}
            onClose={() => setRemoving(false)}
            title={`Remove ${role?.name ?? 'this role'}?`}
            message="Nobody holds it. This can't be undone."
            actions={[{ label: 'Remove role', tone: 'danger', onSelect: doRemove }]}
          />
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your changes?"
            actions={[{ label: 'Discard', tone: 'danger', onSelect: () => leaving?.() }]}
            cancelLabel="Keep editing"
          />
          <BottomSheet open={Boolean(shown)} onClose={() => setModule(null)} title={shown?.label ?? ''} detent="large">
            {shown && draft && catalog.data ? (
              <View style={{ gap: space['space-5'] }}>
                {resources
                  .filter((resource) => resource.module === shown.key)
                  .map((resource) => {
                    const on = resource.actions.filter((action) => draft.grants[`${resource.key}.${action}`])
                    const ownOnly = on.length > 0 && on.every((action) => draft.grants[`${resource.key}.${action}`] === 'assigned')
                    const scope: Scope = ownOnly ? 'assigned' : 'all'
                    return (
                      <ListGroup
                        key={resource.key}
                        header={resource.label}
                        items={[
                          ...resource.actions.map((action) => {
                            const permission = `${resource.key}.${action}`
                            return {
                              title: label(catalog.data as PermissionCatalog, action),
                              accessory: (
                                <Switch
                                  label={`${resource.label}: ${label(catalog.data as PermissionCatalog, action)}`}
                                  value={Boolean(draft.grants[permission])}
                                  disabled={readOnly}
                                  onChange={(value) => toggle(permission, value, scope)}
                                />
                              ),
                            }
                          }),
                          ...(resource.scopable && on.length
                            ? [
                                {
                                  title: 'Own classes only',
                                  accessory: <Switch label={`${resource.label}: own classes only`} value={ownOnly} disabled={readOnly} onChange={(value) => setScope(resource.key, value)} />,
                                },
                              ]
                            : []),
                        ]}
                      />
                    )
                  })}
              </View>
            ) : null}
          </BottomSheet>
        </>
      }
    >
      {roles.isPending || catalog.isPending ? (
        <CardSkeleton rows={6} />
      ) : roles.isError || catalog.isError || !draft || (!isNew && !role) ? (
        <LoadFailed what="The role" error={roles.error ?? catalog.error} onRetry={() => (roles.refetch(), catalog.refetch())} />
      ) : (
        <>
          {error ? (
            <Callout tone="danger" title="Not saved">
              {error}
            </Callout>
          ) : null}
          {!isNew && holders && !readOnly ? (
            <Callout tone="info" title={`${holders} ${holders === 1 ? 'person has' : 'people have'} this role`}>
              Saving a change signs them out.
            </Callout>
          ) : null}
          <View style={{ gap: space['space-4'] }}>
            <MobileTextField label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} disabled={readOnly} maxLength={60} />
            <MobileTextField
              label="What it’s for (optional)"
              value={draft.description}
              onChangeText={(description) => setDraft({ ...draft, description })}
              disabled={readOnly}
              multiline
              maxLength={240}
            />
          </View>
          {everything ? (
            <Callout tone="info" title="Everything">
              This role may do everything in every module.
            </Callout>
          ) : (
            <ListGroup
              header="What the role may do"
              footer={readOnly ? undefined : 'A role can only include access you have yourself.'}
              items={modules.map((row) => {
                const keys = countIn(row.key)
                const count = keys.filter((permission) => draft.grants[permission]).length
                return { title: row.label, value: count ? `${count} of ${keys.length}` : 'None', chevron: true, onPress: () => setModule(row.key) }
              })}
            />
          )}
          {!isNew && !readOnly && role && !holders ? <ListGroup items={[{ title: 'Remove this role', tone: 'danger', onPress: () => setRemoving(true) }]} /> : null}
        </>
      )}
    </MobileScreen>
  )
}
