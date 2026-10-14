import React, { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ClipboardList, Save } from 'lucide-react'
import { useTimetable } from '@/contexts/TimetableContext'
import exmclExamService, { type ExmclExamDefinition, type ExamSubjectMatrix } from '@/services/exmclExamService'
import subjectService from '@/services/subjectService'
import { Button, Card, CardToolbar, Checkbox, EmptyState, FilterBar, Page } from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'

type SubjectRow = {
  key: string
  name: string
  source: 'timetable' | 'master' | 'both'
}

const subjectKey = (name: string) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')

const extractSubjectList = (payload: any): Array<{ name?: string }> => {
  if (Array.isArray(payload?.data?.data)) return payload.data.data
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const sameMatrix = (a: ExamSubjectMatrix, b: ExamSubjectMatrix) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    const x = new Set(a[key] || [])
    const y = b[key] || []
    if (x.size !== y.length || y.some((v) => !x.has(v))) return false
  }
  return true
}

const ExmclSubjects: React.FC = () => {
  const navigate = useNavigate()
  const { subjects: timetableSubjects, classes: timetableClasses } = useTimetable()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [matrix, setMatrix] = useState<ExamSubjectMatrix>({})
  const [saved, setSaved] = useState<ExamSubjectMatrix>({})
  const [masterSubjectNames, setMasterSubjectNames] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [matrixPayload, masterRes] = await Promise.all([
        exmclExamService.getSubjectMatrix(),
        subjectService.getAll({ page: 1, limit: 500 }).catch(() => null),
      ])
      setExams(matrixPayload.exams as ExmclExamDefinition[])
      setMatrix(matrixPayload.matrix || {})
      setSaved(matrixPayload.matrix || {})
      setMasterSubjectNames(
        extractSubjectList(masterRes)
          .map((item) => String(item?.name || '').trim())
          .filter(Boolean)
      )
    } catch (error) {
      toast.error(errorMessage(error, 'Subjects didn’t load. Check your connection and try again.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const subjectRows = useMemo(() => {
    const byKey = new Map<string, SubjectRow>()

    const add = (name: string, source: SubjectRow['source']) => {
      const trimmed = String(name || '').trim()
      if (!trimmed) return
      const key = subjectKey(trimmed)
      if (!key) return
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { key, name: trimmed, source })
        return
      }
      if (existing.source !== source) {
        byKey.set(key, { ...existing, source: 'both' })
      }
    }

    ;(timetableSubjects || []).forEach((item) => add(String(item.name || ''), 'timetable'))
    ;(timetableClasses || []).forEach((row) => {
      ;(row.subjects || []).forEach((name) => add(String(name), 'timetable'))
    })
    masterSubjectNames.forEach((name) => add(name, 'master'))

    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [masterSubjectNames, timetableClasses, timetableSubjects])

  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return subjectRows
    return subjectRows.filter((row) => row.name.toLowerCase().includes(q))
  }, [search, subjectRows])

  const dirty = !sameMatrix(matrix, saved)

  const isChecked = (examId: string, key: string) => Array.isArray(matrix[examId]) && matrix[examId].includes(key)

  const toggleCell = (examId: string, key: string) => {
    setMatrix((prev) => {
      const current = new Set(prev[examId] || [])
      if (current.has(key)) current.delete(key)
      else current.add(key)
      return { ...prev, [examId]: Array.from(current) }
    })
  }

  const toggleExamColumn = (examId: string, checked: boolean) => {
    setMatrix((prev) => ({
      ...prev,
      [examId]: checked ? filteredSubjects.map((row) => row.key) : [],
    }))
  }

  const toggleSubjectRow = (key: string, checked: boolean) => {
    setMatrix((prev) => {
      const next = { ...prev }
      exams.forEach((exam) => {
        const current = new Set(next[exam._id] || [])
        if (checked) current.add(key)
        else current.delete(key)
        next[exam._id] = Array.from(current)
      })
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = await exmclExamService.saveSubjectMatrix(matrix)
      setExams(payload.exams as ExmclExamDefinition[])
      setMatrix(payload.matrix || {})
      setSaved(payload.matrix || {})
      toast.success('Subjects saved for each exam.')
    } catch (error) {
      toast.error(errorMessage(error, 'The subjects weren’t saved. Try again.'))
    } finally {
      setSaving(false)
    }
  }

  let body: React.ReactNode
  if (loading) body = <CardLoading label="Loading subjects and exams…" />
  else if (exams.length === 0)
    body = (
      <EmptyState
        icon={ClipboardList}
        title="No exams set up for this session"
        body="Add the session’s exams first, then tick the subjects each one covers."
        action={
          <Button size="sm" onClick={() => navigate('/exmcl/exams')}>
            Add exams
          </Button>
        }
      />
    )
  else if (subjectRows.length === 0)
    body = (
      <EmptyState
        icon={BookOpen}
        title="No subjects found"
        body="Subjects come from the timetable and the subject list. Add them there and they appear here."
      />
    )
  else if (filteredSubjects.length === 0)
    body = (
      <EmptyState
        compact
        icon={BookOpen}
        title="No subjects match this search"
        action={
          <Button size="sm" onClick={() => setSearch('')}>
            Clear search
          </Button>
        }
      />
    )
  else
    body = (
      <div className="ex-matrix">
        <table aria-label="Subjects in each exam">
          <thead>
            <tr>
              <th scope="col" className="ex-matrix__subject">
                Subject
              </th>
              {exams.map((exam) => {
                const allSelected = filteredSubjects.every((row) => isChecked(exam._id, row.key))
                const someSelected = !allSelected && filteredSubjects.some((row) => isChecked(exam._id, row.key))
                return (
                  <th key={exam._id} scope="col" title={exam.name}>
                    <span className="ex-matrix__exam">
                      <span>{exam.code}</span>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={(checked) => toggleExamColumn(exam._id, checked)}
                        aria-label={`Every subject in ${exam.code}`}
                      />
                    </span>
                  </th>
                )
              })}
              <th scope="col" className="ex-matrix__all">
                All exams
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSubjects.map((row) => {
              const rowAll = exams.every((exam) => isChecked(exam._id, row.key))
              const rowSome = !rowAll && exams.some((exam) => isChecked(exam._id, row.key))
              return (
                <tr key={row.key}>
                  <th scope="row" className="ex-matrix__subject" title={row.name}>
                    {row.name}
                  </th>
                  {exams.map((exam) => (
                    <td key={exam._id}>
                      <Checkbox
                        checked={isChecked(exam._id, row.key)}
                        onChange={() => toggleCell(exam._id, row.key)}
                        aria-label={`${row.name} in ${exam.code}`}
                      />
                    </td>
                  ))}
                  <td className="ex-matrix__all">
                    <Checkbox
                      checked={rowAll}
                      indeterminate={rowSome}
                      onChange={(checked) => toggleSubjectRow(row.key, checked)}
                      aria-label={`${row.name} in every exam`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )

  return (
    <Page>
      <Card
        flush
        title="Subjects in each exam"
        subtitle={
          loading ? undefined : `${subjectRows.length} subjects · ${exams.length} exams · tick the subjects each exam covers`
        }
        action={
          <Button size="sm" onClick={() => navigate('/exmcl/exams')}>
            Manage exams
          </Button>
        }
      >
        {!loading && exams.length > 0 && subjectRows.length > 0 ? (
          <CardToolbar>
            <FilterBar
              search={{ placeholder: 'Search subjects', value: search, onChange: setSearch, label: 'Search subjects' }}
              actions={
                <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={() => void handleSave()}>
                  Save subjects
                </Button>
              }
            />
          </CardToolbar>
        ) : null}
        {body}
      </Card>
    </Page>
  )
}

export default ExmclSubjects
