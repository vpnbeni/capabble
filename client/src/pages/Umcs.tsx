import React from 'react'
import CentreRecordsUtilityPage from '../components/centre-records/CentreRecordsUtilityPage'

const Umcs: React.FC = () => {
  return (
    <CentreRecordsUtilityPage
      title="UMC's"
      description="Handle unfair means cases reported at the centre and prepare the forwarding paperwork needed to escalate each case with the right supporting details."
      summaryLabel="Case handling, documentation, and forwarding workflow"
      overview={[
        'Register each UMC with candidate, date, subject, and room details.',
        'Track evidence, remarks, and stage-wise case handling progress.',
        'Generate the UMC forwarding performa with supporting centre information.',
      ]}
      workflows={[
        {
          title: 'Case intake',
          description: 'Create and maintain a structured record of each reported incident, including invigilator remarks and candidate identifiers.',
        },
        {
          title: 'Evidence checklist',
          description: 'Keep track of seized material, statements, and any supporting documents needed before forwarding.',
        },
        {
          title: 'Forwarding performa generation',
          description: 'Prepare the forwarding document with the centre details, case summary, and candidate particulars already arranged.',
        },
        {
          title: 'Case status monitoring',
          description: 'Mark a case as pending, reviewed, or forwarded so the centre team knows what remains to be done.',
        },
      ]}
      outputs={[
        {
          title: 'UMC forwarding performa',
          description: 'A centre-ready forwarding sheet for each unfair means case.',
        },
        {
          title: 'Incident register',
          description: 'A running list of all recorded UMCs for reporting and follow-up.',
        },
        {
          title: 'Supporting document checklist',
          description: 'A quick review sheet to confirm the file is complete before submission.',
        },
      ]}
    />
  )
}

export default Umcs
