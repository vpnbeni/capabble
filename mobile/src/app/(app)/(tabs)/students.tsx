import { GraduationCap } from 'lucide-react-native'

import { ComingSoon } from '@/staff/ComingSoon'
import { MobileScreen, NavBar } from '@/ui'

/** Principal and office: find any student and call a guardian. */
export default function StudentsScreen() {
  return (
    <MobileScreen tabs nav={<NavBar large title="Students" />}>
      <ComingSoon
        icon={GraduationCap}
        title="Students come in a later update"
        body="Search the school's students, see a student's details and call a guardian."
        webPath="/stdnt/students"
      />
    </MobileScreen>
  )
}
