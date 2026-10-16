import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import api from '../../services/api'
import studentService from '../../services/studentService'

// Types
export interface Student {
  _id: string
  rollNumber: string
  classRollNo?: number | null
  name: string
  gender?: 'Boy' | 'Girl' | 'Other' | 'Unspecified'
  email?: string
  phone?: string
  penNumber?: string
  house?: string
  houseId?: string | null
  busNo?: string
  class: string
  section: string
  subjects: Array<{
    _id: string
    name: string
    code: string
    type: string
  }>
  fatherName: string
  motherName: string
  guardianPhone: string
  address: {
    street: string
    city: string
    state: string
    pincode: string
  }
  dateOfBirth: string
  admissionDate: string
  aadharNumber?: string
  category: string
  religion?: string
  nationality?: string
  previousSchool?: {
    name?: string
    board?: string
    passingYear?: number
    percentage?: number
  }
  medicalInfo?: {
    bloodGroup?: string
    allergies?: string[]
    medications?: string[]
    specialNeeds?: string
  }
  isActive: boolean
  profileImage?: string
  documents?: Array<{
    _id: string
    type: string
    filename: string
    originalName: string
    path: string
    uploadedAt: string
  }>
  notes?: string
  age?: number
  fullAddress?: string
  classSection?: string
  displayName?: string
  createdAt: string
  updatedAt: string
}

export interface FetchStudentsParams {
  page?: number
  limit?: number
  search?: string
  class?: string
  section?: string
  subject?: string
  category?: string
  isActive?: boolean
  sort?: string
}

export interface StudentStats {
  total: number
  activeTotal: number
  byClass: Array<{
    _id: string
    count: number
    active: number
  }>
  byClassSection: Array<{
    _id: { class: string; section: string }
    count: number
    active: number
    boys: number
    girls: number
  }>
  byGender: Array<{
    _id: string
    count: number
    active: number
  }>
  ageMatrix: Array<{
    _id: { class: string; age: number }
    count: number
  }>
  lastUpdated: string
}

export interface Pagination {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

interface StudentState {
  students: Student[]
  currentStudent: Student | null
  stats: StudentStats | null
  loading: boolean
  error: string | null
  pagination: Pagination
  modals: {
    add: boolean
    edit: boolean
    delete: boolean
    view: boolean
  }
}

const initialState: StudentState = {
  students: [],
  currentStudent: null,
  stats: null,
  loading: false,
  error: null,
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
    hasNextPage: false,
    hasPrevPage: false,
  },
  modals: {
    add: false,
    edit: false,
    delete: false,
    view: false,
  },
}

// Async thunks
export const fetchStudents = createAsyncThunk(
  'students/fetchStudents',
  async (params: FetchStudentsParams = {}, { rejectWithValue }) => {
    try {
      const response = await api.get('/students', { params })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch students')
    }
  }
)

export const fetchStudent = createAsyncThunk(
  'students/fetchStudent',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await api.get(`/students/${id}`)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch student')
    }
  }
)

export const createStudent = createAsyncThunk(
  'students/createStudent',
  async (studentData: Partial<Student>, { rejectWithValue }) => {
    try {
      const response = await api.post('/students', studentData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create student')
    }
  }
)

export const updateStudent = createAsyncThunk(
  'students/updateStudent',
  async ({ id, data }: { id: string; data: Partial<Student> }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/students/${id}`, data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update student')
    }
  }
)

export const deleteStudent = createAsyncThunk(
  'students/deleteStudent',
  async (payload: string | { id: string; silent?: boolean }, { rejectWithValue }) => {
    const id = typeof payload === 'string' ? payload : payload.id
    const silent = typeof payload === 'object' && payload.silent === true
    try {
      await api.delete(`/students/${id}`, { _silent: silent } as any)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete student')
    }
  }
)

export const bulkDeleteStudents = createAsyncThunk(
  'students/bulkDeleteStudents',
  async (ids: string[], { rejectWithValue }) => {
    try {
      const response = await studentService.bulkDeleteStudents(ids)
      return {
        deletedIds: (response?.data?.deletedIds || []) as string[],
        notFoundIds: (response?.data?.notFoundIds || []) as string[],
        deletedCount: Number(response?.data?.deletedCount || 0),
        message: response?.message as string | undefined,
      }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete selected students')
    }
  }
)

export const fetchStudentsByClass = createAsyncThunk(
  'students/fetchStudentsByClass',
  async ({ className, section }: { className: string; section?: string }, { rejectWithValue }) => {
    try {
      const params = section ? { section } : {}
      const response = await api.get(`/students/class/${className}`, { params })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch students by class')
    }
  }
)

export const fetchStudentsBySubject = createAsyncThunk(
  'students/fetchStudentsBySubject',
  async (subjectId: string, { rejectWithValue }) => {
    try {
      const response = await api.get(`/students/subject/${subjectId}`)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch students by subject')
    }
  }
)

export const assignSubjects = createAsyncThunk(
  'students/assignSubjects',
  async ({ id, subjectIds }: { id: string; subjectIds: string[] }, { rejectWithValue }) => {
    try {
      const response = await api.post(`/students/${id}/subjects`, { subjectIds })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to assign subjects')
    }
  }
)

export const removeSubjects = createAsyncThunk(
  'students/removeSubjects',
  async ({ id, subjectIds }: { id: string; subjectIds: string[] }, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/students/${id}/subjects`, { data: { subjectIds } })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to remove subjects')
    }
  }
)

export const fetchStudentStats = createAsyncThunk(
  'students/fetchStudentStats',
  async (params: { class?: string; section?: string } | undefined, { rejectWithValue }) => {
    try {
      const response = await api.get('/students/stats', {
        params: {
          ...(params?.class ? { class: params.class } : {}),
          ...(params?.section ? { section: params.section } : {}),
        },
      })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch student statistics')
    }
  }
)

export const getNextRollNumber = createAsyncThunk(
  'students/getNextRollNumber',
  async ({ className, section }: { className: string; section: string }, { rejectWithValue }) => {
    try {
      const response = await api.get('/students/next-roll-number', {
        params: { class: className, section }
      })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to generate roll number')
    }
  }
)

export const bulkCreateStudents = createAsyncThunk(
  'students/bulkCreateStudents',
  async (students: Partial<Student>[], { rejectWithValue }) => {
    try {
      const response = await api.post('/students/bulk', { students })
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk create students')
    }
  }
)

const studentSlice = createSlice({
  name: 'students',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setCurrentStudent: (state, action: PayloadAction<Student | null>) => {
      state.currentStudent = action.payload
    },
    showAddStudentModal: (state) => {
      state.modals.add = true
      state.currentStudent = null
    },
    hideAddStudentModal: (state) => {
      state.modals.add = false
      state.currentStudent = null
    },
    showEditStudentModal: (state, action: PayloadAction<Student>) => {
      state.modals.edit = true
      state.currentStudent = action.payload
    },
    hideEditStudentModal: (state) => {
      state.modals.edit = false
      state.currentStudent = null
    },
    showDeleteStudentModal: (state, action: PayloadAction<Student>) => {
      state.modals.delete = true
      state.currentStudent = action.payload
    },
    hideDeleteStudentModal: (state) => {
      state.modals.delete = false
      state.currentStudent = null
    },
    showViewStudentModal: (state, action: PayloadAction<Student>) => {
      state.modals.view = true
      state.currentStudent = action.payload
    },
    hideViewStudentModal: (state) => {
      state.modals.view = false
      state.currentStudent = null
    },
  },
  extraReducers: (builder) => {
    // Fetch students
    builder
      .addCase(fetchStudents.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchStudents.fulfilled, (state, action) => {
        state.loading = false
        state.students = action.payload.data.students || []
        const rawPagination = action.payload.data.pagination || {}
        const nestedPagination =
          rawPagination.pagination && typeof rawPagination.pagination === 'object'
            ? rawPagination.pagination
            : rawPagination
        state.pagination = {
          currentPage: Number(nestedPagination.currentPage) || 1,
          totalPages: Number(nestedPagination.totalPages) || 1,
          totalItems: Number(nestedPagination.totalItems ?? nestedPagination.totalCount) || 0,
          itemsPerPage: Number(nestedPagination.itemsPerPage ?? nestedPagination.limit) || 10,
          hasNextPage: Boolean(nestedPagination.hasNextPage),
          hasPrevPage: Boolean(nestedPagination.hasPrevPage),
        }
      })
      .addCase(fetchStudents.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Fetch single student
    builder
      .addCase(fetchStudent.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchStudent.fulfilled, (state, action) => {
        state.loading = false
        state.currentStudent = action.payload.data
      })
      .addCase(fetchStudent.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Create student
    builder
      .addCase(createStudent.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createStudent.fulfilled, (state, action) => {
        state.loading = false
        state.students.unshift(action.payload.data)
        state.modals.add = false
        state.currentStudent = null
      })
      .addCase(createStudent.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Update student
    builder
      .addCase(updateStudent.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateStudent.fulfilled, (state, action) => {
        state.loading = false
        const index = state.students.findIndex(s => s._id === action.payload.data._id)
        if (index !== -1) {
          state.students[index] = action.payload.data
        }
        state.modals.edit = false
        state.currentStudent = null
      })
      .addCase(updateStudent.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Delete student
    builder
      .addCase(deleteStudent.pending, (state) => {
        state.error = null
      })
      .addCase(deleteStudent.fulfilled, (state, action) => {
        state.loading = false
        state.students = state.students.filter(s => s._id !== action.payload)
        state.modals.delete = false
        state.currentStudent = null
      })
      .addCase(deleteStudent.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    builder
      .addCase(bulkDeleteStudents.fulfilled, (state, action) => {
        const deletedIdSet = new Set(action.payload.deletedIds || [])
        if (deletedIdSet.size === 0) return
        state.students = state.students.filter((student) => !deletedIdSet.has(student._id))
        if (state.currentStudent && deletedIdSet.has(state.currentStudent._id)) {
          state.currentStudent = null
          state.modals.delete = false
        }
      })
      .addCase(bulkDeleteStudents.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Fetch students by class
    builder
      .addCase(fetchStudentsByClass.fulfilled, (state, action) => {
        state.students = action.payload.data
      })

    // Fetch students by subject
    builder
      .addCase(fetchStudentsBySubject.fulfilled, (state, action) => {
        state.students = action.payload.data
      })

    // Assign subjects
    builder
      .addCase(assignSubjects.fulfilled, (state, action) => {
        const index = state.students.findIndex(s => s._id === action.payload.data._id)
        if (index !== -1) {
          state.students[index] = action.payload.data
        }
        if (state.currentStudent && state.currentStudent._id === action.payload.data._id) {
          state.currentStudent = action.payload.data
        }
      })

    // Remove subjects
    builder
      .addCase(removeSubjects.fulfilled, (state, action) => {
        const index = state.students.findIndex(s => s._id === action.payload.data._id)
        if (index !== -1) {
          state.students[index] = action.payload.data
        }
        if (state.currentStudent && state.currentStudent._id === action.payload.data._id) {
          state.currentStudent = action.payload.data
        }
      })

    // Fetch student stats
    builder
      .addCase(fetchStudentStats.fulfilled, (state, action) => {
        state.stats = action.payload.data
      })

    // Bulk create students
    builder
      .addCase(bulkCreateStudents.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkCreateStudents.fulfilled, (state, action) => {
        state.loading = false
        // Add successful students to the list
        if (action.payload.data.successful) {
          state.students.unshift(...action.payload.data.successful)
        }
      })
      .addCase(bulkCreateStudents.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
})

export const {
  clearError,
  setCurrentStudent,
  showAddStudentModal,
  hideAddStudentModal,
  showEditStudentModal,
  hideEditStudentModal,
  showDeleteStudentModal,
  hideDeleteStudentModal,
  showViewStudentModal,
  hideViewStudentModal,
} = studentSlice.actions

export default studentSlice.reducer
