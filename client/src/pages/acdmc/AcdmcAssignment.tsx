import React from 'react'
import { ClipboardList } from 'lucide-react'
import ClassWorkList from '@/components/acdmc/ClassWorkList'

const AcdmcAssignment: React.FC = () => (
  <ClassWorkList
    kind="assignment"
    icon={ClipboardList}
    emptyBody="Set an assignment with its maximum marks, publish it, then record submissions and marks for each student."
  />
)

export default AcdmcAssignment
