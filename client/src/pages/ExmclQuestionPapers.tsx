import React from 'react'
import { FileText } from 'lucide-react'
import { Page } from '@/components/ui'
import { ComingSoon } from '@/components/exmcl/ExmclUi'

const ExmclQuestionPapers: React.FC = () => (
  <Page>
    <ComingSoon
      icon={FileText}
      title="Question paper records aren’t set up yet"
      body="This is where question papers for internal exams will be kept. It isn’t available yet."
    />
  </Page>
)

export default ExmclQuestionPapers
