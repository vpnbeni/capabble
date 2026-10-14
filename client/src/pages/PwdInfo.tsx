import React from 'react'
import CentreRecordsUtilityPage from '../components/centre-records/CentreRecordsUtilityPage'

const PwdInfo: React.FC = () => {
  return (
    <CentreRecordsUtilityPage
      title="PwD info"
      description="Track the PwD candidates appearing at the centre along with scribe support, extra time approvals, and other exam-day accommodations that need attention."
      summaryLabel="PwD candidate support, scribe planning, and accommodation readiness"
      overview={[
        'Review candidate-wise PwD details and approved support requirements.',
        'Manage scribe assignment status before the exam date.',
        'Track extra time and related accommodation notes in one place.',
      ]}
      workflows={[
        {
          title: 'Candidate accommodation register',
          description: 'Surface PwD candidate details, category notes, and room-facing instructions so the centre team can prepare before reporting time.',
        },
        {
          title: 'Scribe assignment tracking',
          description: 'Capture assigned scribes, pending approvals, and last-mile updates for candidates who need writing assistance.',
        },
        {
          title: 'Extra time planning',
          description: 'Show the approved extra time duration and any linked subject-specific accommodations for each exam day.',
        },
        {
          title: 'Readiness checklist',
          description: 'Use the page as an operational checklist for rooms, documentation, and support staff coordination.',
        },
      ]}
      outputs={[
        {
          title: 'PwD candidate summary',
          description: 'A printable list of candidates with accommodation notes for centre staff and observers.',
        },
        {
          title: 'Scribe assignment sheet',
          description: 'A simple handoff document showing candidate, scribe, and approval status.',
        },
        {
          title: 'Extra time plan',
          description: 'A date-wise view of candidates who require extended duration during the exam.',
        },
      ]}
    />
  )
}

export default PwdInfo
