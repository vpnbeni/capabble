import { Users } from 'lucide-react-native'

import { ComingSoon } from '@/staff/ComingSoon'
import { MobileScreen, NavBar } from '@/ui'

/** Teacher: the class-sections they teach, each with its students. */
export default function ClassesScreen() {
  return (
    <MobileScreen tabs nav={<NavBar large title="Classes" />}>
      <ComingSoon
        icon={Users}
        title="Your classes come in a later update"
        body="The classes you teach, their students, and a guardian's number when you need it."
        webPath="/stdnt/students"
      />
    </MobileScreen>
  )
}
