import React from 'react'
import { BookOpenCheck } from 'lucide-react'
import ClassWorkList from '@/components/acdmc/ClassWorkList'

const AcdmcHomework: React.FC = () => (
  <ClassWorkList
    kind="homework"
    icon={BookOpenCheck}
    emptyBody="Set homework for a class and section, publish it, then tick off who turned it in."
  />
)

export default AcdmcHomework
