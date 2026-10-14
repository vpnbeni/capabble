import React from 'react'
import { Percent } from 'lucide-react'
import { Page } from '@/components/ui'
import { ComingSoon } from '@/components/exmcl/ExmclUi'

const ExmclMarksDistribution: React.FC = () => (
  <Page>
    <ComingSoon
      icon={Percent}
      title="Marks distribution isn’t set up yet"
      body="This is where 100 marks will be split across theory, practical, subject enrichment and notebook for each class and subject. It isn’t available yet."
    />
  </Page>
)

export default ExmclMarksDistribution
