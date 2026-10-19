import React from 'react'

export type KPICard = {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  accentColor: string
}

export type KPISectionProps = {
  cards: KPICard[]
}

const KPISection: React.FC<KPISectionProps> = ({ cards }) => {
  return (
    <div className="grid grid-cols-6 gap-4 flex-shrink-0">
      {cards.map(({ label, value, icon: Icon, accentColor }) => (
        <div
          key={label}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 flex overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-gray-100 dark:border-gray-700 group"
        >
          <div className={`w-1 min-h-[4rem] rounded-full ${accentColor} flex-shrink-0`} aria-hidden />
          <div className="flex-1 min-w-0 pl-3">
            <p className="text-xs font-medium text-gray-500 truncate uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
          </div>
          <div className="flex-shrink-0 self-center text-gray-200 group-hover:text-gray-300 transition-colors">
            <Icon className="w-8 h-8" aria-hidden />
          </div>
        </div>
      ))}
    </div>
  )
}

export default KPISection
