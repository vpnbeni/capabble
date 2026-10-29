import React, { useEffect, useMemo, useState } from 'react'
import { classLabel } from '@/utils/classLabel'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Eye, KeyRound, LogOut, Pencil, Plus, Power, UserX, X } from 'lucide-react'
import {
  Button,
  Card,
  Checkbox,
  Combobox,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Select,
  Sheet,
  TextField,
  formatDate,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import {
  useAuditLog,
  useManagedUser,
  useResetPassword,
  useRoles,
  useSectionOptions,
  useSignOutEverywhere,
  useStartViewAs,
  useStudentCandidates,
  useUpdateUser,
} from '@/hooks/useUserAdmin'
import { usePermissions } from '@/hooks/usePermissions'
import { useSchoolProfile } from '@/hooks/useSchoolProfile'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import type { AuditEvent, ClassSection, CredentialDelivery, CredentialMethod } from '@/services/userAdminService'
import { CredentialDialog, errorMessage, KIND_LABEL, lastSignIn, LoginStatusBadge } from '@/components/access/AccessUi'
import { CredentialFields } from '@/components/access/CreateLoginSheet'
import { reloadAsCurrentLogin } from '@/components/access/ViewAsBanner'

const EVENT_LABEL: Record<string, string> = {
  login_success: 'Signed in',
  login_failed: 'Wrong password',
  login_locked: 'Locked after failed attempts',
  logout: 'Signed out',
  refresh_reuse_detected: 'Session ended: a stolen sign-in was suspected',
  password_changed: 'Changed own password',
  password_reset: 'Reset password by email code',
  password_reset_by_admin: 'Password reset by the school',
  invite_sent: 'Invite sent',
  invite_accepted: 'Accepted invite',
  user_created: 'Login created',
  user_updated: 'Details changed',
  user_deactivated: 'Deactivated',
  user_reactivated: 'Reactivated',
  roles_changed: 'Roles changed',
  sessions_revoked: 'Signed out everywhere',
  view_as_started: 'An administrator started viewing as them',
  view_as_ended: 'An administrator stopped viewing as them',
  switch_started: 'The school owner switched to them',
  switch_ended: 'The school owner switched back',
  switched_user_action: 'Change made by the school owner while switched',
}

const ALL_SECTIONS = '*'

/** Matches the server's own-class key: "Class 7th", "7" and "VII" are the same class. */
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' }
const sectionKey = (className: string, section: string) => {
  const text = className.trim().toLowerCase().replace(/^class\s*/, '').replace(/(\d+)\s*(st|nd|rd|th)$/, '$1').trim()
  return `${ROMAN[text] || text}|${section.trim().toUpperCase()}`
}

const UserDetail: React.FC = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const me = useSelector(selectUser)
  const { can } = usePermissions()
  const canManage = can('core.users.manage')
  const { data: user, isLoading, isError } = useManagedUser(id)
  const { data: roles = [] } = useRoles()
  const { data: audit } = useAuditLog(id)
  const { data: school } = useSchoolProfile()
  const updateUser = useUpdateUser()
  const resetPassword = useResetPassword()
  const signOut = useSignOutEverywhere()
  const startViewAs = useStartViewAs()

  const isSelf = me?._id === id
  const [roleKeys, setRoleKeys] = useState<string[]>([])
  const [sections, setSections] = useState<ClassSection[]>([])
  const [newClass, setNewClass] = useState('')
  const [newSection, setNewSection] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetMethod, setResetMethod] = useState<CredentialMethod>('invite')
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [delivery, setDelivery] = useState<CredentialDelivery | null>(null)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [viewAsOpen, setViewAsOpen] = useState(false)
  const [studentPick, setStudentPick] = useState('')
  const { data: studentOptions = [] } = useStudentCandidates({}, Boolean(user && user.kind === 'parent'))
  const sectionOptions = useSectionOptions(Boolean(canManage && user && user.kind === 'staff'))

  useEffect(() => {
    if (!user) return
    setRoleKeys(user.roles.map((role) => role.key))
    setSections(user.assignedSections)
  }, [user])

  const rolesDirty = useMemo(() => {
    const current = (user?.roles || []).map((role) => role.key).sort().join(',')
    return current !== [...roleKeys].sort().join(',')
  }, [roleKeys, user])
  const sectionsDirty = JSON.stringify(sections) !== JSON.stringify(user?.assignedSections || [])

  if (isLoading) {
    return <Page><Card><EmptyState title="Loading login" compact /></Card></Page>
  }
  if (isError || !user) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={UserX}
            title="Login not found"
            body="It may have been removed. Go back to the list."
            action={<Button variant="secondary" onClick={() => navigate('/settings/users')}>Back to users</Button>}
          />
        </Card>
      </Page>
    )
  }

  const save = async (payload: Parameters<typeof updateUser.mutateAsync>[0]['payload'], success: string) => {
    try {
      await updateUser.mutateAsync({ id, payload })
      toast.success(success)
      return true
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the change.'))
      return false
    }
  }

  const openEdit = () => {
    setEditName(user.name)
    setEditEmail(user.email || '')
    setEditUsername(user.username || '')
    setEditOpen(true)
  }

  const submitReset = async () => {
    try {
      const result = await resetPassword.mutateAsync({ id, method: resetMethod, password: resetPasswordValue || undefined })
      setResetOpen(false)
      setDelivery(result)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not reset the password.'))
    }
  }

  // Administrators only, never as another administrator or a turned-off login (the server checks the same).
  const canViewAs = Boolean(me?.isAdmin) && !isSelf && user.isActive && !user.roles.some((role) => role.key === 'administrator')
  const displayName = user.name || user.loginId
  const viewAsItems: MenuItem[] = canViewAs
    ? [{ label: `View as ${displayName}`, icon: Eye, hint: 'See what they see, read-only', onSelect: () => setViewAsOpen(true) }]
    : []
  const beginViewAs = async () => {
    try {
      await startViewAs.mutateAsync(id)
      await reloadAsCurrentLogin(user.kind === 'staff' ? '/' : '/portal')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const menuItems: MenuItem[] = canManage ? [
    { label: 'Edit details', icon: Pencil, onSelect: openEdit },
    ...viewAsItems,
    ...(!isSelf ? [{
      label: 'Sign out everywhere',
      icon: LogOut,
      hint: 'Ends every open session',
      onSelect: async () => {
        try {
          await signOut.mutateAsync(id)
          toast.success('Signed out on every device')
        } catch (error) {
          toast.error(errorMessage(error))
        }
      },
    }] : []),
    ...(!isSelf ? [
      { divider: true } as const,
      user.isActive
        ? { label: 'Deactivate login', icon: Power, tone: 'danger' as const, onSelect: () => setDeactivateOpen(true) }
        : { label: 'Reactivate login', icon: Power, onSelect: () => save({ isActive: true }, 'Login reactivated') },
    ] : []),
  ] : []

  const auditColumns: DataTableColumn<AuditEvent>[] = [
    { key: 'event', header: 'What happened', mobile: 'title', render: (event) => EVENT_LABEL[event.event] || event.event },
    { key: 'by', header: 'By', mobile: 'subtitle', render: (event) => event.actor?.label || 'System' },
    { key: 'when', header: 'When', mobile: 'aside', render: (event) => `${formatDate(event.createdAt)} ${new Date(event.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` },
  ]

  const classChoices = sectionOptions.data || []
  const pickedClass = classChoices.find((option) => option.className === newClass)
  const assignedKeys = new Set(sections.map((entry) => sectionKey(entry.className, entry.section)))
  const openSections = (pickedClass?.sections || []).filter((section) => !assignedKeys.has(sectionKey(newClass, section)))

  const addSection = () => {
    if (!pickedClass || !newSection) return
    const picked = newSection === ALL_SECTIONS ? openSections : openSections.filter((section) => section === newSection)
    if (!picked.length) return
    setSections((prev) => [...prev, ...picked.map((section) => ({ className: pickedClass.className, section }))])
    setNewClass('')
    setNewSection('')
  }

  const linkedIds = user.linkedStudents.map((child) => child.studentId)

  return (
    <Page>
      <div className="cb-stack">
        <Card
          title={user.name || user.loginId}
          subtitle={`${KIND_LABEL[user.kind]} login · ${user.loginId}`}
          action={
            <div className="cb-card-actions">
              <LoginStatusBadge user={user} />
              {canManage && !isSelf ? (
                <Button variant="primary" size="sm" icon={KeyRound} onClick={() => setResetOpen(true)}>Reset password</Button>
              ) : null}
              {menuItems.length ? <Menu items={menuItems} label="Login actions" /> : null}
            </div>
          }
        >
          <DetailList
            columns={3}
            items={[
              { label: 'Email', value: user.email || '—' },
              { label: 'Login ID', value: user.username ? user.loginId : '—' },
              { label: 'Last sign-in', value: lastSignIn(user.lastLogin) },
              { label: 'Created', value: formatDate(user.createdAt) },
              ...(user.teacher ? [{ label: 'Staff record', value: `${user.teacher.name}${user.teacher.designation ? ` · ${user.teacher.designation}` : ''}` }] : []),
              ...(user.lockedUntil ? [{ label: 'Locked until', value: new Date(user.lockedUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) }] : []),
            ]}
          />
        </Card>

        {user.kind === 'staff' ? (
          <div className="cb-grid-6-6">
            <Card
              title="Roles"
              subtitle="Everything they can open comes from these."
              action={canManage && rolesDirty ? (
                <Button size="sm" loading={updateUser.isPending} onClick={() => save({ roles: roleKeys }, 'Roles saved')}>Save roles</Button>
              ) : undefined}
            >
              <div className="ua-roles">
                {roles.map((role) => (
                  <Checkbox
                    key={role.key}
                    label={role.name}
                    description={role.description}
                    checked={roleKeys.includes(role.key)}
                    disabled={!canManage || (isSelf && role.key === 'administrator')}
                    onChange={(checked) => setRoleKeys((prev) => (checked ? [...prev, role.key] : prev.filter((key) => key !== role.key)))}
                  />
                ))}
              </div>
            </Card>
            <Card
              title="Own classes"
              subtitle="Roles marked “own classes only” use these, plus the classes the timetable gives them."
              action={canManage && sectionsDirty ? (
                <Button size="sm" loading={updateUser.isPending} onClick={() => save({ assignedSections: sections }, 'Classes saved')}>Save classes</Button>
              ) : undefined}
            >
              <div className="cb-stack">
                {sections.length ? (
                  <ul className="ua-chips" aria-label="Assigned classes">
                    {sections.map((entry) => (
                      <li key={`${entry.className}-${entry.section}`} className="ua-chip">
                        {classLabel(entry.className, entry.section)}
                        {canManage ? (
                          <button
                            type="button"
                            className="ua-chip__remove"
                            aria-label={`Remove class ${entry.className}-${entry.section}`}
                            onClick={() => setSections((prev) => prev.filter((item) => item !== entry))}
                          >
                            <X size={14} strokeWidth={1.75} aria-hidden="true" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cb-muted">No classes added by hand. The timetable decides.</p>
                )}
                {canManage ? (
                  sectionOptions.isSuccess && classChoices.length === 0 ? (
                    <p className="cb-muted">No classes set up yet. Add them in the timetable’s class matrix or enrol students first.</p>
                  ) : (
                    <div className="ua-inline">
                      <Select
                        label="Class"
                        size="sm"
                        placeholder={sectionOptions.isLoading ? 'Loading classes…' : 'Choose class'}
                        disabled={sectionOptions.isLoading}
                        options={classChoices.map((option) => ({ value: option.className, label: classLabel(option.className) }))}
                        value={newClass}
                        onChange={(event) => {
                          setNewClass(event.target.value)
                          setNewSection('')
                        }}
                      />
                      <Select
                        label="Section"
                        size="sm"
                        placeholder={pickedClass && !openSections.length ? 'All added' : 'Choose section'}
                        disabled={!openSections.length}
                        options={[
                          ...(openSections.length > 1 ? [{ value: ALL_SECTIONS, label: 'All sections' }] : []),
                          ...openSections.map((section) => ({ value: section, label: section })),
                        ]}
                        value={newSection}
                        onChange={(event) => setNewSection(event.target.value)}
                      />
                      <Button size="sm" variant="secondary" icon={Plus} disabled={!newSection} onClick={addSection}>Add</Button>
                    </div>
                  )
                ) : null}
              </div>
            </Card>
          </div>
        ) : (
          <Card title={user.kind === 'parent' ? 'Children' : 'Student'} subtitle="They only ever see these students’ records.">
            <div className="cb-stack">
              <ul className="ua-chips" aria-label="Linked students">
                {user.linkedStudents.map((child) => (
                  <li key={child.studentId} className="ua-chip">
                    {child.name || child.rollNumber}
                    {child.className ? ` · ${classLabel(child.className, child.section)}` : ''}
                    {canManage && user.kind === 'parent' && user.linkedStudents.length > 1 ? (
                      <button
                        type="button"
                        className="ua-chip__remove"
                        aria-label={`Remove ${child.name}`}
                        onClick={() => save({
                          students: user.linkedStudents
                            .filter((item) => item.studentId !== child.studentId)
                            .map((item) => ({ studentId: item.studentId, relation: item.relation })),
                        }, 'Child removed')}
                      >
                        <X size={14} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage && user.kind === 'parent' ? (
                <Combobox
                  label="Add a child"
                  options={studentOptions
                    .filter((student) => !linkedIds.includes(student._id))
                    .map((student) => ({
                      value: student._id,
                      label: student.name,
                      meta: `${classLabel(student.className, student.section)} · Adm ${student.rollNumber}`,
                      keywords: student.rollNumber,
                    }))}
                  value={studentPick}
                  onChange={(studentId) => {
                    setStudentPick('')
                    if (!studentId) return
                    save({
                      students: [
                        ...user.linkedStudents.map((item) => ({ studentId: item.studentId, relation: item.relation })),
                        { studentId, relation: user.linkedStudents[0]?.relation || '' },
                      ],
                    }, 'Child added')
                  }}
                  placeholder="Search by name or admission no."
                />
              ) : null}
            </div>
          </Card>
        )}

        <Card title="Activity" subtitle="Sign-ins and changes to this login over the last year." flush>
          <DataTable
            columns={auditColumns}
            rows={audit?.events || []}
            getRowKey={(event) => event._id}
            empty={<EmptyState title="No activity yet" body="Sign-ins and changes will show here." compact />}
          />
        </Card>
      </div>

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit login details"
        icon={Pencil}
        onSubmit={async (event) => {
          event.preventDefault()
          const ok = await save({
            name: editName.trim(),
            email: editEmail.trim() || null,
            ...(user.kind === 'student' ? { username: editUsername.trim() || null } : {}),
          }, 'Details saved')
          if (ok) setEditOpen(false)
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={updateUser.isPending}>Save details</Button>
          </>
        }
      >
        <div className="cb-form-section">
          <TextField label="Name" value={editName} onChange={(event) => setEditName(event.target.value)} />
          <TextField
            label={user.kind === 'student' ? 'Email (optional)' : 'Email'}
            type="email"
            value={editEmail}
            onChange={(event) => setEditEmail(event.target.value)}
          />
          {user.kind === 'student' ? (
            <TextField label="Login ID" value={editUsername} onChange={(event) => setEditUsername(event.target.value.toLowerCase())} />
          ) : null}
        </div>
      </Sheet>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={`Reset password for ${user.name || user.loginId}`}
        description="They are signed out on every device straight away."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={resetPassword.isPending} onClick={submitReset}>Reset password</Button>
          </>
        }
      >
        <CredentialFields
          method={resetMethod}
          onMethodChange={setResetMethod}
          password={resetPasswordValue}
          onPasswordChange={setResetPasswordValue}
          inviteDisabled={!user.email}
        />
      </Dialog>

      <Dialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        tone="danger"
        title={`Deactivate ${user.name || user.loginId}?`}
        description="They are signed out everywhere and can't sign in until you reactivate the login. Their records stay."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivateOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={updateUser.isPending}
              onClick={async () => {
                if (await save({ isActive: false }, 'Login deactivated')) setDeactivateOpen(false)
              }}
            >
              Deactivate login
            </Button>
          </>
        }
      />

      <Dialog
        open={viewAsOpen}
        onClose={() => setViewAsOpen(false)}
        title={`View as ${displayName}?`}
        description={`You'll see Capabble exactly as ${displayName} does: their menus, ${user.kind === 'staff' ? 'classes and permissions' : 'children and family portal'}. You can't change anything while viewing. It ends after 30 minutes or when you stop, and it's recorded in their activity.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setViewAsOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Eye} loading={startViewAs.isPending} onClick={beginViewAs}>
              {`View as ${displayName}`}
            </Button>
          </>
        }
      />

      <CredentialDialog
        open={Boolean(delivery)}
        onClose={() => setDelivery(null)}
        name={user.name}
        loginId={user.loginId}
        delivery={delivery}
        schoolName={String(school?.name || '')}
      />
    </Page>
  )
}

export default UserDetail
