import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  ImagePlus,
  LayoutGrid,
  Pencil,
  SearchX,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import type { AppDispatch, RootState } from '../redux/store'
import { createStudent, bulkDeleteStudents, fetchStudentStats, fetchStudents, updateStudent } from '../redux/slices/studentSlice'
import api from '../services/api'
import studentService from '../services/studentService'
import timetableService from '../services/timetableService'
import { makeRecordService } from '../services/recordService'
import { sortSectionNames } from '../constants/studentClasses'
import {
  normalizeAllowedSections,
  normalizeSectionKey,
  resolveSectionAgainstAllowed,
} from '../constants/sectionMetadata'
import { normalizeHouseColorKey } from '../constants/houseColorMetadata'
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Progress,
  Select,
  Sheet,
  StatCard,
  TextArea,
  TextField,
  formatDate,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import {
  classLabel,
  classSectionLabel as classSectionLabelText,
  formatAddress,
  formatCount,
  normalizeGender,
  sectionLabel,
  studentPhotoUrl,
} from '@/components/students/studentFormat'
import '@/components/students/students.css'

const STUDENTS_PAGE_SIZE = 250
const BULK_DELETE_TOAST_ID = 'stdnt-bulk-delete'
const BULK_DELETE_BATCH_SIZE = 50

type StudentFormState = {
  rollNumber: string
  classRollNo: string
  name: string
  gender: 'Boy' | 'Girl' | 'Other' | 'Unspecified'
  email: string
  phone: string
  penNumber: string
  class: string
  section: string
  fatherName: string
  motherName: string
  guardianPhone: string
  house: string
  houseId: string
  busNo: string
  bloodGroup: string
  address: {
    street: string
    city: string
    state: string
    pincode: string
  }
  dateOfBirth: string
  admissionDate: string
  aadharNumber: string
  category: string
  religion: string
  nationality: string
  notes: string
  isActive: boolean
}

const CATEGORY_OPTIONS = ['General', 'OBC', 'SC', 'ST', 'EWS'] as const
const GENDER_OPTIONS = ['Boy', 'Girl', 'Other', 'Unspecified'] as const
const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
const actvtHousesService = makeRecordService('/actvt/houses')

type ClassSectionOption = {
  className: string
  sections: string[]
}

const createInitialFormState = (): StudentFormState => ({
  rollNumber: '',
  classRollNo: '',
  name: '',
  gender: 'Unspecified',
  email: '',
  phone: '',
  penNumber: '',
  class: '',
  section: '',
  fatherName: '',
  motherName: '',
  guardianPhone: '',
  house: '',
  houseId: '',
  busNo: '',
  bloodGroup: '',
  address: {
    street: '',
    city: '',
    state: '',
    pincode: '',
  },
  dateOfBirth: '',
  admissionDate: new Date().toISOString().slice(0, 10),
  aadharNumber: '',
  category: 'General',
  religion: '',
  nationality: 'Indian',
  notes: '',
  isActive: true,
})

const normalizeHouseLookupKey = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\bhouses?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
)

const getHouseShortName = (value = '') => {
  const text = String(value || '').trim()
  if (!text) return '-'
  const withoutHouse = text.replace(/\s+houses?$/i, '').trim()
  const firstWord = (withoutHouse || text).split(/\s+/)[0] || text
  return firstWord
}

type ActivityHouseOption = { _id: string; name: string; color?: string }

const resolveStudentHouse = (
  student: { house?: string; houseId?: string | { _id?: string } | null },
  houses: ActivityHouseOption[]
) => {
  const houseId = typeof student.houseId === 'object' && student.houseId
    ? String(student.houseId._id || '')
    : String(student.houseId || '')
  if (houseId) {
    const byId = houses.find((house) => house._id === houseId)
    if (byId) return byId
  }
  const key = normalizeHouseLookupKey(student.house || '')
  if (!key) return null
  return houses.find((house) => normalizeHouseLookupKey(house.name) === key) || null
}

const mapStudentToFormState = (student: any): StudentFormState => ({
  rollNumber: String(student?.rollNumber || ''),
  classRollNo: student?.classRollNo == null || student?.classRollNo === ''
    ? ''
    : String(student.classRollNo),
  name: String(student?.name || ''),
  gender: (['Boy', 'Girl', 'Other', 'Unspecified'].includes(String(student?.gender || ''))
    ? String(student?.gender || 'Unspecified')
    : 'Unspecified') as StudentFormState['gender'],
  email: String(student?.email || ''),
  phone: String(student?.phone || ''),
  penNumber: String(student?.penNumber || ''),
  class: String(student?.class || ''),
  section: String(student?.section || ''),
  fatherName: String(student?.fatherName || ''),
  motherName: String(student?.motherName || ''),
  guardianPhone: String(student?.guardianPhone || ''),
  house: String(student?.house || ''),
  houseId: String(student?.houseId?._id || student?.houseId || ''),
  busNo: String(student?.busNo || ''),
  bloodGroup: String(student?.medicalInfo?.bloodGroup || ''),
  address: {
    street: String(student?.address?.street || ''),
    city: String(student?.address?.city || ''),
    state: String(student?.address?.state || ''),
    pincode: String(student?.address?.pincode || ''),
  },
  dateOfBirth: String(student?.dateOfBirth || '').slice(0, 10),
  admissionDate: String(student?.admissionDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
  aadharNumber: String(student?.aadharNumber || ''),
  category: String(student?.category || 'General'),
  religion: String(student?.religion || ''),
  nationality: String(student?.nationality || 'Indian'),
  notes: String(student?.notes || ''),
  isActive: student?.isActive !== false,
})

const sortClassNames = (left: string, right: string) => {
  const leftMatch = left.match(/\d+/)
  const rightMatch = right.match(/\d+/)
  const leftNumeric = leftMatch ? Number.parseInt(leftMatch[0], 10) : Number.MAX_SAFE_INTEGER
  const rightNumeric = rightMatch ? Number.parseInt(rightMatch[0], 10) : Number.MAX_SAFE_INTEGER

  if (leftNumeric !== rightNumeric) return leftNumeric - rightNumeric
  return left.localeCompare(right)
}

const buildClassSectionOptions = (state: Awaited<ReturnType<typeof timetableService.getState>>): ClassSectionOption[] => {
  const matrixClasses = Array.isArray(state?.matrixClasses) ? state.matrixClasses : []
  const matrixSections = Array.isArray(state?.matrixSections) ? state.matrixSections : []
  const matrixSelection = state?.matrixSelection ?? {}

  const sectionNameById = new Map(
    matrixSections
      .map((section) => ({
        id: String(section.id || '').trim(),
        name: String(section.name || '').trim(),
      }))
      .filter((section) => section.id && section.name)
      .map((section) => [section.id, section.name])
  )

  const fromMatrix = matrixClasses
    .map((item) => {
      const classId = String(item.id || '').trim()
      const className = String(item.name || '').trim()
      if (!classId || !className) return null

      const sections = normalizeAllowedSections(
        Object.entries(matrixSelection[classId] || {})
          .filter(([, checked]) => Boolean(checked))
          .map(([sectionId]) => sectionNameById.get(sectionId) || '')
          .map((name) => name.trim())
          .filter(Boolean)
      ).sort((a, b) => sortSectionNames(a, b, className))

      if (sections.length === 0) return null
      return { className, sections }
    })
    .filter(Boolean) as ClassSectionOption[]

  return fromMatrix.sort((a, b) => sortClassNames(a.className, b.className))
}

const Students: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch<AppDispatch>()
  const { students, stats, loading, pagination } = useSelector((state: RootState) => state.students)

  const [formData, setFormData] = useState<StudentFormState>(createInitialFormState)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [pageMessage, setPageMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [page, setPage] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isTemplateDownloading, setIsTemplateDownloading] = useState(false)
  const [isTemplateUploading, setIsTemplateUploading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [tableSortField, setTableSortField] = useState<
    | 'rollNumber'
    | 'classRollNo'
    | 'name'
    | 'class'
    | 'section'
    | 'fatherName'
    | 'motherName'
    | 'dateOfBirth'
    | 'gender'
    | 'house'
    | 'busNo'
    | 'bloodGroup'
    | 'category'
    | 'phone'
    | 'penNumber'
    | 'address'
    | null
  >(null)
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [timetableClassSectionOptions, setTimetableClassSectionOptions] = useState<ClassSectionOption[]>([])
  const [activityHouses, setActivityHouses] = useState<Array<{ _id: string; name: string; color?: string }>>([])
  const [editingSectionStudentId, setEditingSectionStudentId] = useState<string | null>(null)
  const [sectionUpdateLoadingById, setSectionUpdateLoadingById] = useState<Record<string, boolean>>({})
  const [sectionOverrideByStudentId, setSectionOverrideByStudentId] = useState<Record<string, string>>({})
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string | null>(null)
  const [isPhotoDragActive, setIsPhotoDragActive] = useState(false)

  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const templateInputRef = useRef<HTMLInputElement | null>(null)
  const bulkDeleteCancelRef = useRef(false)
  const deferredSearch = useDeferredValue(searchTerm)

  useEffect(() => {
    const student = (location.state as { editStudent?: any } | null)?.editStudent
    if (!student?._id) return
    setEditingStudentId(student._id)
    setIsEditModalOpen(true)
    setFormData(mapStudentToFormState(student))
    setFormErrors({})
    setShowAddForm(false)
  }, [location.state])

  useEffect(() => {
    dispatch(fetchStudentStats({
      ...(classFilter ? { class: classFilter } : {}),
      ...(sectionFilter ? { section: sectionFilter } : {}),
    }))
  }, [classFilter, dispatch, sectionFilter])

  useEffect(() => {
    let isMounted = true

    const loadClassSectionOptions = async () => {
      try {
        const state = await timetableService.getState()
        if (!isMounted) return

        const nextOptions = buildClassSectionOptions(state)
        setTimetableClassSectionOptions(nextOptions)

        if (nextOptions.length === 0) return

        setFormData((prev) => {
          const existingClass = nextOptions.find((option) => option.className === prev.class)
          if (existingClass) {
            const matchedSection = existingClass.sections.find(
              (section) => normalizeSectionKey(section) === normalizeSectionKey(prev.section)
            )
            const nextSection = matchedSection || existingClass.sections[0] || ''
            return {
              ...prev,
              section: nextSection,
            }
          }

          return {
            ...prev,
            class: nextOptions[0].className,
            section: nextOptions[0].sections[0] || '',
          }
        })
      } catch {
        if (!isMounted) return
        setTimetableClassSectionOptions([])
      }
    }

    loadClassSectionOptions()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadActivityHouses = async () => {
      try {
        const houses = await actvtHousesService.list()
        if (!isMounted) return
        setActivityHouses(
          (houses || [])
            .map((house) => ({
              _id: String(house._id || ''),
              name: String(house.name || '').trim(),
              color: house.color ? String(house.color) : undefined,
            }))
            .filter((house) => house._id && house.name)
            .sort((left, right) => left.name.localeCompare(right.name))
        )
      } catch {
        if (!isMounted) return
        setActivityHouses([])
      }
    }

    loadActivityHouses()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (activityHouses.length === 0) return

    setFormData((prev) => {
      if (prev.houseId) {
        const selected = activityHouses.find((house) => house._id === prev.houseId)
        if (!selected) return prev
        if (selected.name === prev.house) return prev
        return { ...prev, house: selected.name }
      }

      if (!prev.house) return prev
      const matched = activityHouses.find(
        (house) => house.name.toLowerCase() === prev.house.trim().toLowerCase()
      )
      if (!matched) return prev
      return { ...prev, houseId: matched._id, house: matched.name }
    })
  }, [activityHouses])

  useEffect(() => {
    dispatch(
      fetchStudents({
        page,
        limit: STUDENTS_PAGE_SIZE,
        sort: '-createdAt',
        ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
        ...(classFilter ? { class: classFilter } : {}),
        ...(sectionFilter ? { section: sectionFilter } : {}),
      })
    )
  }, [classFilter, deferredSearch, dispatch, page, sectionFilter])

  useEffect(() => {
    setPage(1)
  }, [deferredSearch, classFilter, sectionFilter])

  useEffect(() => {
    setSelectedIds([])
  }, [students])

  useEffect(() => {
    setSectionOverrideByStudentId({})
  }, [students])

  useEffect(() => {
    return () => {
      if (selectedPhotoPreview) {
        URL.revokeObjectURL(selectedPhotoPreview)
      }
    }
  }, [selectedPhotoPreview])

  useEffect(() => {
    if (!pageMessage) return

    const timeoutId = window.setTimeout(
      () => setPageMessage(null),
      pageMessage.tone === 'error' ? 8000 : 5000
    )

    return () => window.clearTimeout(timeoutId)
  }, [pageMessage])

  const classSectionOptions = useMemo(
    () => timetableClassSectionOptions,
    [timetableClassSectionOptions]
  )

  const totalClasses = useMemo(
    () => (
      new Set(
        (stats?.byClassSection || [])
          .map((entry) => String(entry?._id?.class || '').trim())
          .filter(Boolean)
      ).size
    ),
    [stats]
  )
  const totalClassSections = useMemo(
    () => (
      new Set(
        (stats?.byClassSection || [])
          .map((entry) => `${String(entry?._id?.class || '').trim()}::${String(entry?._id?.section || '').trim()}`)
          .filter((key) => key !== '::')
      ).size
    ),
    [stats]
  )
  const boysCount = useMemo(
    () => (stats?.byGender || []).find((entry) => entry._id === 'Boy')?.count ?? 0,
    [stats]
  )
  const girlsCount = useMemo(
    () => (stats?.byGender || []).find((entry) => entry._id === 'Girl')?.count ?? 0,
    [stats]
  )
  const classOptions = useMemo(
    () => classSectionOptions.map((option) => option.className).filter(Boolean),
    [classSectionOptions]
  )
  const sectionOptionsForSelectedClass = useMemo(
    () => classSectionOptions.find((option) => option.className === formData.class)?.sections || [],
    [classSectionOptions, formData.class]
  )
  const filterSectionOptions = useMemo(
    () => {
      if (!classFilter) {
        return Array.from(new Set(classSectionOptions.flatMap((option) => option.sections)))
          .sort((a, b) => a.localeCompare(b))
      }

      return classSectionOptions.find((option) => option.className === classFilter)?.sections || []
    },
    [classSectionOptions, classFilter]
  )

  useEffect(() => {
    if (!sectionFilter) return
    if (filterSectionOptions.includes(sectionFilter)) return
    setSectionFilter('')
  }, [filterSectionOptions, sectionFilter])

  useEffect(() => {
    if (!classFilter) return
    if (classOptions.includes(classFilter)) return
    setClassFilter('')
  }, [classFilter, classOptions])

  const selectedCount = selectedIds.length
  const sortedStudents = useMemo(() => {
    if (!tableSortField) return students

    const getSortableValue = (student: any) => {
      if (tableSortField === 'section') return sectionOverrideByStudentId[student._id] ?? student.section ?? ''
      if (tableSortField === 'dateOfBirth') {
        const parsed = new Date(student.dateOfBirth || '').getTime()
        return Number.isNaN(parsed) ? 0 : parsed
      }
      if (tableSortField === 'classRollNo') {
        return Number(student.classRollNo) || 0
      }
      if (tableSortField === 'bloodGroup') {
        return String(student?.medicalInfo?.bloodGroup || '').toLowerCase()
      }
      if (tableSortField === 'address') {
        return formatAddress(student?.address).toLowerCase()
      }
      return String(student?.[tableSortField] ?? '').toLowerCase()
    }

    return [...students].sort((a, b) => {
      const left = getSortableValue(a)
      const right = getSortableValue(b)
      if (left < right) return tableSortDirection === 'asc' ? -1 : 1
      if (left > right) return tableSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [students, tableSortDirection, tableSortField, sectionOverrideByStudentId])

  const visibleStudentIds = sortedStudents.map((student) => student._id)
  const allVisibleSelected = visibleStudentIds.length > 0 && visibleStudentIds.every((id) => selectedIds.includes(id))

  const handleSort = (field: NonNullable<typeof tableSortField>) => {
    if (tableSortField === field) {
      setTableSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTableSortField(field)
    setTableSortDirection('asc')
  }

  const handleFieldChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = event.target
    const checked = type === 'checkbox' ? (event.target as HTMLInputElement).checked : undefined

    if (name.startsWith('address.')) {
      const addressKey = name.split('.')[1] as keyof StudentFormState['address']
      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [addressKey]: value,
        },
      }))
      setFormErrors((prev) => ({ ...prev, [name]: '' }))
      return
    }

    if (name === 'class') {
      const matchedClass = classSectionOptions.find((option) => option.className === value)
      setFormData((prev) => ({
        ...prev,
        class: value,
        section: matchedClass?.sections.includes(prev.section)
          ? prev.section
          : matchedClass?.sections.find(
              (section) => normalizeSectionKey(section) === normalizeSectionKey(prev.section)
            ) || matchedClass?.sections[0] || '',
      }))
      setFormErrors((prev) => ({ ...prev, class: '', section: '' }))
      return
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setFormErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validateForm = () => {
    const nextErrors: Record<string, string> = {}

    if (!formData.rollNumber.trim()) nextErrors.rollNumber = 'Enter the admission number.'
    if (!formData.name.trim()) nextErrors.name = 'Enter the student’s name.'
    if (!formData.fatherName.trim()) nextErrors.fatherName = 'Enter the father’s name.'
    if (!formData.motherName.trim()) nextErrors.motherName = 'Enter the mother’s name.'
    if (!formData.guardianPhone.trim()) nextErrors.guardianPhone = 'Enter a phone number for the guardian.'
    if (!/^\d{10}$/.test(formData.guardianPhone.trim())) nextErrors.guardianPhone = 'Guardian’s phone must be 10 digits.'
    if (formData.phone.trim() && !/^\d{10}$/.test(formData.phone.trim())) nextErrors.phone = 'Student’s phone must be 10 digits.'
    if (!formData.dateOfBirth) nextErrors.dateOfBirth = 'Choose the date of birth.'
    if (!formData.admissionDate) nextErrors.admissionDate = 'Choose the admission date.'
    if (!formData.address.street.trim()) nextErrors['address.street'] = 'Enter the street address.'
    if (!formData.address.city.trim()) nextErrors['address.city'] = 'Enter the city.'
    if (!formData.address.state.trim()) nextErrors['address.state'] = 'Enter the state.'
    if (!/^\d{6}$/.test(formData.address.pincode.trim())) nextErrors['address.pincode'] = 'Pincode must be 6 digits.'
    if (formData.aadharNumber.trim() && !/^\d{12}$/.test(formData.aadharNumber.trim())) {
      nextErrors.aadharNumber = 'Aadhaar number must be 12 digits.'
    }
    if (!formData.class.trim()) nextErrors.class = 'Choose a class.'
    if (!formData.section.trim()) nextErrors.section = 'Choose a section.'
    const allowedSections = classSectionOptions.find((option) => option.className === formData.class)?.sections || []
    if (allowedSections.length > 0) {
      const resolvedSection = resolveSectionAgainstAllowed(formData.section, allowedSections)
      if (resolvedSection.error) nextErrors.section = resolvedSection.error
    } else if (formData.class.trim()) {
      nextErrors.section = 'This class has no sections yet. Add them under Classes first.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const resetForm = (options?: { keepMessage?: boolean }) => {
    const nextForm = createInitialFormState()
    if (classSectionOptions.length > 0) {
      nextForm.class = classSectionOptions[0].className
      nextForm.section = classSectionOptions[0].sections[0] || ''
    }
    setFormData(nextForm)
    setFormErrors({})
    setSelectedPhoto(null)
    if (selectedPhotoPreview) {
      URL.revokeObjectURL(selectedPhotoPreview)
      setSelectedPhotoPreview(null)
    }
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
    if (!options?.keepMessage) {
      setPageMessage(null)
    }
    setEditingStudentId(null)
    setIsEditModalOpen(false)
  }

  const uploadStudentProfilePhoto = async (studentId: string, file: File) => {
    const photoFormData = new FormData()
    photoFormData.append('profileImage', file)
    await api.post(`/students/${studentId}/profile-image`, photoFormData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  }

  const refreshStudentData = (targetPage = page) => {
    dispatch(fetchStudentStats({
      ...(classFilter ? { class: classFilter } : {}),
      ...(sectionFilter ? { section: sectionFilter } : {}),
    }))
    dispatch(
      fetchStudents({
        page: targetPage,
        limit: STUDENTS_PAGE_SIZE,
        sort: '-createdAt',
        ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
        ...(classFilter ? { class: classFilter } : {}),
        ...(sectionFilter ? { section: sectionFilter } : {}),
      })
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPageMessage(null)

    if (!validateForm()) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.cb-sheet [aria-invalid="true"]')?.focus()
      })
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        ...formData,
        rollNumber: formData.rollNumber.trim().toUpperCase(),
        name: formData.name.trim(),
        fatherName: formData.fatherName.trim(),
        motherName: formData.motherName.trim(),
        guardianPhone: formData.guardianPhone.trim() || formData.phone.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        penNumber: formData.penNumber.trim(),
        house: formData.house.trim(),
        houseId: formData.houseId.trim() || null,
        busNo: formData.busNo.trim(),
        aadharNumber: formData.aadharNumber.trim(),
        religion: formData.religion.trim(),
        nationality: formData.nationality.trim() || 'Indian',
        notes: formData.notes.trim(),
        address: {
          street: formData.address.street.trim(),
          city: formData.address.city.trim(),
          state: formData.address.state.trim(),
          pincode: formData.address.pincode.trim(),
        },
        medicalInfo: formData.bloodGroup
          ? { bloodGroup: formData.bloodGroup }
          : undefined,
      } as any
      delete payload.bloodGroup
      delete payload.classRollNo
      if (!payload.medicalInfo) {
        delete payload.medicalInfo
      }

      let targetStudentId = editingStudentId || ''
      if (editingStudentId) {
        const updatedResponse = await dispatch(updateStudent({ id: editingStudentId, data: payload })).unwrap()
        targetStudentId = String(updatedResponse?.data?._id || editingStudentId)
      } else {
        const createdResponse = await dispatch(createStudent(payload)).unwrap()
        targetStudentId = String(createdResponse?.data?._id || '')
      }

      if (selectedPhoto && targetStudentId) {
        await uploadStudentProfilePhoto(targetStudentId, selectedPhoto)
      }

      setPageMessage({
        tone: 'success',
        text: editingStudentId
          ? `${payload.name}’s details are saved.`
          : `${payload.name} is added to ${classSectionLabelText(payload.class, payload.section)}.`,
      })
      resetForm({ keepMessage: true })
      refreshStudentData(1)
      setPage(1)
      setShowAddForm(false)
      setIsEditModalOpen(false)
    } catch (error: any) {
      setPageMessage({
        tone: 'error',
        text:
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          (typeof error === 'string' ? error : (editingStudentId ? 'The changes weren’t saved. Try again.' : 'The student wasn’t added. Try again.')),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectPhotoFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPageMessage({ tone: 'error', text: 'Choose an image file (JPEG, PNG or WebP) for the photograph.' })
      return false
    }

    if (file.size > 5 * 1024 * 1024) {
      setPageMessage({ tone: 'error', text: 'Photograph must be 5 MB or smaller.' })
      return false
    }

    if (selectedPhotoPreview) {
      URL.revokeObjectURL(selectedPhotoPreview)
    }

    const nextPreview = URL.createObjectURL(file)
    setSelectedPhoto(file)
    setSelectedPhotoPreview(nextPreview)
    return true
  }

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!selectPhotoFile(file)) {
      event.target.value = ''
    }
  }

  const handlePhotoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsPhotoDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) selectPhotoFile(file)
  }

  const clearSelectedPhoto = () => {
    setSelectedPhoto(null)
    if (selectedPhotoPreview) {
      URL.revokeObjectURL(selectedPhotoPreview)
      setSelectedPhotoPreview(null)
    }
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      setIsTemplateDownloading(true)
      const blob = await studentService.downloadImportTemplate('xlsx')
      const url = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `students_template_${new Date().toISOString().split('T')[0]}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (_error) {
      setPageMessage({ tone: 'error', text: 'The template didn’t download. Try again.' })
    } finally {
      setIsTemplateDownloading(false)
    }
  }

  const handleUploadTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) return

    try {
      setIsTemplateUploading(true)
      const response = await studentService.uploadImportTemplate(selectedFile)
      const result = response?.data ?? {}
      const createdCount = result.created ?? 0
      const skippedCount = result.skipped ?? 0
      const errors = Array.isArray(result.errors) ? result.errors : []
      const warnings = Array.isArray(result.warnings) ? result.warnings : []
      const errorPreview = errors.slice(0, 2).map((entry: any) => `Row ${entry?.row}: ${entry?.message}`).join(' | ')
      setPageMessage({
        tone: errors.length > 0 && createdCount === 0 ? 'error' : 'success',
        text: `Import finished: ${createdCount} added, ${skippedCount} skipped because their admission no. already exists, ${errors.length} with errors, ${warnings.length} with warnings.${errorPreview ? ` ${errorPreview}` : ''}`,
      })
      refreshStudentData(1)
      setPage(1)
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'The file didn’t import. Check it is the filled template and try again.'

      setPageMessage({ tone: 'error', text: message })
    } finally {
      setIsTemplateUploading(false)
    }
  }

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleStudentIds.includes(id)))
      return
    }

    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleStudentIds])))
  }

  const handleToggleSelect = (studentId: string) => {
    setSelectedIds((prev) => (
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    ))
  }

  const openAddForm = () => {
    resetForm({ keepMessage: true })
    setShowAddForm(true)
  }

  const closeForm = () => {
    resetForm({ keepMessage: true })
    setShowAddForm(false)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0 || isBulkDeleting) return

    const idsToDelete = [...selectedIds]
    const total = idsToDelete.length
    bulkDeleteCancelRef.current = false
    setIsBulkDeleting(true)
    let deletedCount = 0
    let failedCount = 0
    let cancelled = false
    let nextIndex = 0

    const renderProgressToast = (
      done: number,
      failed: number,
      options: { complete?: boolean; cancelling?: boolean } = {}
    ) => {
      const { complete = false, cancelling = false } = options
      const processed = done + failed
      const percent = total === 0 ? 0 : Math.round((processed / total) * 100)
      const stoppedEarly = cancelling || (complete && bulkDeleteCancelRef.current)

      toast.custom(
        () => (
          <div className="cb-app cb-toast-host">
            <div className="cb-toast" role="status" style={{ minWidth: 300, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span className="cb-toast__title">
                  {cancelling && !complete
                    ? `Stopping… ${done} of ${total} deleted`
                    : complete
                      ? `${done} of ${total} deleted`
                      : `Deleting ${done} of ${total}`}
                </span>
                {!complete && !cancelling ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => {
                      bulkDeleteCancelRef.current = true
                      renderProgressToast(done, failed, { cancelling: true })
                    }}
                  >
                    Stop deleting
                  </Button>
                ) : null}
              </div>
              <Progress
                value={percent}
                size="sm"
                showValue={false}
                tone={complete ? (stoppedEarly || failed > 0 ? 'warning' : 'success') : 'accent'}
              />
              {failed > 0 ? (
                <span className="cb-toast__desc">{failed} could not be deleted</span>
              ) : null}
            </div>
          </div>
        ),
        {
          id: BULK_DELETE_TOAST_ID,
          duration: complete ? 3500 : Infinity,
        }
      )
    }

    renderProgressToast(0, 0)

    while (nextIndex < idsToDelete.length) {
      if (bulkDeleteCancelRef.current) {
        cancelled = true
        setSelectedIds(idsToDelete.slice(nextIndex))
        break
      }

      const batch = idsToDelete.slice(nextIndex, nextIndex + BULK_DELETE_BATCH_SIZE)
      try {
        const result = await dispatch(bulkDeleteStudents(batch)).unwrap()
        const batchDeleted = Array.isArray(result.deletedIds) ? result.deletedIds.length : 0
        const batchMissing = Array.isArray(result.notFoundIds) ? result.notFoundIds.length : 0
        deletedCount += batchDeleted
        failedCount += batchMissing
        // If API returned fewer results than requested, count remainder as failed.
        const accounted = batchDeleted + batchMissing
        if (accounted < batch.length) {
          failedCount += batch.length - accounted
        }
      } catch (_error) {
        failedCount += batch.length
      }

      nextIndex += batch.length
      const stopping = bulkDeleteCancelRef.current
      renderProgressToast(deletedCount, failedCount, { cancelling: stopping })

      if (stopping) {
        cancelled = true
        setSelectedIds(idsToDelete.slice(nextIndex))
        break
      }
    }

    cancelled = cancelled || bulkDeleteCancelRef.current
    renderProgressToast(deletedCount, failedCount, { complete: true, cancelling: cancelled })
    setIsBulkDeleting(false)

    if (!cancelled) {
      setSelectedIds([])
    }

    refreshStudentData()

    if (cancelled) {
      const remainingCount = total - deletedCount - failedCount
      setPageMessage({
        tone: deletedCount > 0 ? 'success' : 'error',
        text: deletedCount > 0
          ? `Deleting stopped. ${deletedCount} ${deletedCount === 1 ? 'student' : 'students'} deleted${remainingCount > 0 ? `; ${remainingCount} still selected.` : '.'}`
          : 'Deleting stopped before any students were removed.',
      })
      return
    }

    setPageMessage({
      tone: deletedCount > 0 ? 'success' : 'error',
      text: deletedCount > 0
        ? `${deletedCount} ${deletedCount === 1 ? 'student' : 'students'} deleted.`
        : 'None of the selected students could be deleted. Try again.',
    })
  }

  const handleEditStudentRow = (student: any) => {
    setEditingStudentId(student._id)
    setIsEditModalOpen(true)
    setFormData(mapStudentToFormState(student))
    setFormErrors({})
    setShowAddForm(false)
  }

  const handleViewStudentProfile = (student: any) => {
    navigate(`/stdnt/students/${student._id}`)
  }

  const getSectionsForClass = (className: string) => (
    classSectionOptions.find((option) => option.className === className)?.sections || []
  )

  const handleSectionChange = async (studentId: string, className: string, nextSection: string) => {
    const normalizedSection = String(nextSection || '').trim()
    if (!studentId || !normalizedSection) return

    setSectionUpdateLoadingById((prev) => ({ ...prev, [studentId]: true }))
    try {
      await api.put(`/students/${studentId}`, { class: className, section: normalizedSection })
      setSectionOverrideByStudentId((prev) => ({ ...prev, [studentId]: normalizedSection }))
      setPageMessage({ tone: 'success', text: `Section changed to ${sectionLabel(normalizedSection)}.` })
      refreshStudentData(page)
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'The section didn’t change. Try again.'
      setPageMessage({ tone: 'error', text: message })
    } finally {
      setSectionUpdateLoadingById((prev) => {
        const next = { ...prev }
        delete next[studentId]
        return next
      })
      setEditingSectionStudentId(null)
    }
  }

  const isFormOpen = showAddForm || isEditModalOpen
  const hasFilters = Boolean(classFilter || sectionFilter || searchTerm.trim())
  const activeCount = stats?.activeTotal ?? 0
  const totalCount = stats?.total ?? 0
  const fieldError = (field: string) => formErrors[field] || undefined

  const setActive = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, isActive: checked }))
  }

  const selectHouse = (houseId: string) => {
    const house = activityHouses.find((item) => item._id === houseId)
    setFormData((prev) => ({ ...prev, houseId: house?._id || '', house: house?.name || '' }))
    setFormErrors((prev) => {
      if (!prev.house && !prev.houseId) return prev
      const next = { ...prev }
      delete next.house
      delete next.houseId
      return next
    })
  }

  const clearFilters = () => {
    setSearchTerm('')
    setClassFilter('')
    setSectionFilter('')
  }

  const renderHouse = (student: any) => {
    const houseRecord = resolveStudentHouse(student, activityHouses)
    const name = houseRecord?.name || student.house || ''
    const label = getHouseShortName(name)
    if (label === '-') return <span className="cb-subtle">—</span>
    const swatch = normalizeHouseColorKey(houseRecord?.color || '')
    return (
      <span className="stdnt-house" title={name}>
        {swatch ? <span className="stdnt-house__swatch" style={{ background: swatch }} aria-hidden="true" /> : null}
        {label}
      </span>
    )
  }

  const renderClassSection = (student: any) => {
    const className = String(student.class || '')
    const displaySection = sectionOverrideByStudentId[student._id] ?? student.section
    const saving = Boolean(sectionUpdateLoadingById[student._id])

    if (editingSectionStudentId === student._id) {
      const available = getSectionsForClass(className)
      return (
        <span className="stdnt-section-pick" role="group" aria-label={`Choose a section for ${student.name}`}>
          {available.map((sectionName) => {
            const isCurrent = normalizeSectionKey(sectionName) === normalizeSectionKey(String(displaySection || ''))
            return (
              <button
                key={sectionName}
                type="button"
                className={`cb-chip${isCurrent ? ' is-active' : ''}`}
                aria-pressed={isCurrent}
                disabled={saving}
                onClick={() =>
                  isCurrent ? setEditingSectionStudentId(null) : handleSectionChange(student._id, className, sectionName)
                }
              >
                {sectionLabel(sectionName)}
              </button>
            )
          })}
          <Button
            variant="tertiary"
            size="sm"
            icon={X}
            aria-label="Keep the current section"
            onClick={() => setEditingSectionStudentId(null)}
          />
        </span>
      )
    }

    return (
      <span className="stdnt-name">
        <span>{className || '—'}</span>
        <Button
          variant="tertiary"
          size="sm"
          iconRight={ChevronDown}
          loading={saving}
          onClick={() => setEditingSectionStudentId(student._id)}
          aria-label={`Change section for ${student.name}, now ${sectionLabel(displaySection) || 'not set'}`}
        >
          {saving ? 'Saving' : sectionLabel(displaySection) || 'Set section'}
        </Button>
      </span>
    )
  }

  const columns: DataTableColumn<any>[] = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      mobile: 'title',
      render: (student) => (
        <span className="stdnt-name">
          <Avatar name={student.name || 'Student'} src={studentPhotoUrl(student.profileImage)} size="md" />
          <span className="stdnt-name__text">
            <span className="stdnt-name__primary">{student.name || '—'}</span>
            <span className="stdnt-name__secondary is-num">Adm. no. {orDash(student.rollNumber)}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Class and section',
      headerLabel: 'Class and section',
      sortable: true,
      interactive: true,
      mobile: 'subtitle',
      render: renderClassSection,
    },
    {
      key: 'classRollNo',
      header: 'Roll no.',
      sortable: true,
      numeric: true,
      align: 'right',
      render: (student) => orDash(student.classRollNo),
    },
    { key: 'fatherName', header: "Father's name", sortable: true, render: (s) => orDash(s.fatherName) },
    {
      key: 'motherName',
      header: "Mother's name",
      sortable: true,
      mobile: 'hidden',
      render: (s) => orDash(s.motherName),
    },
    {
      key: 'dateOfBirth',
      header: 'Date of birth',
      sortable: true,
      numeric: true,
      render: (s) => formatDate(s.dateOfBirth),
    },
    { key: 'gender', header: 'Gender', sortable: true, render: (s) => normalizeGender(s.gender) },
    { key: 'house', header: 'House', sortable: true, render: renderHouse },
    { key: 'phone', header: 'Mobile', sortable: true, numeric: true, render: (s) => orDash(s.phone || s.guardianPhone) },
    { key: 'busNo', header: 'Bus', sortable: true, mobile: 'hidden', render: (s) => orDash(s.busNo) },
    {
      key: 'bloodGroup',
      header: 'Blood group',
      sortable: true,
      mobile: 'hidden',
      render: (s) => orDash(s?.medicalInfo?.bloodGroup),
    },
    { key: 'category', header: 'Category', sortable: true, mobile: 'hidden', render: (s) => orDash(s.category) },
    { key: 'penNumber', header: 'PEN no.', sortable: true, mobile: 'hidden', render: (s) => orDash(s.penNumber) },
    {
      key: 'address',
      header: 'Address',
      sortable: true,
      mobile: 'hidden',
      render: (s) => {
        const address = formatAddress(s.address)
        return address ? (
          <span className="stdnt-address" title={address}>
            {address}
          </span>
        ) : (
          '—'
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (s) =>
        s.isActive === false ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>,
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      interactive: true,
      mobile: 'hidden',
      width: 48,
      render: (student) => (
        <Menu
          label={`Actions for ${student.name}`}
          items={[
            { label: 'Open profile', icon: UserRound, onSelect: () => handleViewStudentProfile(student) },
            { label: 'Edit details', icon: Pencil, onSelect: () => handleEditStudentRow(student) },
          ]}
        />
      ),
    },
  ]

  const formFooter = (
    <>
      <Button onClick={closeForm} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" loading={isSubmitting}>
        {isSubmitting ? 'Saving' : editingStudentId ? 'Save changes' : 'Add student'}
      </Button>
    </>
  )

  return (
    <Page width="full">
      {pageMessage && !isFormOpen ? (
        <Banner tone={pageMessage.tone === 'success' ? 'success' : 'danger'} onDismiss={() => setPageMessage(null)}>
          {pageMessage.text}
        </Banner>
      ) : null}

      <section className="cb-stats" aria-label="Student totals">
        <StatCard
          label="Students"
          value={formatCount(totalCount)}
          icon={Users}
          hint={`${formatCount(activeCount)} active`}
        />
        <StatCard label="Boys" value={formatCount(boysCount)} hint={`${totalCount ? Math.round((boysCount / totalCount) * 100) : 0}% of students`} />
        <StatCard label="Girls" value={formatCount(girlsCount)} hint={`${totalCount ? Math.round((girlsCount / totalCount) * 100) : 0}% of students`} />
        <StatCard
          label="Classes"
          value={formatCount(totalClasses)}
          icon={LayoutGrid}
          hint={`${formatCount(totalClassSections)} class sections`}
        />
      </section>

      <Card flush className="stdnt-list-card">
        <div className="stdnt-toolbar">
          <FilterBar
            search={{
              placeholder: 'Search name, admission no. or phone',
              value: searchTerm,
              onChange: setSearchTerm,
              label: 'Search students',
            }}
            filters={
              <>
                <Select
                  aria-label="Class"
                  size="sm"
                  value={classFilter}
                  onChange={(event) => {
                    setClassFilter(event.target.value)
                    setSectionFilter('')
                  }}
                  placeholder="All classes"
                  options={classOptions.map((option) => ({ value: option, label: classLabel(option) }))}
                />
                <Select
                  aria-label="Section"
                  size="sm"
                  value={sectionFilter}
                  onChange={(event) => setSectionFilter(event.target.value)}
                  placeholder="All sections"
                  options={filterSectionOptions.map((option) => ({ value: option, label: sectionLabel(option) }))}
                />
                {hasFilters ? (
                  <Button variant="tertiary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </>
            }
            actions={
              <>
                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  aria-label="Upload filled student template"
                  onChange={handleUploadTemplate}
                  hidden
                />
                <Menu
                  align="end"
                  items={[
                    {
                      label: isTemplateDownloading ? 'Downloading template…' : 'Download template',
                      icon: Download,
                      disabled: isTemplateDownloading || isTemplateUploading,
                      onSelect: handleDownloadTemplate,
                    },
                    {
                      label: isTemplateUploading ? 'Importing…' : 'Import filled template',
                      icon: Upload,
                      hint: '.xlsx or .csv',
                      disabled: isTemplateDownloading || isTemplateUploading,
                      onSelect: () => templateInputRef.current?.click(),
                    },
                  ]}
                  trigger={(props) => (
                    <Button
                      size="sm"
                      icon={FileSpreadsheet}
                      iconRight={ChevronDown}
                      loading={isTemplateUploading || isTemplateDownloading}
                      {...props}
                    >
                      Import
                    </Button>
                  )}
                />
                <Button variant="primary" size="sm" icon={UserPlus} onClick={openAddForm}>
                  Add student
                </Button>
              </>
            }
          />
          {selectedCount > 0 ? (
            <div className="stdnt-bulkbar" role="region" aria-label="Bulk actions">
              <span className="is-num">
                {selectedCount} {selectedCount === 1 ? 'student' : 'students'} selected
              </span>
              <span className="stdnt-bulkbar__spacer" />
              <Button variant="tertiary" size="sm" onClick={() => setSelectedIds([])} disabled={isBulkDeleting}>
                Clear selection
              </Button>
              <Button
                size="sm"
                icon={Trash2}
                loading={isBulkDeleting}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                {isBulkDeleting ? 'Deleting' : 'Delete'}
              </Button>
            </div>
          ) : null}
        </div>

        <DataTable
          caption="Students"
          columns={columns}
          rows={sortedStudents as any[]}
          getRowKey={(student) => student._id}
          onRowClick={handleViewStudentProfile}
          loading={loading}
          loadingLabel="Loading students"
          maxHeight="min(720px, calc(100vh - 300px))"
          sort={tableSortField ? { key: tableSortField, direction: tableSortDirection } : null}
          onSort={(key) => handleSort(key as NonNullable<typeof tableSortField>)}
          selection={{
            isSelected: (student) => selectedIds.includes(student._id),
            onToggle: (student) => handleToggleSelect(student._id),
            allSelected: allVisibleSelected,
            someSelected: visibleStudentIds.some((id) => selectedIds.includes(id)),
            onToggleAll: handleToggleSelectAll,
            rowLabel: (student) => `Select ${student.name}`,
          }}
          empty={
            hasFilters ? (
              <EmptyState
                compact
                icon={SearchX}
                title="No students match these filters"
                body="Try another name or admission number, or clear the filters."
                action={
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={Users}
                title="No students added yet"
                body="Add students one at a time, or download the template and import the whole school at once."
                action={
                  <>
                    <Button size="sm" icon={Download} onClick={handleDownloadTemplate} loading={isTemplateDownloading}>
                      Download template
                    </Button>
                    <Button variant="primary" size="sm" icon={UserPlus} onClick={openAddForm}>
                      Add student
                    </Button>
                  </>
                }
              />
            )
          }
          footer={
            pagination.totalItems > 0 ? (
              <>
                <span className="is-num">
                  {formatCount(pagination.totalItems)} students · page {pagination.currentPage} of {pagination.totalPages}
                </span>
                <span className="stdnt-pager">
                  <Button
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    disabled={!pagination.hasPrevPage}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setPage((prev) => (pagination.hasNextPage ? prev + 1 : prev))}
                    disabled={!pagination.hasNextPage}
                  >
                    Next
                  </Button>
                </span>
              </>
            ) : null
          }
        />
      </Card>

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        tone="danger"
        size="sm"
        title={`Delete ${selectedCount} ${selectedCount === 1 ? 'student' : 'students'}?`}
        description="Their records are removed from this session, including class, section and contact details. This can't be undone."
        footer={
          <>
            <Button onClick={() => setConfirmDeleteOpen(false)}>Keep students</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                setConfirmDeleteOpen(false)
                handleBulkDelete()
              }}
            >
              Delete {selectedCount} {selectedCount === 1 ? 'student' : 'students'}
            </Button>
          </>
        }
      />

      <Sheet
        open={isFormOpen}
        onClose={closeForm}
        size="xl"
        title={editingStudentId ? `Edit ${formData.name || 'student'}` : 'Add student'}
        description={
          editingStudentId
            ? 'Changes apply to this session’s record.'
            : 'Fields marked * are required. To add many students, use Import instead.'
        }
        onSubmit={handleSubmit}
        footer={formFooter}
      >
        {pageMessage?.tone === 'error' ? (
          <Banner tone="danger" onDismiss={() => setPageMessage(null)}>
            {pageMessage.text}
          </Banner>
        ) : null}

        <div
          className={`stdnt-photo${isPhotoDragActive ? ' is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsPhotoDragActive(true)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsPhotoDragActive(false)
          }}
          onDrop={handlePhotoDrop}
        >
          <span className="stdnt-photo__preview">
            {selectedPhotoPreview ? <img src={selectedPhotoPreview} alt="Selected photograph" /> : <ImagePlus size={22} strokeWidth={1.75} aria-hidden />}
          </span>
          <span className="stdnt-photo__text">
            <span className="stdnt-photo__title">{selectedPhoto ? selectedPhoto.name : 'Photograph'}</span>
            <span className="stdnt-photo__hint">
              {selectedPhoto
                ? `${Math.max(1, Math.round(selectedPhoto.size / 1024))} KB`
                : 'JPEG, PNG or WebP up to 5 MB. Drag a photo here or choose one.'}
            </span>
          </span>
          <span className="stdnt-photo__actions">
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
            <Button size="sm" icon={Upload} onClick={() => photoInputRef.current?.click()}>
              {selectedPhoto ? 'Change photo' : 'Choose photo'}
            </Button>
            {selectedPhoto ? (
              <Button variant="tertiary" size="sm" onClick={clearSelectedPhoto}>
                Remove
              </Button>
            ) : null}
          </span>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Student</h3>
          <div className="cb-form-grid">
            <TextField
              label="Student name"
              required
              name="name"
              value={formData.name}
              onChange={handleFieldChange}
              error={fieldError('name')}
              autoComplete="off"
              className="is-wide"
            />
            <TextField
              label="Admission no."
              required
              name="rollNumber"
              value={formData.rollNumber}
              onChange={handleFieldChange}
              error={fieldError('rollNumber')}
              placeholder="e.g. 4959"
            />
            <TextField
              label="Roll no."
              value={formData.classRollNo || (editingStudentId ? '—' : '')}
              placeholder="Assigned automatically"
              readOnly
              hint="Set by class and section, in alphabetical order."
            />
            <Select
              label="Class"
              required
              name="class"
              value={formData.class}
              onChange={handleFieldChange}
              disabled={classOptions.length === 0}
              error={fieldError('class')}
              options={
                classOptions.length === 0
                  ? [{ value: '', label: 'No classes set up yet' }]
                  : classOptions.map((option) => ({ value: option, label: classLabel(option) }))
              }
            />
            <Select
              label="Section"
              required
              name="section"
              value={formData.section}
              onChange={handleFieldChange}
              disabled={sectionOptionsForSelectedClass.length === 0}
              error={fieldError('section')}
              options={
                sectionOptionsForSelectedClass.length === 0
                  ? [{ value: '', label: 'No sections for this class' }]
                  : sectionOptionsForSelectedClass.map((option) => ({ value: option, label: sectionLabel(option) }))
              }
            />
            <Select
              label="Gender"
              name="gender"
              value={formData.gender}
              onChange={handleFieldChange}
              options={GENDER_OPTIONS.map((option) => ({
                value: option,
                label: option === 'Unspecified' ? 'Not recorded' : option,
              }))}
            />
            <TextField
              label="Date of birth"
              required
              type="date"
              name="dateOfBirth"
              value={formData.dateOfBirth}
              onChange={handleFieldChange}
              error={fieldError('dateOfBirth')}
            />
            <TextField
              label="Admission date"
              required
              type="date"
              name="admissionDate"
              value={formData.admissionDate}
              onChange={handleFieldChange}
              error={fieldError('admissionDate')}
            />
            <Checkbox
              className="is-wide"
              label="Active student"
              description="Inactive students stay on record but are left out of class lists and counts of active students."
              checked={formData.isActive}
              onChange={setActive}
            />
          </div>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Family and contact</h3>
          <div className="cb-form-grid">
            <TextField
              label="Father's name"
              required
              name="fatherName"
              value={formData.fatherName}
              onChange={handleFieldChange}
              error={fieldError('fatherName')}
            />
            <TextField
              label="Mother's name"
              required
              name="motherName"
              value={formData.motherName}
              onChange={handleFieldChange}
              error={fieldError('motherName')}
            />
            <TextField
              label="Guardian's phone"
              required
              name="guardianPhone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={formData.guardianPhone}
              onChange={handleFieldChange}
              error={fieldError('guardianPhone')}
              hint="10 digits"
            />
            <TextField
              label="Student's phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={formData.phone}
              onChange={handleFieldChange}
              error={fieldError('phone')}
            />
            <TextField
              label="Email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleFieldChange}
              className="is-wide"
            />
          </div>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Address</h3>
          <div className="cb-form-grid">
            <TextField
              label="Street address"
              required
              name="address.street"
              value={formData.address.street}
              onChange={handleFieldChange}
              error={fieldError('address.street')}
              className="is-wide"
            />
            <TextField
              label="City"
              required
              name="address.city"
              value={formData.address.city}
              onChange={handleFieldChange}
              error={fieldError('address.city')}
            />
            <TextField
              label="State"
              required
              name="address.state"
              value={formData.address.state}
              onChange={handleFieldChange}
              error={fieldError('address.state')}
            />
            <TextField
              label="Pincode"
              required
              name="address.pincode"
              inputMode="numeric"
              maxLength={6}
              value={formData.address.pincode}
              onChange={handleFieldChange}
              error={fieldError('address.pincode')}
            />
          </div>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Other details</h3>
          <div className="cb-form-grid">
            <div className="cb-field is-wide" role="group" aria-labelledby="stdnt-house-label">
              <span id="stdnt-house-label" className="cb-field__label">
                House
              </span>
              {activityHouses.length === 0 ? (
                <span className="cb-field__hint">No houses yet. Add them under Activities, then pick one here.</span>
              ) : (
                <span className="stdnt-houses">
                  {[{ _id: '', name: 'No house', color: undefined as string | undefined }, ...activityHouses].map((house) => {
                    const on = formData.houseId === house._id
                    const swatch = normalizeHouseColorKey(house.color || '')
                    return (
                      <button
                        key={house._id || 'none'}
                        type="button"
                        className={`cb-chip${on ? ' is-active' : ''}`}
                        aria-pressed={on}
                        onClick={() => selectHouse(house._id)}
                        title={house.name}
                      >
                        {swatch ? <span className="stdnt-house__swatch" style={{ background: swatch }} aria-hidden="true" /> : null}
                        {house._id ? getHouseShortName(house.name) : house.name}
                      </button>
                    )
                  })}
                </span>
              )}
              {fieldError('house') ? <span className="cb-field__error">{fieldError('house')}</span> : null}
            </div>
            <Select
              label="Category"
              name="category"
              value={formData.category}
              onChange={handleFieldChange}
              options={[...CATEGORY_OPTIONS]}
            />
            <Select
              label="Blood group"
              name="bloodGroup"
              value={formData.bloodGroup}
              onChange={handleFieldChange}
              placeholder="Not recorded"
              options={[...BLOOD_GROUP_OPTIONS]}
            />
            <TextField label="Bus no." name="busNo" value={formData.busNo} onChange={handleFieldChange} placeholder="e.g. 12" />
            <TextField label="PEN no." name="penNumber" value={formData.penNumber} onChange={handleFieldChange} />
            <TextField
              label="Aadhaar number"
              name="aadharNumber"
              inputMode="numeric"
              maxLength={12}
              value={formData.aadharNumber}
              onChange={handleFieldChange}
              error={fieldError('aadharNumber')}
              hint="12 digits"
            />
            <TextField label="Religion" name="religion" value={formData.religion} onChange={handleFieldChange} />
            <TextField label="Nationality" name="nationality" value={formData.nationality} onChange={handleFieldChange} />
            <TextArea
              label="Notes"
              name="notes"
              rows={3}
              value={formData.notes}
              onChange={handleFieldChange}
              placeholder="Anything the office should know about this student."
              className="is-wide"
            />
          </div>
        </div>
      </Sheet>
    </Page>
  )
}

export default Students
