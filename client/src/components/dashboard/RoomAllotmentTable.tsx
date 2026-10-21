import React, { useRef, useEffect } from 'react'
import { DoorOpen, Video, UserX } from 'lucide-react'
import './RoomAllotmentTable.css'

export type RoomAllotmentRow = {
  roomNo: string
  candidates: number
  invigilator: string
  observer: string
  status: 'Checked In' | 'Pending' | 'Not Checked In'
}

export type RoomAllotmentTableProps = {
  rows: RoomAllotmentRow[]
  usedRooms: number
  totalRooms: number
  notCheckedInCount: number
}

const statusStyles = {
  'Checked In': 'bg-[#10B981]/20 text-[#10B981] border-[#10B981]/40',
  Pending: 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40',
  'Not Checked In': 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40',
}

const RoomAllotmentTable: React.FC<RoomAllotmentTableProps> = ({
  rows,
  usedRooms,
  totalRooms,
  notCheckedInCount,
}) => {
  const usedPercent = totalRooms > 0 ? Math.round((usedRooms / totalRooms) * 100) : 0
  const remainingPercent = 100 - usedPercent
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.setProperty('--room-allotment-used', `${usedPercent}%`)
      barRef.current.style.setProperty('--room-allotment-remaining', `${remainingPercent}%`)
    }
  }, [usedPercent, remainingPercent])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700 flex flex-col min-h-0">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Room Allotment & Duty Assignment
      </h2>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Room No</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Candidates</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Invigilator</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Observer</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <tr key={row.roomNo} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-3 py-2 font-medium">{row.roomNo}</td>
                <td className="px-3 py-2">{row.candidates}</td>
                <td className="px-3 py-2">{row.invigilator}</td>
                <td className="px-3 py-2">{row.observer}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyles[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <div
          ref={barRef}
          className="room-allotment-bar flex h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700"
        >
          <div
            className="room-allotment-bar-used h-full bg-[#10B981] transition-all"
            aria-hidden
          />
          <div
            className="room-allotment-bar-remaining h-full bg-[#EF4444] transition-all"
            aria-hidden
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <DoorOpen className="w-3.5 h-3.5" aria-hidden />
            Rooms {usedRooms}/{totalRooms}
          </span>
          <span className="flex items-center gap-1">
            <Video className="w-3.5 h-3.5" aria-hidden />
            CCTV
          </span>
          <span className="flex items-center gap-1 text-[#EF4444]">
            <UserX className="w-3.5 h-3.5" aria-hidden />
            Not Checked In: {notCheckedInCount}
          </span>
        </div>
      </div>
    </div>
  )
}

export default RoomAllotmentTable
