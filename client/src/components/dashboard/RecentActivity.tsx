import React from 'react'
import { User, CheckCircle2, AlertCircle, Clock } from 'lucide-react'

export type RecentActivityItem = {
  id: string
  description: string
  timestamp: string
  status: 'success' | 'warning' | 'info'
}

export type RecentActivityProps = {
  items: RecentActivityItem[]
}

const statusConfig = {
  success: { icon: CheckCircle2, className: 'text-[#10B981] bg-[#10B981]/10' },
  warning: { icon: AlertCircle, className: 'text-[#F59E0B] bg-[#F59E0B]/10' },
  info: { icon: Clock, className: 'text-[#1E40AF] bg-[#1E40AF]/10' },
}

const RecentActivity: React.FC<RecentActivityProps> = ({ items }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent Activity</h2>
      <div className="space-y-2">
        {items.map((item) => {
          const config = statusConfig[item.status]
          const Icon = config.icon
          return (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                <User className="w-4 h-4 text-gray-500" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700 dark:text-gray-300">{item.description}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.timestamp}</p>
              </div>
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${config.className}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default RecentActivity
