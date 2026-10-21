import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export type OccupancyChartProps = {
  used: number
  remaining: number
}

const COLORS = ['#10B981', '#E5E7EB']

const OccupancyChart: React.FC<OccupancyChartProps> = ({ used, remaining }) => {
  const total = used + remaining
  const data = total > 0
    ? [
        { name: 'Used', value: used, color: COLORS[0] },
        { name: 'Remaining', value: remaining, color: COLORS[1] },
      ].filter((d) => d.value > 0)
    : [{ name: 'Empty', value: 1, color: COLORS[1] }]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 w-full text-left">
        Occupancy
      </h2>
      <div className="relative w-full max-w-[140px] h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={56}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          aria-hidden
        >
          <span className="text-xl font-bold text-gray-900 dark:text-white">{used}</span>
          <span className="text-[10px] text-gray-500 uppercase">Used</span>
        </div>
      </div>
      <div className="flex gap-3 mt-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#10B981]" aria-hidden />
          Used {used}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-600" aria-hidden />
          Remaining {remaining}
        </span>
      </div>
    </div>
  )
}

export default OccupancyChart
