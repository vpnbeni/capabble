import { ClipboardCheck } from 'lucide-react-native'

import { ComingSoon } from '@/staff/ComingSoon'
import { MobileScreen, NavBar } from '@/ui'

/** Teacher: today's registers to mark (the roll call), even without a connection. */
export default function RegistersScreen() {
  return (
    <MobileScreen tabs nav={<NavBar large title="Attendance" />}>
      <ComingSoon
        icon={ClipboardCheck}
        title="Roll call comes in the next update"
        body="Mark your class register on the phone, even without a connection. Use the website until then."
        webPath="/attnd/student-attendance"
      />
    </MobileScreen>
  )
}
