import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UserX } from 'lucide-react'
import { Button, Card, EmptyState, Page } from '@/components/ui'
import StudentLedgerPanel from '@/components/cpitl/StudentLedgerPanel'

const CpitlStudentLedger: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  return (
    <Page>
      {id ? (
        <StudentLedgerPanel studentId={id} />
      ) : (
        <Card>
          <EmptyState
            icon={UserX}
            title="Student not found."
            body="Find the student from fee collection to open their ledger."
            action={<Button onClick={() => navigate('/cpitl/collection')}>Go to fee collection</Button>}
          />
        </Card>
      )}
    </Page>
  )
}

export default CpitlStudentLedger
