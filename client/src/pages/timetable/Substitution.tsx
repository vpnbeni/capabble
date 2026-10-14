import React, { useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { useTimetable, type TimetableTeacher, type TimetableSubject } from '@/contexts/TimetableContext'
import { Badge, Card, Checkbox, EmptyState, Page } from '@/components/ui'
import '@/components/timetable/teacherwise.css'

const Substitution: React.FC = () => {
  const normalize = (value: string) => value.trim().toLowerCase()

  const uniqueByNormalized = (values: string[]) => {
    const seen = new Set<string>()
    const output: string[] = []

    values.forEach((value) => {
      const trimmed = value.trim()
      if (!trimmed) return
      const key = normalize(trimmed)
      if (seen.has(key)) return
      seen.add(key)
      output.push(trimmed)
    })

    return output
  }

  const PERIODS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const
  const { teachers, subjects } = useTimetable()

  // Mirror `Departments.tsx`: teacher subject "matrix teachers" (id/name/subjects),
  // but here we only use the teacher names for the substitution table rows.
  const subjectNames = useMemo(() => {
    const names = (subjects as TimetableSubject[]).map((s) => s.name)
    return uniqueByNormalized(names).sort((a, b) => a.localeCompare(b))
  }, [subjects])

  const subjectAliasMap = useMemo(() => {
    const map = new Map<string, string>()
    subjectNames.forEach((name) => map.set(normalize(name), name))
    return map
  }, [subjectNames])

  const matrixTeachers = useMemo<Array<TimetableTeacher>>(() => {
    return teachers.map((teacher) => {
      const resolvedSubjects = uniqueByNormalized(
        (teacher.subjects || [])
          .map((subject) => subjectAliasMap.get(normalize(subject)) || '')
          .filter(Boolean)
      )

      return {
        id: teacher.id,
        name: teacher.name,
        shortName: teacher.shortName,
        subjects: resolvedSubjects,
      }
    })
  }, [teachers, subjectAliasMap])

  const [periodByTeacherId, setPeriodByTeacherId] = useState<Record<string, boolean[]>>({})

  useEffect(() => {
    setPeriodByTeacherId((prev) => {
      const next: Record<string, boolean[]> = { ...prev }

      // Ensure every current teacher has an array (preserve any existing selections).
      matrixTeachers.forEach((t) => {
        if (!next[t.id]) {
          next[t.id] = Array.from({ length: PERIODS.length }).map(() => false)
        }
      })

      // Remove stale teachers to keep state clean.
      const currentIds = new Set(matrixTeachers.map((t) => t.id))
      Object.keys(next).forEach((teacherId) => {
        if (!currentIds.has(teacherId)) delete next[teacherId]
      })

      return next
    })
  }, [matrixTeachers])

  const setPeriodEnabled = (teacherId: string, periodIdx: number, enabled: boolean) => {
    setPeriodByTeacherId((prev) => {
      const current = prev[teacherId] ?? Array.from({ length: PERIODS.length }).map(() => false)
      const next = current.map((v, idx) => (idx === periodIdx ? enabled : v))
      return { ...prev, [teacherId]: next }
    })
  }

  const markedCount = useMemo(
    () => Object.values(periodByTeacherId).reduce((sum, row) => sum + row.filter(Boolean).length, 0),
    [periodByTeacherId]
  )

  return (
    <Page width="full">
      <Card
        flush
        title="Substitution schedule"
        subtitle="Mark the periods (I to VIII) each teacher will cover as a substitute today."
        action={
          markedCount > 0 ? (
            <Badge tone="accent">
              {markedCount} {markedCount === 1 ? 'period' : 'periods'} marked
            </Badge>
          ) : null
        }
      >
        {matrixTeachers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No timetable teachers yet"
            body="Add teachers to the timetable to see one substitution row per teacher."
          />
        ) : (
          <div className="ttw-subs-scroll">
            <table className="ttw-subs">
              <thead>
                <tr>
                  <th scope="col" className="ttw-subs__no">Sr no</th>
                  <th scope="col" className="ttw-subs__name">Teacher</th>
                  {PERIODS.map((p) => (
                    <th key={p} scope="col">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixTeachers.map((teacher, rowIdx) => {
                  const row = periodByTeacherId[teacher.id]
                  const anyMarked = Boolean(row?.some(Boolean))
                  return (
                    <tr key={teacher.id} className={anyMarked ? 'is-marked' : undefined}>
                      <td className="ttw-subs__no">{rowIdx + 1}</td>
                      <th scope="row" className="ttw-subs__name">
                        <div className="ttw-subs__teacher">{teacher.name}</div>
                        {teacher.shortName ? <div className="ttw-subs__short">{teacher.shortName}</div> : null}
                      </th>
                      {PERIODS.map((_, periodIdx) => {
                        const enabled = row?.[periodIdx] ?? false
                        return (
                          <td key={periodIdx} title={`Teacher ${rowIdx + 1} Period ${PERIODS[periodIdx]}`}>
                            <Checkbox
                              checked={enabled}
                              onChange={(checked) => setPeriodEnabled(teacher.id, periodIdx, checked)}
                              aria-label={`${teacher.name}, period ${PERIODS[periodIdx]}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  )
}

export default Substitution
