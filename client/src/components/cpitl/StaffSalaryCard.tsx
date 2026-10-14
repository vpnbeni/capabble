import React from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { IndianRupee } from 'lucide-react'
import { Icon } from '@/components/ui'
import { selectUser } from '@/redux/slices/authSlice'
import { getAccessibleModules, isFeatureEnabledForPath } from '@/constants/featureAccess'
import { useSalarySummary } from '@/hooks/useCpitl'
import { fmtDate, inr } from './CpitlUi'
import './payroll.css'

/**
 * Read-only salary summary shown on a staff profile (STAAF). Salary is defined in
 * CPITL; this card only renders when CPITL payroll is enabled and the viewer is an admin,
 * so STAAF works unchanged without CPITL.
 *
 * Carries its own `.cb-app` scope so the tokens apply in both the kit staff sheet and
 * the older teacher modal.
 */
const StaffSalaryCard: React.FC<{ teacherId?: string }> = ({ teacherId }) => {
  const user = useSelector(selectUser)
  const enabled =
    user?.role === 'admin' &&
    getAccessibleModules(user?.featureToggles).has('cpitl') &&
    isFeatureEnabledForPath('/cpitl/salary', user?.featureToggles)
  const { data, isLoading, isError } = useSalarySummary(teacherId, enabled)

  if (!enabled || !teacherId || isError) return null

  return (
    <section className="cb-app cp-salarycard" aria-label="Salary">
      <div className="cp-salarycard__head">
        <div className="cp-salarycard__title">
          <span className="cp-salarycard__icon" aria-hidden="true">
            <Icon icon={IndianRupee} size={16} />
          </span>
          <div>
            <p className="cp-salarycard__name">Salary</p>
            <p className="cp-salarycard__sub">From Capital & Finance (read-only)</p>
          </div>
        </div>
        <Link to="/cpitl/salary" className="cb-link cp-salarycard__link">
          {data ? 'Manage in Capital' : 'Set salary in Capital'}
        </Link>
      </div>
      {isLoading ? (
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading salary…
        </div>
      ) : data ? (
        <dl className="cp-salarycard__values">
          <div>
            <dt>Gross / month</dt>
            <dd>{inr(data.gross)}</dd>
          </div>
          <div>
            <dt>Net / month</dt>
            <dd>{inr(data.net)}</dd>
          </div>
          <div>
            <dt>Effective from</dt>
            <dd>{fmtDate(data.effectiveFrom)}</dd>
          </div>
        </dl>
      ) : (
        <p className="cp-salarycard__empty">No salary set yet.</p>
      )}
    </section>
  )
}

export default StaffSalaryCard
