const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'students', label: 'Students' },
  { id: 'staff', label: 'Staff' },
  { id: 'facilities', label: 'Facilities' },
  { id: 'history', label: 'History' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'sources', label: 'Sources' },
]

export function ProfileNav({ active }: { active: string }) {
  return (
    <div className="sticky top-[57px] z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="flex gap-1 overflow-x-auto py-2">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active === section.id
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
    </div>
  )
}
