import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import type { ExamDefinition, ExamInput } from '@/services/examService'
import { space } from '@/theme/tokens'
import { BottomSheet, Callout, MobileButton, MobileTextField, haptic, useToast } from '@/ui'

import { useSaveExam } from './examSetupQueries'

type Form = { name: string; code: string; duration: string; maximumMarks: string }

const formOf = (exam?: ExamDefinition | null): Form => ({
  name: exam?.name ?? '',
  code: exam?.code ?? '',
  duration: exam?.duration ?? '',
  maximumMarks: exam?.maximumMarks ? String(exam.maximumMarks) : '',
})

/**
 * Add an exam or change one (the website's Exams sheet): name, short code, how long, out of how
 * many marks. Editing sends only what changed.
 */
export function ExamSheet({ open, onClose, exam, exams }: { open: boolean; onClose: () => void; exam?: ExamDefinition | null; exams: ExamDefinition[] }) {
  const toast = useToast()
  const save = useSaveExam()
  const [form, setForm] = useState<Form>(formOf(exam))
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({})

  // Start from the exam as it is each time the sheet opens.
  const opening = open ? exam?._id ?? 'new' : null
  const [openedFor, setOpenedFor] = useState(opening)
  if (opening !== openedFor) {
    setOpenedFor(opening)
    if (opening) {
      setForm(formOf(exam))
      setErrors({})
    }
  }

  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }))

  const submit = async () => {
    const name = form.name.trim()
    const code = form.code.trim().toUpperCase()
    const marks = Number(form.maximumMarks || 0)
    const taken = (value: string, field: 'name' | 'code') =>
      exams.some((row) => row._id !== exam?._id && String(row[field] ?? '').trim().toUpperCase() === value.toUpperCase())
    const next: typeof errors = {}
    if (!name) next.name = 'Enter the exam’s name.'
    else if (taken(name, 'name')) next.name = 'Another exam has this name.'
    if (!code) next.code = 'Enter a short code, like UT1.'
    else if (taken(code, 'code')) next.code = 'Another exam uses this code.'
    if (!Number.isFinite(marks) || marks < 0) next.maximumMarks = 'Enter a number, 0 or more.'
    setErrors(next)
    if (Object.keys(next).length) return

    const full: ExamInput = { name, code, duration: form.duration.trim(), maximumMarks: marks, displayOrder: exam?.displayOrder ?? exams.length }
    const input: Partial<ExamInput> = exam
      ? Object.fromEntries(
          Object.entries(full).filter(([key, value]) => {
            const before = key === 'maximumMarks' ? exam.maximumMarks ?? 0 : key === 'displayOrder' ? exam.displayOrder ?? exams.length : String(exam[key as keyof ExamDefinition] ?? '')
            return value !== before
          }),
        )
      : full
    if (exam && !Object.keys(input).length) return onClose()
    try {
      await save.mutateAsync({ id: exam?._id, input })
      haptic.success()
      onClose()
      toast(exam ? `${name} saved` : `${name} added`)
    } catch (error) {
      haptic.error()
      setErrors({ form: error instanceof ApiError ? error.message : "The exam didn't save. Check your connection and try again." })
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={exam ? 'Edit exam' : 'Add an exam'}
      footer={
        <MobileButton fullWidth loading={save.isPending} onPress={submit}>
          {exam ? 'Save' : 'Add exam'}
        </MobileButton>
      }
    >
      {errors.form ? (
        <Callout tone="danger" title="Not saved">
          {errors.form}
        </Callout>
      ) : null}
      <View style={{ gap: space['space-4'] }}>
        <MobileTextField label="Name" value={form.name} onChangeText={(name) => set({ name })} error={errors.name} placeholder="Unit Test 1" maxLength={80} returnKeyType="next" />
        <MobileTextField
          label="Short code"
          hint="Shown on admit cards and report cards."
          value={form.code}
          onChangeText={(code) => set({ code: code.toUpperCase() })}
          error={errors.code}
          placeholder="UT1"
          autoCapitalize="characters"
          maxLength={20}
          returnKeyType="next"
        />
        <MobileTextField label="How long (optional)" value={form.duration} onChangeText={(duration) => set({ duration })} placeholder="3 hours" maxLength={40} returnKeyType="next" />
        <MobileTextField
          label="Out of (optional)"
          type="number"
          value={form.maximumMarks}
          onChangeText={(text) => set({ maximumMarks: text.replace(/[^0-9]/g, '') })}
          error={errors.maximumMarks}
          placeholder="80"
          maxLength={4}
        />
      </View>
    </BottomSheet>
  )
}
