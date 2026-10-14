import { useLocation } from 'react-router-dom'
import { Tabs } from '@/components/ui'
import { useAttndMatrixMode, type AttndMatrixMode } from '@/contexts/AttndMatrixModeContext'
import './attnd.css'

export const AttndModeSwitch = () => {
  const { mode, setMode } = useAttndMatrixMode()
  const location = useLocation()
  const isStaffPage = /\/attnd\/staff-attendance\/?$/.test(location.pathname)

  return (
    <Tabs
      variant="segmented"
      label="Attendance view"
      className="attnd-modeswitch"
      value={mode}
      onChange={(id) => setMode(id as AttndMatrixMode)}
      items={[
        { id: 'classwise', label: isStaffPage ? 'By staff type' : 'By class' },
        { id: 'daywise', label: 'By day' },
      ]}
    />
  )
}
