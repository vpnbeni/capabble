import React from 'react'
import toast from 'react-hot-toast'
import { Copy, Printer } from 'lucide-react'
import { Badge, Button, Dialog, formatDate } from '@/components/ui'
import type { CredentialDelivery, ManagedUser } from '@/services/userAdminService'
import './access.css'

export const KIND_LABEL: Record<ManagedUser['kind'], string> = {
  staff: 'Staff',
  parent: 'Parent',
  student: 'Student',
}

/** One status per login, most urgent first. */
export const LoginStatusBadge: React.FC<{ user: Pick<ManagedUser, 'isActive' | 'lockedUntil' | 'invitePending' | 'mustChangePassword'> }> = ({ user }) => {
  if (!user.isActive) return <Badge tone="neutral">Inactive</Badge>
  if (user.lockedUntil) return <Badge tone="danger">Locked</Badge>
  if (user.invitePending) return <Badge tone="info">Invited</Badge>
  if (user.mustChangePassword) return <Badge tone="warning">Temporary password</Badge>
  return <Badge tone="success">Active</Badge>
}

export const lastSignIn = (value: string | null) => (value ? formatDate(value) : 'Never')

export const errorMessage = (error: unknown, fallback = 'Something went wrong. Try again.') => {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  return data?.message || data?.error || fallback
}

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}. Select it and copy instead.`)
  }
}

export interface CredentialSlip {
  name: string
  loginId: string
  temporaryPassword?: string
  detail?: string
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * Print login slips (one per person) to hand over in class or at the office.
 * Opens a plain print page; nothing is stored or sent anywhere.
 */
export const printCredentialSlips = (slips: CredentialSlip[], schoolName: string) => {
  const printable = slips.filter((slip) => slip.temporaryPassword)
  if (printable.length === 0) return
  const win = window.open('', '_blank', 'width=800,height=900')
  if (!win) {
    toast.error('Allow pop-ups for this site to print login slips.')
    return
  }
  const origin = window.location.origin
  const slipHtml = printable.map((slip) => `
    <section class="slip">
      <h2>${escapeHtml(schoolName || 'Your school')}</h2>
      <p class="name">${escapeHtml(slip.name)}${slip.detail ? ` · ${escapeHtml(slip.detail)}` : ''}</p>
      <dl>
        <dt>Sign in at</dt><dd>${escapeHtml(origin)}</dd>
        <dt>Login ID</dt><dd class="mono">${escapeHtml(slip.loginId)}</dd>
        <dt>Temporary password</dt><dd class="mono">${escapeHtml(slip.temporaryPassword || '')}</dd>
      </dl>
      <p class="note">You will be asked to choose your own password the first time you sign in. Keep this slip private.</p>
    </section>`).join('')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Login slips</title>
    <style>
      body { font-family: Inter, system-ui, sans-serif; color: #111; margin: 24px; }
      .slip { border: 1px dashed #888; border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; page-break-inside: avoid; }
      h2 { margin: 0 0 4px; font-size: 16px; }
      .name { margin: 0 0 12px; font-size: 14px; }
      dl { display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; margin: 0 0 12px; font-size: 14px; }
      dt { color: #555; }
      dd { margin: 0; }
      .mono { font-family: ui-monospace, Menlo, monospace; font-size: 15px; font-weight: 600; }
      .note { margin: 0; font-size: 12px; color: #555; }
    </style></head><body>${slipHtml}</body></html>`)
  win.document.close()
  win.focus()
  win.print()
}

/**
 * Shows a new temporary password or invite link once, right after it is made.
 * The server never shows it again.
 */
export const CredentialDialog: React.FC<{
  open: boolean
  onClose: () => void
  name: string
  loginId: string
  delivery: CredentialDelivery | null
  schoolName: string
}> = ({ open, onClose, name, loginId, delivery, schoolName }) => {
  const hasPassword = Boolean(delivery?.temporaryPassword)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={hasPassword ? 'Share the temporary password' : 'Invite sent'}
      description={hasPassword
        ? 'This is the only time it is shown. They choose their own password when they first sign in.'
        : delivery?.emailSent
          ? `We emailed an invite link to ${loginId}. You can also share the link below. It works once and expires in 3 days.`
          : 'The invite email could not be sent. Share this link with them instead. It works once and expires in 3 days.'}
      footer={
        <>
          {hasPassword ? (
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => printCredentialSlips([{ name, loginId, temporaryPassword: delivery?.temporaryPassword }], schoolName)}
            >
              Print login slip
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="cb-app ua-credential">
        <div className="ua-credential__row">
          <span className="ua-credential__label">Login ID</span>
          <span className="ua-credential__value">{loginId}</span>
        </div>
        {hasPassword ? (
          <div className="ua-credential__row">
            <span className="ua-credential__label">Temporary password</span>
            <span className="ua-credential__value">
              {delivery?.temporaryPassword}
              <Button size="sm" variant="tertiary" icon={Copy} onClick={() => copy(delivery?.temporaryPassword || '', 'Password')}>
                Copy
              </Button>
            </span>
          </div>
        ) : delivery?.inviteUrl ? (
          <div className="ua-credential__row">
            <span className="ua-credential__label">Invite link</span>
            <span className="ua-credential__value">
              {delivery.inviteUrl}
              <Button size="sm" variant="tertiary" icon={Copy} onClick={() => copy(delivery.inviteUrl || '', 'Link')}>
                Copy
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
