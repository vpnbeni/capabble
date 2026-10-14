import React, { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Check, Pencil, Plus, Save, UserPlus, X } from 'lucide-react'
import type { AppDispatch, RootState } from '../../redux/store'
import {
  createTeacher,
  updateTeacher,
  hideAddTeacherModal,
  hideEditTeacherModal,
} from '../../redux/slices/teacherSlice'
import { fetchSubjects } from '../../redux/slices/subjectSlice'
import api from '../../services/api'
import StaffSalaryCard from '../cpitl/StaffSalaryCard'
import { Banner, Button, Icon, Select, Sheet, TextField, cx } from '@/components/ui'
import './staff-list.css'

/**
 * Add / edit form for the shared staff list (exam functionaries, staff groups, timetable
 * teachers). Same redux flow, defaults and payload as components/teachers/TeacherModal,
 * rendered as a kit Sheet.
 */

interface Subject {
  _id: string
  name: string
  code: string
  class?: string
}

interface SchoolOption {
  schoolName: string
  schoolCode: string
}

interface StaffFormProps {
  mode: 'add' | 'edit'
  onSuccess?: (teacher?: any) => void
  entityLabelSingular?: string
  /** Type options for this list (e.g. Staff types). Defaults to the exam duty types. */
  dutyTypeOptions?: string[]
  /** When false, the type isn't limited by designation and an existing type is never cleared. */
  enforceDesignationDutyRules?: boolean
  /** Label for the type field, e.g. "Type" on staff pages. */
  dutyTypeLabel?: string
}

const DEFAULT_SCHOOL_NAME = 'International Bharti School'
const DEFAULT_HIDDEN_VALUES = {
  bankName: 'N/A Bank',
  accountNumber: '000000',
  ifscCode: 'ABCD0000001',
  mobileNo: '9000000000',
}

const DESIGNATION_OPTIONS = ['Principal', 'Vice Principal', 'PGT', 'TGT', 'PRT', 'Others'] as const

const DUTY_TYPE_OPTIONS = [
  'Centre Superintendent',
  'Deputy Centre Superintendent',
  'Observer',
  'Invigilator',
  'ASI (CCTV)',
  'ASI (Frisking Male)',
  'ASI (Frisking Female)',
  'Clerk',
  'Others',
  'Class IV',
] as const

const getDutyOptionsForDesignation = (designation: string): string[] => {
  const d = (designation || '').trim().toLowerCase()
  if (d === 'principal') return ['Centre Superintendent', 'Observer']
  if (d === 'vice principal') return ['Centre Superintendent', 'Deputy Centre Superintendent']
  return [...DUTY_TYPE_OPTIONS]
}
const isSubjectOptionalDuty = (dutyType: string) => {
  const normalized = String(dutyType || '').trim().toLowerCase()
  return normalized === 'clerk' || normalized === 'class iv'
}
const normalizeSubjectCode = (value: string | undefined) => String(value || '').trim().toUpperCase()
const normalizeClassLabel = (value: string | undefined) => String(value || '').trim()
const normalizeAccountNumber = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return DEFAULT_HIDDEN_VALUES.accountNumber
  if (digits.length >= 6) return digits.slice(0, 40)
  return digits.padStart(6, '0')
}
const resolveDefaultSchoolOption = (options: SchoolOption[]): SchoolOption | null => {
  const match = (options || []).find((option) =>
    String(option.schoolName || '').toLowerCase().includes(DEFAULT_SCHOOL_NAME.toLowerCase())
  )
  return match || null
}

const createEmptyForm = () => ({
  name: '',
  oasisId: '',
  email: '',
  designation: '',
  subjectIds: [] as string[],
  subjectCode: '',
  schoolName: '',
  schoolCode: '',
  bankName: DEFAULT_HIDDEN_VALUES.bankName,
  accountNumber: DEFAULT_HIDDEN_VALUES.accountNumber,
  ifscCode: DEFAULT_HIDDEN_VALUES.ifscCode,
  mobileNo: DEFAULT_HIDDEN_VALUES.mobileNo,
  dutyType: '',
})

const StaffForm: React.FC<StaffFormProps> = ({
  mode,
  onSuccess,
  entityLabelSingular,
  dutyTypeOptions,
  enforceDesignationDutyRules = true,
  dutyTypeLabel = 'Duty type',
}) => {
  const dispatch = useDispatch<AppDispatch>()
  const { showAddModal, showEditModal, loading, selectedTeacher, error: storeError } = useSelector(
    (state: RootState) => state.teachers
  )
  const { subjects } = useSelector((state: RootState) => state.subjects)

  const isOpen = mode === 'add' ? showAddModal : showEditModal
  const entityLabel = entityLabelSingular ?? 'teacher'

  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([])
  const [schoolsLoading, setSchoolsLoading] = useState(false)
  const [subjectSearch, setSubjectSearch] = useState('')
  const [formData, setFormData] = useState(createEmptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const subjectById = useMemo(() => {
    const map: Record<string, Subject> = {}
    ;(subjects || []).forEach((subject: Subject) => {
      map[subject._id] = subject
    })
    return map
  }, [subjects])
  const getSubjectCodesFromIds = (ids: string[]) => {
    const codes = Array.from(
      new Set(ids.map((id) => normalizeSubjectCode(subjectById[id]?.code)).filter(Boolean))
    )
    return codes.join(', ')
  }
  const subjectCodeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    ;(subjects || []).forEach((subject: Subject) => {
      const code = normalizeSubjectCode(subject.code)
      if (!code) return
      counts[code] = (counts[code] || 0) + 1
    })
    return counts
  }, [subjects])
  const formatSubjectLabel = (subject?: Subject | null) => {
    if (!subject) return ''
    const code = normalizeSubjectCode(subject.code)
    const classLabel = normalizeClassLabel(subject.class)
    const shouldShowClass = Boolean(code) && (subjectCodeCounts[code] || 0) > 1 && Boolean(classLabel)
    return `${subject.name} (${subject.code || ''})${shouldShowClass ? ` - Class ${classLabel}` : ''}`.trim()
  }

  useEffect(() => {
    if (!isOpen) return
    dispatch(fetchSubjects())
    setSchoolsLoading(true)
    api
      .get('/teachers/schools')
      .then((res) => {
        const data = res?.data?.data ?? []
        setSchoolOptions(Array.isArray(data) ? data : [])
      })
      .catch((error) => {
        console.error('Failed to fetch school options:', error)
        setSchoolOptions([])
      })
      .finally(() => setSchoolsLoading(false))
  }, [dispatch, isOpen])

  useEffect(() => {
    if (!isOpen || mode !== 'add') return
    const defaultSchool = resolveDefaultSchoolOption(schoolOptions)
    if (!defaultSchool) return
    setFormData((prev) => {
      if (prev.schoolName) return prev
      return {
        ...prev,
        schoolName: defaultSchool.schoolName,
        schoolCode: defaultSchool.schoolCode,
      }
    })
  }, [isOpen, mode, schoolOptions])

  useEffect(() => {
    if (mode !== 'edit' || !selectedTeacher) return
    const firstSubject = Array.isArray(selectedTeacher.subjects) ? selectedTeacher.subjects[0] : ''
    const subjectIds = Array.isArray(selectedTeacher.subjects)
      ? selectedTeacher.subjects
          .map((subject) => (typeof subject === 'string' ? subject : subject?._id || ''))
          .filter(Boolean)
      : []
    const selectedSubjectCodes = Array.isArray(selectedTeacher.subjects)
      ? Array.from(
          new Set(
            selectedTeacher.subjects
              .map((subject) => (typeof subject === 'object' ? normalizeSubjectCode(subject?.code) : ''))
              .filter(Boolean)
          )
        )
      : []
    const subjectCode =
      selectedSubjectCodes.length > 0 ? selectedSubjectCodes.join(', ') : selectedTeacher.subjectCode || ''

    setFormData({
      name: selectedTeacher.name || '',
      oasisId: (selectedTeacher as any).oasisId || '',
      email: (selectedTeacher as any).email || '',
      designation: selectedTeacher.designation || '',
      subjectIds,
      subjectCode,
      schoolName: selectedTeacher.schoolName || '',
      schoolCode: selectedTeacher.schoolCode || '',
      bankName: selectedTeacher.bankName || '',
      accountNumber: selectedTeacher.accountNumber || '',
      ifscCode: selectedTeacher.ifscCode || '',
      mobileNo: selectedTeacher.mobileNo || selectedTeacher.phone || '',
      dutyType: selectedTeacher.dutyType || '',
    })
    if (typeof firstSubject === 'object' && firstSubject?.name) {
      setSubjectSearch(formatSubjectLabel(firstSubject as Subject))
    } else {
      setSubjectSearch('')
    }
  }, [mode, selectedTeacher, subjectCodeCounts])

  const schoolButtonItems = useMemo(() => {
    if (!formData.schoolName || schoolOptions.some((s) => s.schoolName === formData.schoolName)) {
      return schoolOptions
    }
    return [{ schoolName: formData.schoolName, schoolCode: formData.schoolCode }, ...schoolOptions]
  }, [formData.schoolCode, formData.schoolName, schoolOptions])

  const filteredSubjects = useMemo(() => {
    const term = subjectSearch.trim().toLowerCase()
    if (!term) return subjects
    return subjects.filter((subject: Subject) => {
      const name = String(subject.name || '').toLowerCase()
      const code = String(subject.code || '').toLowerCase()
      const classLabel = String(subject.class || '').toLowerCase()
      const combinedLabel = `${name} (${code}) ${classLabel}`
      return name.includes(term) || code.includes(term) || classLabel.includes(term) || combinedLabel.includes(term)
    })
  }, [subjectSearch, subjects])

  const designationOptions = useMemo<string[]>(() => {
    if (
      !formData.designation ||
      DESIGNATION_OPTIONS.includes(formData.designation as (typeof DESIGNATION_OPTIONS)[number])
    ) {
      return [...DESIGNATION_OPTIONS]
    }
    return [formData.designation, ...DESIGNATION_OPTIONS]
  }, [formData.designation])

  const allowedDutyOptions = useMemo(() => {
    if (dutyTypeOptions && !enforceDesignationDutyRules) {
      // Keep a stored type visible even if it isn't in this page's list, so saving never wipes it.
      const current = String(formData.dutyType || '').trim()
      return current && !dutyTypeOptions.includes(current) ? [...dutyTypeOptions, current] : [...dutyTypeOptions]
    }
    return getDutyOptionsForDesignation(formData.designation)
  }, [dutyTypeOptions, enforceDesignationDutyRules, formData.designation, formData.dutyType])
  const isClassIvFunctionary = useMemo(
    () => String(formData.dutyType || '').trim().toLowerCase() === 'class iv',
    [formData.dutyType]
  )
  const isDesignationOthers = useMemo(
    () => String(formData.dutyType || '').trim().toLowerCase() === 'others',
    [formData.dutyType]
  )
  const subjectsDisabled = useMemo(() => isSubjectOptionalDuty(formData.dutyType), [formData.dutyType])

  // Auto-clear dutyType if it becomes invalid for the current designation
  useEffect(() => {
    if (!enforceDesignationDutyRules) return
    if (formData.dutyType && !allowedDutyOptions.includes(formData.dutyType)) {
      setFormData((prev) => ({ ...prev, dutyType: '' }))
    }
  }, [allowedDutyOptions, enforceDesignationDutyRules, formData.dutyType])

  useEffect(() => {
    if (!isClassIvFunctionary) return
    setFormData((prev) => ({
      ...prev,
      designation: 'Class IV',
      subjectIds: [],
      subjectCode: 'N/A',
    }))
    setSubjectSearch('')
  }, [isClassIvFunctionary])

  useEffect(() => {
    if (isClassIvFunctionary) return
    setFormData((prev) => {
      if (prev.subjectCode !== 'N/A') return prev
      return {
        ...prev,
        subjectCode: getSubjectCodesFromIds(prev.subjectIds),
      }
    })
  }, [isClassIvFunctionary, getSubjectCodesFromIds])

  const resetForm = () => {
    setFormData(createEmptyForm())
    setErrors({})
  }

  const handleClose = () => {
    if (mode === 'add') dispatch(hideAddTeacherModal())
    else dispatch(hideEditTeacherModal())
    resetForm()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    const numericOnlyFields = new Set(['oasisId', 'accountNumber', 'mobileNo'])
    const nextValue = numericOnlyFields.has(name) ? value.replace(/\D/g, '') : value
    setFormData((prev) => ({ ...prev, [name]: nextValue }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const handleSubjectChange = (subjectId: string) => {
    setFormData((prev) => {
      const alreadySelected = prev.subjectIds.includes(subjectId)
      const nextSubjectIds = alreadySelected
        ? prev.subjectIds.filter((id) => id !== subjectId)
        : [...prev.subjectIds, subjectId]
      return {
        ...prev,
        subjectIds: nextSubjectIds,
        subjectCode: getSubjectCodesFromIds(nextSubjectIds),
      }
    })
    if (errors.subjectIds) setErrors((prev) => ({ ...prev, subjectIds: '' }))
  }

  const handleSchoolSelect = (school: SchoolOption) => {
    setFormData((prev) => ({
      ...prev,
      schoolName: school.schoolName,
      schoolCode: school.schoolCode,
    }))
    if (errors.schoolName || errors.schoolCode) {
      setErrors((prev) => ({ ...prev, schoolName: '', schoolCode: '' }))
    }
  }

  const validateForm = () => {
    // Allow creating/updating without required-field checks.
    // Any validation should come from the backend/API.
    setErrors({})
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const resolvedOasisId = isClassIvFunctionary || isDesignationOthers ? '' : formData.oasisId.trim()

    const payload = {
      name: formData.name.trim(),
      oasisId: resolvedOasisId,
      ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
      designation: isClassIvFunctionary ? 'Class IV' : formData.designation.trim(),
      subjects: isClassIvFunctionary || isDesignationOthers ? [] : formData.subjectIds,
      subjectCode: isClassIvFunctionary || isDesignationOthers ? 'N/A' : formData.subjectCode,
      schoolName: formData.schoolName.trim(),
      schoolCode: formData.schoolCode.trim(),
      bankName: formData.bankName.trim() || DEFAULT_HIDDEN_VALUES.bankName,
      accountNumber: normalizeAccountNumber(formData.accountNumber.trim()),
      ifscCode: (formData.ifscCode.trim() || DEFAULT_HIDDEN_VALUES.ifscCode).toUpperCase(),
      mobileNo: formData.mobileNo.trim() || DEFAULT_HIDDEN_VALUES.mobileNo,
      isActive: selectedTeacher?.isActive ?? true,
      dutyType: formData.dutyType,
    }

    try {
      if (mode === 'add') {
        const createdTeacher = await dispatch(createTeacher(payload as any)).unwrap()
        onSuccess?.(createdTeacher)
      } else if (selectedTeacher?._id) {
        const updatedTeacher = await dispatch(
          updateTeacher({
            ...payload,
            _id: selectedTeacher._id,
            id: selectedTeacher.id || selectedTeacher._id,
          } as any)
        ).unwrap()
        onSuccess?.(updatedTeacher)
      }
      handleClose()
    } catch (error) {
      console.error(`Failed to ${mode} teacher:`, error)
    }
  }

  const oasisNotNeeded = isClassIvFunctionary || isDesignationOthers
  const title = mode === 'add' ? `Add ${entityLabel}` : `Edit ${selectedTeacher?.name || entityLabel}`

  return (
    <Sheet
      open={isOpen}
      onClose={handleClose}
      size="lg"
      icon={mode === 'add' ? UserPlus : Pencil}
      title={title}
      description={
        mode === 'add'
          ? 'Fill in what you know. Anything left blank can be added later.'
          : 'Changes apply to this record everywhere it is used.'
      }
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={mode === 'add' ? Plus : Save} loading={loading}>
            {loading ? 'Saving' : mode === 'add' ? `Add ${entityLabel}` : 'Save changes'}
          </Button>
        </>
      }
    >
      {storeError ? <Banner tone="danger">{storeError}</Banner> : null}

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Details</h3>
        <div className="cb-form-grid">
          <TextField
            label="Name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            error={errors.name || undefined}
            autoComplete="off"
            className="is-wide"
          />
          <Select
            label={dutyTypeLabel}
            name="dutyType"
            value={formData.dutyType}
            onChange={handleInputChange}
            placeholder={`Choose a ${dutyTypeLabel.toLowerCase()}`}
            options={allowedDutyOptions}
          />
          <Select
            label="Designation"
            name="designation"
            value={formData.designation}
            onChange={handleInputChange}
            disabled={isClassIvFunctionary}
            error={errors.designation || undefined}
            placeholder="Choose a designation"
            options={designationOptions}
          />
          <TextField
            label="OASIS ID"
            name="oasisId"
            inputMode="numeric"
            pattern="[0-9]*"
            value={oasisNotNeeded ? '' : formData.oasisId}
            placeholder={oasisNotNeeded ? 'Not needed for this duty type' : undefined}
            onChange={handleInputChange}
            disabled={oasisNotNeeded}
            error={errors.oasisId || undefined}
            hint={oasisNotNeeded ? undefined : 'Numbers only'}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="Optional"
            error={errors.email || undefined}
          />
        </div>
      </div>

      {!isDesignationOthers ? (
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Subjects</h3>
          <div className="cb-form-grid">
            <div className="cb-field is-wide">
              <TextField
                label="Find a subject"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Name, code or class"
                disabled={subjectsDisabled}
                hint={subjectsDisabled ? 'Subjects are not needed for this duty type.' : undefined}
              />
              {formData.subjectIds.length > 0 ? (
                <div className="stafflist-chips" role="group" aria-label="Chosen subjects">
                  {formData.subjectIds.map((subjectId) => {
                    const selectedSubject = subjectById[subjectId]
                    if (!selectedSubject) return null
                    return (
                      <button
                        key={`selected-${subjectId}`}
                        type="button"
                        className="cb-chip is-active"
                        onClick={() => handleSubjectChange(subjectId)}
                        disabled={subjectsDisabled}
                        aria-label={`Remove ${formatSubjectLabel(selectedSubject)}`}
                      >
                        {formatSubjectLabel(selectedSubject)}
                        <Icon icon={X} size={14} />
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className={cx('stafflist-options', errors.subjectIds && 'is-invalid')}>
                {filteredSubjects.length === 0 ? (
                  <p className="stafflist-options__empty">No subjects match. Try a shorter search.</p>
                ) : (
                  filteredSubjects.map((subject: Subject) => {
                    const active = formData.subjectIds.includes(subject._id)
                    const code = normalizeSubjectCode(subject.code)
                    const classLabel = normalizeClassLabel(subject.class)
                    const showClass = Boolean(code) && (subjectCodeCounts[code] || 0) > 1 && Boolean(classLabel)
                    return (
                      <button
                        key={subject._id}
                        type="button"
                        className={cx('stafflist-option', active && 'is-on')}
                        aria-pressed={active}
                        onClick={() => handleSubjectChange(subject._id)}
                        disabled={subjectsDisabled}
                      >
                        <span className="stafflist-option__check" aria-hidden="true">
                          {active ? <Icon icon={Check} size={12} /> : null}
                        </span>
                        <span className="stafflist-option__name">{subject.name}</span>
                        <span className="stafflist-option__meta">
                          {subject.code}
                          {showClass ? ` · Class ${classLabel}` : ''}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
              {errors.subjectIds ? <span className="cb-field__error">{errors.subjectIds}</span> : null}
            </div>
            <TextField
              label="Subject code"
              name="subjectCode"
              value={formData.subjectCode}
              readOnly
              hint="Filled in from the subjects you choose."
            />
          </div>
        </div>
      ) : null}

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">School</h3>
        <div className="cb-form-grid">
          <div className="cb-field is-wide" role="group" aria-labelledby={`stafflist-school-${mode}`}>
            <span id={`stafflist-school-${mode}`} className="cb-field__label">
              School
            </span>
            {schoolsLoading ? (
              <span className="cb-field__hint">Loading schools…</span>
            ) : schoolButtonItems.length === 0 ? (
              <span className="cb-field__hint">No schools yet. Schools come from the candidate list.</span>
            ) : (
              <span className="stafflist-chips">
                {schoolButtonItems.map((school) => {
                  const active = formData.schoolName === school.schoolName
                  return (
                    <button
                      key={`${school.schoolName}-${school.schoolCode}`}
                      type="button"
                      className={cx('cb-chip', active && 'is-active')}
                      aria-pressed={active}
                      onClick={() => handleSchoolSelect(school)}
                    >
                      {school.schoolName}
                    </button>
                  )
                })}
              </span>
            )}
            {errors.schoolName ? <span className="cb-field__error">{errors.schoolName}</span> : null}
          </div>
          <TextField
            label="School code"
            name="schoolCode"
            value={formData.schoolCode}
            readOnly
            error={errors.schoolCode || undefined}
            hint={errors.schoolCode ? undefined : 'Filled in from the school you choose.'}
          />
        </div>
      </div>

      {mode === 'edit' && selectedTeacher?._id ? <StaffSalaryCard teacherId={selectedTeacher._id} /> : null}
    </Sheet>
  )
}

export default StaffForm
