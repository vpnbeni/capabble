import React from 'react'
import { useParams } from 'react-router-dom'
import StudentLedgerPanel from '@/components/cpitl/StudentLedgerPanel'
import { CpitlEmpty, CpitlPageShell } from '@/components/cpitl/CpitlUi'

const CpitlStudentLedger: React.FC = () => {
  const { id } = useParams()
  return <CpitlPageShell>{id ? <StudentLedgerPanel studentId={id} /> : <CpitlEmpty message="Student not found." />}</CpitlPageShell>
}

export default CpitlStudentLedger
