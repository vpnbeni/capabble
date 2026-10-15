import React from 'react'
import { ListChecks } from 'lucide-react'
import ClassWorkList from '@/components/acdmc/ClassWorkList'

const AcdmcQuiz: React.FC = () => (
  <ClassWorkList
    kind="quiz"
    icon={ListChecks}
    emptyBody="Build a quiz from multiple-choice and written questions, print the paper, then enter each student's marks."
  />
)

export default AcdmcQuiz
