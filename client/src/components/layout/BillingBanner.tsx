import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import { Banner, formatDate } from '@/components/ui'
import type { Tone } from '@/components/ui'
import '@/components/billing/billing.css'

/** One line above every page when billing needs the school's attention. The billing page has its own. */
const BillingBanner: React.FC = () => {
  const user = useSelector(selectUser)
  const location = useLocation()
  const billing = user?.billing

  if (!billing || location.pathname.startsWith('/billing')) {
    return null
  }

  let tone: Tone = 'warning'
  let title = ''

  const daysLeft = (date: string | null | undefined) => (date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null)

  if (billing.accessMode === 'read_only') {
    tone = 'danger'
    title = 'Your school can only read data until the subscription is paid.'
  } else if (billing.accessMode === 'core_only') {
    title = 'Only core pages are open. Choose modules to unlock the rest.'
  } else if (billing.state === 'past_due_grace') {
    title = `Payment is overdue. Access becomes read-only on ${formatDate(billing.graceEndsAt)}.`
  } else if (billing.state === 'trialing') {
    const left = daysLeft(billing.trialEndsAt)
    if (left == null || left > 7) return null
    tone = 'info'
    title = `Your free trial ends on ${formatDate(billing.trialEndsAt)}. Choose the modules you want to keep.`
  } else if (billing.state === 'grandfathered') {
    tone = 'info'
    title = 'Choose your modules before your complimentary access ends.'
  }

  if (!title) {
    return null
  }

  return (
    <div className="cb-app bl-shell-banner">
      <Banner tone={tone} title={title}>
        <Link to="/billing" className="cb-link">Open billing</Link>
      </Banner>
    </div>
  )
}

export default BillingBanner
