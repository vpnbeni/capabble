export type HelpFaqItem = {
  id: string
  category: string
  question: string
  answer: string
  keywords: string[]
}

export const HELP_FAQS: HelpFaqItem[] = [
  {
    id: 'login-1',
    category: 'Login & Access',
    question: 'I am unable to sign in to my school account.',
    answer:
      'Verify your school code and credentials. If you recently switched academic session, use Switch Session from the sidebar. Contact your admin if your module access was changed.',
    keywords: ['login', 'sign in', 'access', 'password', 'session'],
  },
  {
    id: 'stdnt-1',
    category: 'Student Management',
    question: 'How do I import or update student records?',
    answer:
      'Open Stdnt → Students and use import or edit actions for the selected class and section. Ensure the academic session matches the records you are updating.',
    keywords: ['student', 'records', 'import', 'admission', 'stdnt'],
  },
  {
    id: 'timetable-1',
    category: 'Timetable',
    question: 'My timetable shows teacher or period conflicts.',
    answer:
      'Review Period Distribution, Bell Timings, and teacher allocations in TMTBL. Regenerate or adjust the affected version after fixing overlapping assignments.',
    keywords: ['timetable', 'period', 'conflict', 'teacher', 'tmtbl'],
  },
  {
    id: 'exam-1',
    category: 'Exam Centre (CNTR)',
    question: 'Seating plan does not match today’s candidate count.',
    answer:
      'Recheck candidate imports and centre datesheet in CNTR, then regenerate the seating plan for the correct date and session.',
    keywords: ['seating', 'candidate', 'exam', 'cntr', 'centre'],
  },
  {
    id: 'exmcl-1',
    category: 'CBSE Registration',
    question: 'Subject choices are not saving for a class section.',
    answer:
      'Open ExmCl → CBSE Registration, confirm the class-section matrix is complete, then save student subject selections again for that section.',
    keywords: ['registration', 'subject', 'cbse', 'exmcl', 'marks'],
  },
  {
    id: 'asets-1',
    category: 'Asset Management',
    question: 'How do I track furniture or ICT equipment across classrooms?',
    answer:
      'Open ASETS → All Assets to create or batch-create items, then use Allocations or Transfers to move them. Each change writes an immutable lifecycle event on the asset profile.',
    keywords: ['asset', 'asets', 'furniture', 'transfer', 'allocation', 'inventory'],
  },
  {
    id: 'attnd-1',
    category: 'Attendance',
    question: 'How do I mark daily student or staff attendance?',
    answer:
      'Open ATTND and choose Student Attendance or Staff Attendance. Select class, section, and date before saving entries for the day.',
    keywords: ['attendance', 'attnd', 'present', 'absent', 'staff'],
  },
  {
    id: 'billing-1',
    category: 'Account & Billing',
    question: 'How do I update school profile or billing details?',
    answer:
      'Use Account Settings for school name, logo, affiliation, and CBSE code. Billing is available from the sidebar when enabled for your tenant.',
    keywords: ['billing', 'account', 'profile', 'school', 'settings'],
  },
  {
    id: 'report-1',
    category: 'Reports',
    question: 'Where can I find report cards and award lists?',
    answer:
      'Report cards and award lists are available under ExmCl → Performas when the exams module is active for your school.',
    keywords: ['report card', 'award', 'result', 'marks', 'report'],
  },
]

export const POPULAR_SEARCHES = [
  'Student Records',
  'Timetable',
  'Exams',
  'Attendance',
  'Report Card',
] as const
