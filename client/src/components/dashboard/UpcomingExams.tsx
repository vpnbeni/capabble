import React from 'react'
import { Calendar, Clock } from 'lucide-react'

export type UpcomingExamItem = {
  subjectName: string
  subjectCode: string
  class: string
  studentsCount: number
  date: string
  time: string
}

export type UpcomingExamsProps = {
  items: UpcomingExamItem[]
}

const UpcomingExams: React.FC<UpcomingExamsProps> = ({ items }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Upcoming Exams</h2>
      <div className="space-y-3">
        {items.slice(0, 3).map((item, i) => (
          <div
            key={`${item.subjectCode}-${i}`}
            className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 flex gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#1E40AF]/10 text-[#1E40AF] flex-shrink-0">
              <Calendar className="w-4 h-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {item.subjectName} ({item.subjectCode})
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Class {item.class} · {item.studentsCount} students</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-0.5">
                  <Calendar className="w-3 h-3" aria-hidden />
                  {item.date}
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" aria-hidden />
                  {item.time}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default UpcomingExams
