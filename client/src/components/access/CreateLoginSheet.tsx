import React, { useEffect, useMemo, useState } from 'react'
import { classLabel } from '@/utils/classLabel'
import toast from 'react-hot-toast'
import { UserPlus, X } from 'lucide-react'
import {
  Button,
  Checkbox,
  Combobox,
  RadioGroup,
  Select,
  Sheet,
  TextField,
} from '@/components/ui'
import { useCreateUser, useRoles, useStaffCandidates, useStudentCandidates } from '@/hooks/useUserAdmin'
import type { CredentialDelivery, CredentialMethod, ManagedUser } from '@/services/userAdminService'
import type { UserKind } from '@/types/auth'
import { errorMessage, KIND_LABEL } from './AccessUi'

const RELATIONS = ['Father', 'Mother', 'Guardian']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const CredentialFields: React.FC<{
  method: CredentialMethod
  onMethodChange: (method: CredentialMethod) => void
  password: string
  onPasswordChange: (value: string) => void
  inviteDisabled?: boolean
}> = ({ method, onMethodChange, password, onPasswordChange, inviteDisabled }) => (
  <div className="cb-form-section">
    <div className="cb-form-section__title">How they get their password</div>
    <RadioGroup
      value={method}
      onChange={(value) => onMethodChange(value as CredentialMethod)}
      variant="cards"
      options={[
        {
          value: 'invite',
          label: 'Email an invite link',
          description: inviteDisabled ? 'Needs an email address.' : 'They choose their own password. The link expires in 3 days.',
          disabled: inviteDisabled,
        },
        {
          value: 'temporary',
          label: 'Give a temporary password',
          description: 'You hand it over or print a slip. They must change it when they first sign in.',
        },
      ]}
    />
    {method === 'temporary' ? (
      <TextField
        label="Temporary password"
        hint="Leave empty and we'll make one up."
        value={password}
        autoComplete="new-password"
        onChange={(event) => onPasswordChange(event.target.value)}
      />
    ) : null}
  </div>
)

interface Created {
  user: ManagedUser
  delivery: CredentialDelivery
}

/** Create one login: a staff member (with roles), a parent, or a student. */
const CreateLoginSheet: React.FC<{
  open: boolean
  kind: UserKind
  onClose: () => void
  onCreated: (created: Created) => void
}> = ({ open, kind, onClose, onCreated }) => {
  const createUser = useCreateUser()
  const { data: roles = [] } = useRoles()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [roleKeys, setRoleKeys] = useState<string[]>([])
  const [students, setStudents] = useState<Array<{ studentId: string; label: string; relation: string }>>([])
  const [studentPick, setStudentPick] = useState('')
  const [method, setMethod] = useState<CredentialMethod>('invite')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: staffOptions = [] } = useStaffCandidates('', open && kind === 'staff')
  const { data: studentOptions = [] } = useStudentCandidates({}, open && kind !== 'staff')

  useEffect(() => {
    if (!open) return
    setName('')
    setEmail('')
    setUsername('')
    setTeacherId('')
    setRoleKeys([])
    setStudents([])
    setStudentPick('')
    setMethod(kind === 'student' ? 'temporary' : 'invite')
    setPassword('')
    setErrors({})
  }, [open, kind])

  const staffComboOptions = useMemo(() => staffOptions.map((staff) => ({
    value: staff._id,
    label: staff.name,
    meta: [staff.designation, staff.hasLogin ? 'Has a login' : ''].filter(Boolean).join(' · '),
    keywords: `${staff.employeeId} ${staff.email}`,
  })), [staffOptions])

  const studentComboOptions = useMemo(() => studentOptions.map((student) => ({
    value: student._id,
    label: student.name,
    meta: `${classLabel(student.className, student.section)} · Adm ${student.rollNumber}`,
    keywords: `${student.rollNumber} ${student.guardianEmail}`,
  })), [studentOptions])

  const pickStaff = (id: string) => {
    setTeacherId(id)
    const staff = staffOptions.find((entry) => entry._id === id)
    if (!staff) return
    setName(staff.name)
    if (staff.email) setEmail(staff.email)
    if (staff.suggestedRole && roleKeys.length === 0) setRoleKeys([staff.suggestedRole])
  }

  const pickStudent = (id: string) => {
    setStudentPick('')
    const student = studentOptions.find((entry) => entry._id === id)
    if (!student) return
    const label = `${student.name} · ${classLabel(student.className, student.section)}`
    if (kind === 'student') {
      setStudents([{ studentId: id, label, relation: '' }])
      setName(student.name)
      setUsername(student.rollNumber.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
      return
    }
    if (students.some((entry) => entry.studentId === id)) return
    setStudents((prev) => [...prev, { studentId: id, label, relation: prev[0]?.relation || 'Father' }])
    if (!email && student.guardianEmail) setEmail(student.guardianEmail)
    if (!name && student.guardianName) setName(student.guardianName)
  }

  const validate = () => {
    const next: Record<string, string> = {}
    const trimmedEmail = email.trim()
    if (kind !== 'student' && !trimmedEmail) next.email = 'Enter an email address'
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) next.email = 'Enter an email like name@school.in'
    if (/\.local$/i.test(trimmedEmail)) next.email = 'This is a placeholder from a staff import. Enter their real email.'
    if (kind === 'staff' && roleKeys.length === 0) next.roles = 'Choose at least one role'
    if (kind !== 'staff' && students.length === 0) next.students = kind === 'student' ? 'Choose the student' : 'Add at least one child'
    if (kind === 'student' && !username.trim()) next.username = 'Enter a login ID'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    try {
      const result = await createUser.mutateAsync({
        kind,
        name: name.trim(),
        email: email.trim() || null,
        username: kind === 'student' ? username.trim() : undefined,
        roles: kind === 'staff' ? roleKeys : undefined,
        teacherId: kind === 'staff' ? teacherId || null : undefined,
        students: kind === 'staff' ? undefined : students.map(({ studentId, relation }) => ({ studentId, relation })),
        credential: { method, ...(method === 'temporary' && password ? { password } : {}) },
      })
      const { user, ...delivery } = result
      toast.success('Login created')
      onCreated({ user, delivery })
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create the login.'))
    }
  }

  const toggleRole = (key: string, checked: boolean) =>
    setRoleKeys((prev) => (checked ? [...prev, key] : prev.filter((entry) => entry !== key)))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title={`New ${KIND_LABEL[kind].toLowerCase()} login`}
      description={kind === 'staff'
        ? 'Roles decide which modules and records they can open.'
        : kind === 'parent'
          ? 'One parent login covers all their children at this school.'
          : 'Students sign in with a login ID, so they don’t need an email.'}
      size="md"
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" loading={createUser.isPending}>Create login</Button>
        </>
      }
    >
      {kind === 'staff' ? (
        <div className="cb-form-section">
          <Combobox
            label="Staff member"
            hint="Linking the staff record lets the timetable decide which classes they teach."
            options={staffComboOptions}
            value={teacherId}
            onChange={pickStaff}
            placeholder="Search staff by name"
            clearable
          />
        </div>
      ) : (
        <div className="cb-form-section">
          <Combobox
            label={kind === 'student' ? 'Student' : 'Children'}
            options={studentComboOptions.filter((option) => !students.some((entry) => entry.studentId === option.value))}
            value={studentPick}
            onChange={pickStudent}
            placeholder="Search by name or admission no."
            error={errors.students}
          />
          {students.length > 0 ? (
            <ul className="ua-chips" aria-label="Linked students">
              {students.map((entry) => (
                <li key={entry.studentId} className="ua-chip">
                  {entry.label}
                  <button
                    type="button"
                    className="ua-chip__remove"
                    aria-label={`Remove ${entry.label}`}
                    onClick={() => setStudents((prev) => prev.filter((item) => item.studentId !== entry.studentId))}
                  >
                    <X size={14} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {kind === 'parent' && students.length > 0 ? (
            <Select
              label="Relation"
              options={RELATIONS}
              value={students[0].relation}
              onChange={(event) => {
                const relation = event.target.value
                setStudents((prev) => prev.map((entry) => ({ ...entry, relation })))
              }}
            />
          ) : null}
        </div>
      )}

      <div className="cb-form-section">
        <div className="cb-form-grid">
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={kind === 'student' ? undefined : 'is-wide'}
          />
          {kind === 'student' ? (
            <TextField
              label="Login ID"
              hint="Usually the admission number."
              value={username}
              error={errors.username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
            />
          ) : null}
          <TextField
            label={kind === 'student' ? 'Email (optional)' : 'Email'}
            type="email"
            required={kind !== 'student'}
            value={email}
            error={errors.email}
            onChange={(event) => setEmail(event.target.value)}
            className="is-wide"
          />
        </div>
      </div>

      {kind === 'staff' ? (
        <div className="cb-form-section">
          <div className="cb-form-section__title">Roles</div>
          <div className="ua-roles" role="group" aria-label="Roles">
            {roles.map((role) => (
              <Checkbox
                key={role.key}
                label={role.name}
                description={role.description}
                checked={roleKeys.includes(role.key)}
                onChange={(checked) => toggleRole(role.key, checked)}
              />
            ))}
          </div>
          {errors.roles ? <p className="cb-field__error" role="alert">{errors.roles}</p> : null}
        </div>
      ) : null}

      <CredentialFields
        method={method}
        onMethodChange={setMethod}
        password={password}
        onPasswordChange={setPassword}
        inviteDisabled={!email.trim()}
      />
    </Sheet>
  )
}

export default CreateLoginSheet
