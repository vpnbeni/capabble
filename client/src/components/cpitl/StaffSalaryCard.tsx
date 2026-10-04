import React from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { IndianRupee } from 'lucide-react'
import { selectUser } from '@/redux/slices/authSlice'
import { getAccessibleModules, isFeatureEnabledForPath } from '@/constants/featureAccess'
import { useSalarySummary } from '@/hooks/useCpitl'
import { fmtDate, inr } from './CpitlUi'

/**
 * Read-only salary summary shown on a staff profile (STAAF). Salary is defined in
 * CPITL; this card only renders when CPITL payroll is enabled and the viewer is an admin,
 * so STAAF works unchanged without CPITL.
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
    <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-900/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
            <IndianRupee className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Salary</p>
            <p className="text-xs text-slate-500">From Capital & Finance (read-only)</p>
          </div>
        </div>
        <Link to="/cpitl/salary" className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
          {data ? 'Manage in Capital' : 'Set salary in Capital'}
        </Link>
      </div>
      {isLoading ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-indigo-100/60 dark:bg-indigo-900/30" />
      ) : data ? (
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Gross / month</p>
            <p className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(data.gross)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Net / month</p>
            <p className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(data.net)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Effective from</p>
            <p className="text-slate-900 dark:text-white">{fmtDate(data.effectiveFrom)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No salary set yet.</p>
      )}
    </div>
  )
}

export default StaffSalaryCard
