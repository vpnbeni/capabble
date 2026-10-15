import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { Button, Card, Checkbox, DetailList, Page, PageHeader, TextField } from '@/components/ui'
import { changePassword, selectAuth } from '@/redux/slices/authSlice'
import { MISMATCH_ERROR, meetsPasswordPolicy, PASSWORD_ERROR, PASSWORD_RULE } from '@/components/auth/capabble/password'
import type { AppDispatch } from '@/redux/store'

/** The signed-in parent's or student's own login: details and password. */
const PortalAccount: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const { user, loading } = useSelector(selectAuth)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!current) return setErrors({ current: 'Enter your current password' })
    if (!meetsPasswordPolicy(next)) return setErrors({ next: PASSWORD_ERROR })
    if (next !== confirm) return setErrors({ confirm: MISMATCH_ERROR })
    try {
      await dispatch(changePassword({ currentPassword: current, newPassword: next, confirmNewPassword: confirm })).unwrap()
      toast.success('Password changed. Other devices have been signed out.')
      setCurrent('')
      setNext('')
      setConfirm('')
      setErrors({})
    } catch (message) {
      toast.error(String(message || 'Could not change the password.'))
    }
    return undefined
  }

  const type = show ? 'text' : 'password'

  return (
    <Page>
      <PageHeader title="Your login" />
      <Card title="Login details">
        <DetailList
          columns={2}
          items={[
            { label: 'Name', value: user?.name || '—' },
            { label: 'Signs in with', value: user?.username ? `${user.username}@${user.tenant?.slug || ''}` : user?.email || '—' },
          ]}
        />
      </Card>
      <Card title="Change password" subtitle="You stay signed in here; other devices are signed out.">
        <form className="cb-stack" onSubmit={submit} noValidate>
          <TextField label="Current password" type={type} autoComplete="current-password" value={current} error={errors.current} onChange={(e) => { setCurrent(e.target.value); setErrors({}) }} />
          <TextField label="New password" type={type} autoComplete="new-password" hint={PASSWORD_RULE} value={next} error={errors.next} onChange={(e) => { setNext(e.target.value); setErrors({}) }} />
          <TextField label="Confirm new password" type={type} autoComplete="new-password" value={confirm} error={errors.confirm} onChange={(e) => { setConfirm(e.target.value); setErrors({}) }} />
          <Checkbox label="Show passwords" checked={show} onChange={setShow} />
          <div>
            <Button variant="primary" type="submit" loading={loading}>Change password</Button>
          </div>
        </form>
      </Card>
    </Page>
  )
}

export default PortalAccount
