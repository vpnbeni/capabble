import React from 'react'
import { BookOpen } from 'lucide-react'
import { Page } from '@/components/ui'
import { ComingSoon } from '@/components/exmcl/ExmclUi'

const ExmclSyllabus: React.FC = () => (
  <Page>
    <ComingSoon
      icon={BookOpen}
      title="Syllabus records aren’t set up yet"
      body="This is where each subject’s syllabus for every exam will be kept. It isn’t available yet."
    />
  </Page>
)

export default ExmclSyllabus
