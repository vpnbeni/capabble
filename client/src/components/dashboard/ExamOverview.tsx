import React from 'react'
import { Building2, ClipboardList, DoorOpen } from 'lucide-react'

export type ExamOverviewProps = {
  schoolsCount: number
  functionariesCount: number
  roomUsage: string
}

const ExamOverview: React.FC<ExamOverviewProps> = ({
  schoolsCount,
  functionariesCount,
  roomUsage,
}) => {
  const items = [
    { label: 'Schools in Centre', value: schoolsCount, icon: Building2 },
    { label: 'Functionaries', value: functionariesCount, icon: ClipboardList },
    { label: 'Room Usage', value: roomUsage, icon: DoorOpen },
  ]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Exam Overview</h2>
      <div className="space-y-2">
        {items.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-2"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1E40AF]/10 text-[#1E40AF] flex-shrink-0">
              <Icon className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase text-gray-500">{label}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ExamOverview
