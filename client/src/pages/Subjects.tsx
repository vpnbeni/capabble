import React, { useState, useMemo, useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { useUrlSearchQuery } from '@/hooks/useUrlSearchQuery'
import SubjectsImportModal from '../components/subjects/ImportModal'
import { Tabs } from '../components/common/Tabs'
import { Dropdown } from '../components/common/Dropdown'
import {
  useSubjectList,
  useSubjectStats,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useImportSubjectsMutation,
} from '../hooks/useSubjects'

type SubjectTabId = 'all' | '10th' | '12th'

interface Subject {
  _id: string
  name: string
  code: string
  class: string
  duration: number
  isActive: boolean
  answerSheet?: string
}

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 9999, label: 'All' },
]

const SEARCH_DEBOUNCE_MS = 300

const Subjects: React.FC = () => {
  const initialSearch = useUrlSearchQuery((value) => setSearchInput(value))
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearch)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'name' | 'code' | 'duration' | 'answerSheet' | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [classFilter, setClassFilter] = useState<SubjectTabId>('all')

  // Debounce search: update API param after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm((prev) => {
        if (prev !== searchInput) setPage(1)
        return searchInput
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const queryParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
      ...(classFilter !== 'all' && { class: classFilter }),
      ...(sortField && sortOrder && { sortField, sortOrder }),
    }),
    [page, pageSize, debouncedSearchTerm, classFilter, sortField, sortOrder]
  )

  const { data, isLoading: loading, refetch } = useSubjectList(queryParams)
  const { data: stats = { total: 0, class10th: 0, class12th: 0 } } = useSubjectStats()

  const createMutation = useCreateSubjectMutation()
  const updateMutation = useUpdateSubjectMutation()
  const importMutation = useImportSubjectsMutation()

  const subjects = data?.data ?? []
  const pagination = useMemo(
    () => ({
      page: data?.page ?? 1,
      pages: data?.pages ?? 1,
      total: data?.total ?? 0,
      limit: data?.limit ?? pageSize,
    }),
    [data, pageSize]
  )

  const handlePageSizeChange = (value: string | number | (string | number)[]) => {
    const newSize = Number(Array.isArray(value) ? value[0] : value)
    setPageSize(newSize)
    setPage(1)
  }

  const sortedSubjects = subjects

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleTabChange = (id: SubjectTabId) => {
    setClassFilter(id)
    setPage(1)
  }

  const handleSort = (field: 'name' | 'code' | 'duration' | 'answerSheet') => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else if (sortOrder === 'desc') {
        setSortField(null)
        setSortOrder(null)
      }
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const handleEditClick = (subject: Subject) => {
    setEditingSubject(subject)
    setIsEditModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsEditModalOpen(false)
    setIsAddModalOpen(false)
    setEditingSubject(null)
    setError(null) // Clear errors when closing modal
  }

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const handleUpdateSubject = async (updatedSubject: Partial<Subject>) => {
    if (!editingSubject) return
    setError(null)
    updateMutation.mutate(
      { id: editingSubject._id, data: updatedSubject },
      {
        onSuccess: () => {
          showSuccess('Subject updated successfully!')
          handleCloseModal()
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to update subject'
          if (err?.response?.status === 409) setError('Subject code already exists')
          else if (err?.response?.status === 400) setError('Invalid data provided')
          else if (err?.response?.status === 404) setError('Subject not found')
          else setError(msg)
        },
      }
    )
  }

  const handleCreateSubject = async (newSubject: Partial<Subject>) => {
    setError(null)
    createMutation.mutate(newSubject, {
      onSuccess: () => {
        showSuccess('Subject created successfully!')
        handleCloseModal()
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to create subject'
        if (err?.response?.status === 409) setError('Subject code already exists')
        else if (err?.response?.status === 400) setError('Invalid data provided')
        else setError(msg)
      },
    })
  }

  const handleImportSubjects = async (file: File) => {
    setError(null)
    importMutation.mutate(file, {
      onSuccess: () => {
        setShowImportModal(false)
        showSuccess('Subjects imported successfully!')
      },
      onError: (err: any) => {
        setError(err?.response?.data?.message ?? err?.message ?? 'Failed to import subjects')
      },
    })
  }

  return (
    <div className="subj-page">
      <style>{`
        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-page {
          padding: 32px 32px 48px;
          max-width: 1600px;
          margin: 0 auto;
          min-height: 100vh;
          background: rgba(249, 250, 251, 0.5);
        }

        .dark .subj-page {
          background: #111827;
        }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Success toast â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-toast {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-size: 0.88rem;
          font-weight: 600;
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          color: #065f46;
          border: 1px solid #a7f3d0;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
          animation: subj-slideDown 0.3s ease;
        }
        @keyframes subj-slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .subj-toast svg { width: 20px; height: 20px; flex-shrink: 0; color: #10b981; }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Stat cards â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-stats {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          margin-bottom: 32px;
        }
        @media (min-width: 768px) {
          .subj-stats { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .subj-stats { grid-template-columns: repeat(3, 1fr); }
        }
        .subj-stat {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          transition: all 0.25s ease;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .dark .subj-stat {
          background: #1e293b;
          border-color: #334155;
        }
        .subj-stat:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .subj-stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .subj-stat-icon svg { width: 24px; height: 24px; color: #fff; }
        .subj-stat-total { border-left: 4px solid #6366f1; }
        .subj-stat-total .subj-stat-icon { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        .subj-stat-10th { border-left: 4px solid #10b981; }
        .subj-stat-10th .subj-stat-icon { background: linear-gradient(135deg, #10b981, #059669); }
        .subj-stat-12th { border-left: 4px solid #8b5cf6; }
        .subj-stat-12th .subj-stat-icon { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
        .subj-stat-value {
          font-size: 1.6rem;
          font-weight: 800;
          line-height: 1.2;
          color: #1e293b;
        }
        .dark .subj-stat-value { color: #f1f5f9; }
        .subj-stat-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 2px;
        }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-search-wrap {
          margin-bottom: 20px;
          position: relative;
          max-width: 288px;
        }
        .subj-toolbar .subj-search-wrap {
          margin-bottom: 0;
          margin-left: auto;
        }
        .subj-search {
          width: 100%;
          padding: 8px 36px 8px 36px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 0.875rem;
          background: #fff;
          color: #334155;
          outline: none;
          transition: all 0.15s ease;
        }
        .dark .subj-search {
          background: #1e293b;
          border-color: #475569;
          color: #e2e8f0;
        }
        .subj-search:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
        }
        .subj-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          color: #94a3b8;
          pointer-events: none;
        }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-card {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 6px 24px rgba(0,0,0,0.04);
          overflow: hidden;
          border: 1px solid #e5e7eb;
          transition: box-shadow 0.3s ease;
        }
        .dark .subj-card {
          background: #1e293b;
          border-color: #334155;
        }
        .subj-card:hover {
          box-shadow: 0 2px 6px rgba(0,0,0,0.08), 0 10px 36px rgba(0,0,0,0.06);
        }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Toolbar (tabs + buttons) â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 16px;
          background: rgba(249, 250, 251, 0.5);
          border-bottom: 1px solid #e5e7eb;
          flex-wrap: wrap;
        }
        .dark .subj-toolbar {
          background: rgba(17, 24, 39, 0.5);
          border-color: #374151;
        }

        /* Action buttons */
        .subj-actions {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .subj-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 18px;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .subj-btn svg { width: 16px; height: 16px; }
        .subj-btn-outline {
          background: #fff;
          color: #6366f1;
          border: 1.5px solid #c7d2fe;
          box-shadow: 0 1px 3px rgba(99, 102, 241, 0.08);
        }
        .dark .subj-btn-outline {
          background: #334155;
          color: #a5b4fc;
          border-color: #4f46e5;
        }
        .subj-btn-outline:hover {
          background: #eef2ff;
          border-color: #a5b4fc;
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(99, 102, 241, 0.15);
        }
        .subj-btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: #fff;
          box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
        }
        .subj-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(99, 102, 241, 0.45);
        }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Table â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-table-wrap { overflow-x: auto; }
        .subj-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
        }
        .subj-table thead th {
          padding: 16px 24px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          background: rgba(249, 250, 251, 0.5);
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
          white-space: nowrap;
        }
        .dark .subj-table thead th {
          background: rgba(17, 24, 39, 0.5);
          color: #9ca3af;
          border-color: #374151;
        }
        .subj-table thead th .subj-sort-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: inherit;
          font: inherit;
          text-transform: inherit;
          letter-spacing: inherit;
          cursor: pointer;
          padding: 0;
          transition: color 0.15s;
        }
        .subj-table thead th .subj-sort-btn:hover {
          color: #334155;
        }
        .dark .subj-table thead th .subj-sort-btn:hover {
          color: #e2e8f0;
        }
        .subj-sort-arrows {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .subj-sort-arrows svg { width: 10px; height: 10px; }
        .subj-sort-arrows svg.active-sort { color: #6366f1; }
        .subj-sort-arrows svg.inactive-sort { color: #cbd5e1; }
        .dark .subj-sort-arrows svg.inactive-sort { color: #475569; }

        /* Table body */
        .subj-table tbody tr {
          transition: background 0.15s ease;
        }
        .subj-table tbody td {
          padding: 16px 24px;
          font-size: 0.875rem;
          color: #334155;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        .dark .subj-table tbody td {
          color: #e2e8f0;
          border-color: #374151;
        }

        /* Class-based row colors */
        .subj-row-10th {
          background: linear-gradient(90deg, #ecfdf5 0%, #f0fdf4 100%);
        }
        .subj-row-10th:hover {
          background: linear-gradient(90deg, #dcfce7 0%, #d1fae5 100%) !important;
        }
        .subj-row-12th {
          background: linear-gradient(90deg, #faf5ff 0%, #f5f3ff 100%);
        }
        .subj-row-12th:hover {
          background: linear-gradient(90deg, #f3e8ff 0%, #ede9fe 100%) !important;
        }
        .dark .subj-row-10th {
          background: linear-gradient(90deg, #064e3b15 0%, #065f4615 100%);
        }
        .dark .subj-row-10th:hover {
          background: linear-gradient(90deg, #064e3b30 0%, #065f4630 100%) !important;
        }
        .dark .subj-row-12th {
          background: linear-gradient(90deg, #4c1d9515 0%, #5b21b615 100%);
        }
        .dark .subj-row-12th:hover {
          background: linear-gradient(90deg, #4c1d9530 0%, #5b21b630 100%) !important;
        }
        .subj-table tbody tr:not(.subj-row-10th):not(.subj-row-12th):hover {
          background: #f1f5f9;
        }
        .dark .subj-table tbody tr:not(.subj-row-10th):not(.subj-row-12th):hover {
          background: #283548;
        }

        /* Code badge */
        .subj-code {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 700;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          letter-spacing: 0.02em;
        }
        .subj-code-10th { background: #d1fae5; color: #065f46; }
        .subj-code-12th { background: #ede9fe; color: #5b21b6; }
        .subj-code-default { background: #f1f5f9; color: #475569; }
        .dark .subj-code-10th { background: #065f4640; color: #6ee7b7; }
        .dark .subj-code-12th { background: #5b21b640; color: #c4b5fd; }
        .dark .subj-code-default { background: #33415540; color: #94a3b8; }

        /* Subject name */
        .subj-name {
          font-weight: 600;
          font-size: 0.88rem;
        }
        .subj-name-10th { color: #065f46; }
        .subj-name-12th { color: #5b21b6; }
        .subj-name-default { color: #1e293b; }
        .dark .subj-name-10th { color: #6ee7b7; }
        .dark .subj-name-12th { color: #c4b5fd; }
        .dark .subj-name-default { color: #f1f5f9; }

        /* Class badge */
        .subj-class-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
        }
        .subj-class-10th { background: #d1fae5; color: #059669; }
        .subj-class-12th { background: #ede9fe; color: #7c3aed; }
        .dark .subj-class-10th { background: #065f4640; color: #34d399; }
        .dark .subj-class-12th { background: #5b21b640; color: #a78bfa; }

        /* Duration & answer sheet */
        .subj-meta {
          font-size: 0.85rem;
          color: #475569;
          font-weight: 500;
        }
        .subj-meta-10th { color: #047857; }
        .subj-meta-12th { color: #6d28d9; }
        .dark .subj-meta { color: #94a3b8; }
        .dark .subj-meta-10th { color: #34d399; }
        .dark .subj-meta-12th { color: #a78bfa; }

        /* Answer sheet pill */
        .subj-answer {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .subj-answer-10th { background: #ecfdf580; color: #047857; }
        .subj-answer-12th { background: #f5f3ff80; color: #6d28d9; }
        .subj-answer-default { background: #f1f5f9; color: #64748b; }
        .dark .subj-answer-10th { background: #065f4630; color: #34d399; }
        .dark .subj-answer-12th { background: #5b21b630; color: #a78bfa; }
        .dark .subj-answer-default { background: #33415540; color: #94a3b8; }

        /* Edit button */
        .subj-edit-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          background: transparent;
        }
        .subj-edit-10th { color: #059669; }
        .subj-edit-10th:hover { background: #d1fae580; color: #047857; }
        .subj-edit-12th { color: #7c3aed; }
        .subj-edit-12th:hover { background: #ede9fe80; color: #6d28d9; }
        .subj-edit-default { color: #6366f1; }
        .subj-edit-default:hover { background: #eef2ff; color: #4f46e5; }
        .dark .subj-edit-10th { color: #34d399; }
        .dark .subj-edit-10th:hover { background: #065f4630; }
        .dark .subj-edit-12th { color: #a78bfa; }
        .dark .subj-edit-12th:hover { background: #5b21b630; }
        .dark .subj-edit-default { color: #818cf8; }
        .dark .subj-edit-default:hover { background: #312e8130; }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Loading / Empty â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-empty {
          padding: 48px 24px;
          text-align: center;
        }
        .subj-empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 16px;
          background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .subj-empty-icon svg { width: 32px; height: 32px; color: #94a3b8; }
        .subj-empty h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #334155;
          margin: 0 0 6px;
        }
        .subj-empty p {
          color: #94a3b8;
          font-size: 0.88rem;
          margin: 0 0 20px;
        }
        .subj-empty-loading-msg { color: #94a3b8; font-size: 0.88rem; margin: 0; }
        .subj-empty-icon-error { background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); }
        .subj-empty-icon-error svg { color: #ef4444; }
        .subj-empty-error-msg { color: #ef4444; font-weight: 600; }
        .subj-empty-retry { margin: 0 auto; }
        .subj-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e2e8f0;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: subj-spin 0.7s linear infinite;
          margin: 0 auto 12px;
        }
        @keyframes subj-spin {
          to { transform: rotate(360deg); }
        }

        /* â”€â”€â”€â”€â”€â”€â”€â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
        .subj-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 24px;
          border-top: 1px solid #e8ecf1;
          flex-wrap: wrap;
          background: #fafbfd;
        }
        .dark .subj-pagination {
          border-color: #334155;
          background: #1a2536;
        }
        .subj-pagination-info {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .subj-pagination-text {
          font-size: 0.82rem;
          color: #64748b;
        }
        .subj-pagination-text strong {
          color: #334155;
          font-weight: 700;
        }
        .dark .subj-pagination-text { color: #94a3b8; }
        .dark .subj-pagination-text strong { color: #e2e8f0; }

        .subj-page-nav {
          display: flex;
          align-items: center;
          gap: 0;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          border: 1px solid #e2e8f0;
        }
        .dark .subj-page-nav { border-color: #475569; }
        .subj-page-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 14px;
          font-size: 0.82rem;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
          background: #fff;
          color: #475569;
          min-width: 38px;
          border-right: 1px solid #e2e8f0;
        }
        .dark .subj-page-btn {
          background: #1e293b;
          color: #94a3b8;
          border-color: #334155;
        }
        .subj-page-btn:last-child { border-right: none; }
        .subj-page-btn:hover:not(:disabled):not(.subj-page-active) {
          background: #f1f5f9;
          color: #334155;
        }
        .dark .subj-page-btn:hover:not(:disabled):not(.subj-page-active) {
          background: #283548;
          color: #e2e8f0;
        }
        .subj-page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .subj-page-btn svg { width: 16px; height: 16px; }
        .subj-page-active {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
          color: #fff !important;
          font-weight: 700;
        }

        .subj-per-page {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          color: #64748b;
        }
        .dark .subj-per-page { color: #94a3b8; }
      `}</style>

      {successMessage && (
        <div className="subj-toast">
          <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* ───── Stat Cards ───── */}
      <div className="subj-stats">
        <div className="subj-stat subj-stat-total">
          <div className="subj-stat-icon">
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
          <div>
            <div className="subj-stat-value">{stats.total}</div>
            <div className="subj-stat-label">Total Subjects</div>
          </div>
        </div>
        <div className="subj-stat subj-stat-10th">
          <div className="subj-stat-icon">
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
          <div>
            <div className="subj-stat-value">{stats.class10th}</div>
            <div className="subj-stat-label">Class 10th</div>
          </div>
        </div>
        <div className="subj-stat subj-stat-12th">
          <div className="subj-stat-icon">
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
              />
            </svg>
          </div>
          <div>
            <div className="subj-stat-value">{stats.class12th}</div>
            <div className="subj-stat-label">Class 12th</div>
          </div>
        </div>
      </div>

      {/* ───── Table Card ───── */}
      <div className="subj-card">
        {/* Toolbar */}
        <div className="subj-toolbar">
          <Tabs<SubjectTabId>
            tabs={[
              { id: 'all', label: 'Total Subjects', color: 'blue' },
              { id: '10th', label: 'Class 10th', color: 'emerald' },
              { id: '12th', label: 'Class 12th', color: 'purple' }
            ]}
            activeTab={classFilter}
            onChange={handleTabChange}
            variant="pill"
            size="sm"
            ariaLabel="Subject views"
          />

          <div className="subj-search-wrap">
            <svg className="subj-search-icon" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search subjects..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="subj-search"
            />
          </div>
        </div>

        {/* Table */}
        <div className="subj-table-wrap">
          <table className="subj-table">
            <thead>
              <tr>
                <th>
                  <button onClick={() => handleSort('code')} className="subj-sort-btn">
                    <span>Sub Code</span>
                    <div className="subj-sort-arrows">
                      <svg className={sortField === 'code' && sortOrder === 'asc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                      <svg className={sortField === 'code' && sortOrder === 'desc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('name')} className="subj-sort-btn">
                    <span>Subject Name</span>
                    <div className="subj-sort-arrows">
                      <svg className={sortField === 'name' && sortOrder === 'asc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                      <svg className={sortField === 'name' && sortOrder === 'desc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                  </button>
                </th>
                <th>Class</th>
                <th>
                  <button onClick={() => handleSort('duration')} className="subj-sort-btn">
                    <span>Duration (Hours)</span>
                    <div className="subj-sort-arrows">
                      <svg className={sortField === 'duration' && sortOrder === 'asc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                      <svg className={sortField === 'duration' && sortOrder === 'desc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                  </button>
                </th>
                <th>
                  <button onClick={() => handleSort('answerSheet')} className="subj-sort-btn">
                    <span>Answer Sheet</span>
                    <div className="subj-sort-arrows">
                      <svg className={sortField === 'answerSheet' && sortOrder === 'asc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                      <svg className={sortField === 'answerSheet' && sortOrder === 'desc' ? 'active-sort' : 'inactive-sort'} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                  </button>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="subj-empty">
                      <div className="subj-spinner" />
                      <p className="subj-empty-loading-msg">Loading subjects...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6}>
                    <div className="subj-empty">
                      <div className="subj-empty-icon subj-empty-icon-error">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <p className="subj-empty-error-msg">{error}</p>
                      <button onClick={() => refetch()} className="subj-btn subj-btn-primary subj-empty-retry">Retry</button>
                    </div>
                  </td>
                </tr>
              ) : sortedSubjects.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="subj-empty">
                      <div className="subj-empty-icon">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      </div>
                      <h3>No Subjects Found</h3>
                      <p>{debouncedSearchTerm ? 'No subjects match your search.' : 'No subjects found. Subjects are managed from the admin portal.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedSubjects.map((subject) => {
                  const cls = subject.class === '10th' ? '10th' : subject.class === '12th' ? '12th' : 'default'
                  return (
                    <tr key={subject._id} className={cls === '10th' ? 'subj-row-10th' : cls === '12th' ? 'subj-row-12th' : ''}>
                      <td>
                        <span className={`subj-code subj-code-${cls}`}>{subject.code}</span>
                      </td>
                      <td>
                        <span className={`subj-name subj-name-${cls}`}>{subject.name}</span>
                      </td>
                      <td>
                        <span className={`subj-class-badge subj-class-${cls}`}>{subject.class}</span>
                      </td>
                      <td>
                        <span className={`subj-meta subj-meta-${cls}`}>
                          {subject.duration ? `${subject.duration} ${subject.duration === 1 ? 'Hour' : 'Hours'}` : 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className={`subj-answer subj-answer-${cls}`}>{
                          subject.answerSheet === '32_pages' ? '32 Pages' :
                            subject.answerSheet === '20_pages' ? '20 Pages' :
                              subject.answerSheet === '40_graph' ? '40 Graph' :
                                subject.answerSheet === 'none' ? 'None' : 'â€”'
                        }</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleEditClick(subject)}
                          title="Edit"
                          aria-label={`Edit ${subject.name}`}
                          className={`subj-edit-btn subj-edit-${cls}`}
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && (
          <div className="subj-pagination">
            <div className="subj-pagination-info">
              <span className="subj-pagination-text">
                Showing <strong>{pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}</strong>
                {' '}to{' '}
                <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong>
                {' '}of <strong>{pagination.total}</strong> results
              </span>
              <div className="subj-per-page">
                <span>Per page</span>
                <Dropdown
                  options={PAGE_SIZE_OPTIONS}
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  size="sm"
                  clearable={false}
                  searchable={false}
                  placeholder=""
                  className="w-20"
                />
              </div>
            </div>
            {pagination.pages > 1 && (
              <nav className="subj-page-nav">
                <button
                  type="button"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="subj-page-btn"
                  aria-label="Previous page"
                  title="Previous page"
                >
                  <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </button>
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => handlePageChange(pg)}
                    className={`subj-page-btn ${pg === pagination.page ? 'subj-page-active' : ''}`}
                  >
                    {pg}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="subj-page-btn"
                  aria-label="Next page"
                  title="Next page"
                >
                  <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                </button>
              </nav>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingSubject && (
        <EditSubjectModal
          subject={editingSubject}
          isOpen={isEditModalOpen}
          onClose={handleCloseModal}
          onUpdate={handleUpdateSubject}
          isSubmitting={updateMutation.isPending}
        />
      )}

      {/* Add Modal */}
      {isAddModalOpen && (
        <AddSubjectModal
          isOpen={isAddModalOpen}
          onClose={handleCloseModal}
          onCreate={handleCreateSubject}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Import Subjects Modal */}
      {showImportModal && (
        <SubjectsImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImportSubjects}
          importing={importMutation.isPending}
        />
      )}
    </div>
  )
}


// Reusable segment button group for modal
const segmentBtnBase =
  'min-h-[44px] px-3 sm:px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800'
const segmentBtnActive =
  'bg-primary-600 text-white shadow-sm dark:bg-primary-500'
const segmentBtnInactive =
  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 border border-transparent'

// Edit Subject Modal Component
interface EditSubjectModalProps {
  subject: Subject
  isOpen: boolean
  onClose: () => void
  onUpdate: (updatedSubject: Partial<Subject>) => void
  isSubmitting: boolean
}

const EditSubjectModal: React.FC<EditSubjectModalProps> = ({
  subject,
  isOpen,
  onClose,
  onUpdate,
  isSubmitting
}) => {
  const [formData, setFormData] = useState({
    name: subject.name || '',
    code: subject.code || '',
    class: subject.class || '',
    duration: subject.duration || 3,
    answerSheet: subject.answerSheet || '32_pages'
  })

  // Sync form when subject changes (e.g. opening modal for another subject)
  React.useEffect(() => {
    if (isOpen && subject) {
      setFormData({
        name: subject.name || '',
        code: subject.code || '',
        class: subject.class || '',
        duration: subject.duration || 3,
        answerSheet: subject.answerSheet || '32_pages'
      })
    }
  }, [isOpen, subject])

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onUpdate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration' ? Number(value) : name === 'code' ? value.toUpperCase() : value
    }))
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-subject-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
          <h2
            id="edit-subject-title"
            className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            Edit Subject
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          <div className="grid gap-4 sm:gap-5">
            <div>
              <label htmlFor="edit-subject-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Subject Name
              </label>
              <input
                id="edit-subject-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="input w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>

            <div>
              <label htmlFor="edit-subject-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Subject Code
              </label>
              <input
                id="edit-subject-code"
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                required
                pattern="[A-Z0-9]{3,8}"
                title="Subject code must be 3-8 uppercase letters and numbers"
                className="input w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Class</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, class: '10th' }))}
                  className={`${segmentBtnBase} ${formData.class === '10th' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  Class 10
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, class: '12th' }))}
                  className={`${segmentBtnBase} ${formData.class === '12th' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  Class 12
                </button>
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Exam Duration (hours)</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, duration: 2 }))}
                  className={`${segmentBtnBase} ${formData.duration === 2 ? segmentBtnActive : segmentBtnInactive}`}
                >
                  2 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, duration: 3 }))}
                  className={`${segmentBtnBase} ${formData.duration === 3 ? segmentBtnActive : segmentBtnInactive}`}
                >
                  3 Hours
                </button>
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Answer Sheet</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answerSheet: '20_pages' }))}
                  className={`${segmentBtnBase} ${formData.answerSheet === '20_pages' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  20 Pages
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answerSheet: '32_pages' }))}
                  className={`${segmentBtnBase} ${formData.answerSheet === '32_pages' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  32 Pages
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answerSheet: '40_graph' }))}
                  className={`${segmentBtnBase} ${formData.answerSheet === '40_graph' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  40 Graph
                </button>
              </div>
            </div>
          </div>

          {/* Footer: responsive stack on small screens */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-outline w-full sm:w-auto min-h-[44px] rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full sm:w-auto min-h-[44px] rounded-xl flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Updating...
                </>
              ) : (
                'Update Subject'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add Subject Modal Component
interface AddSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (newSubject: Partial<Subject>) => void
  isSubmitting: boolean
}

const AddSubjectModal: React.FC<AddSubjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isSubmitting
}) => {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    class: '',
    duration: 3,
    answerSheet: '32_pages'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onCreate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'duration' ? Number(value) : name === 'code' ? value.toUpperCase() : value
    }))
  }

  // Reset form when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        code: '',
        class: '',
        duration: 3,
        answerSheet: '32_pages'
      })
    }
  }, [isOpen])

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-subject-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
          <h2
            id="add-subject-title"
            className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            Add Subject
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          <div className="grid gap-4 sm:gap-5">
            <div>
              <label htmlFor="add-subject-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Subject Name
              </label>
              <input
                id="add-subject-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Enter subject name"
                className="input w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>

            <div>
              <label htmlFor="add-subject-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Subject Code
              </label>
              <input
                id="add-subject-code"
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                required
                pattern="[A-Z0-9]{3,8}"
                title="Subject code must be 3-8 uppercase letters and numbers"
                placeholder="Enter subject code (e.g., 055)"
                className="input w-full rounded-xl border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Class</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, class: '10th' }))}
                  className={`${segmentBtnBase} ${formData.class === '10th' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  Class 10
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, class: '12th' }))}
                  className={`${segmentBtnBase} ${formData.class === '12th' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  Class 12
                </button>
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Exam Duration (hours)</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, duration: 2 }))}
                  className={`${segmentBtnBase} ${formData.duration === 2 ? segmentBtnActive : segmentBtnInactive}`}
                >
                  2 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, duration: 3 }))}
                  className={`${segmentBtnBase} ${formData.duration === 3 ? segmentBtnActive : segmentBtnInactive}`}
                >
                  3 Hours
                </button>
              </div>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Answer Sheet</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answerSheet: '20_pages' }))}
                  className={`${segmentBtnBase} ${formData.answerSheet === '20_pages' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  20 Pages
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answerSheet: '32_pages' }))}
                  className={`${segmentBtnBase} ${formData.answerSheet === '32_pages' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  32 Pages
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, answerSheet: '40_graph' }))}
                  className={`${segmentBtnBase} ${formData.answerSheet === '40_graph' ? segmentBtnActive : segmentBtnInactive}`}
                >
                  40 Graph
                </button>
              </div>
            </div>
          </div>

          {/* Footer: responsive stack on small screens */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-outline w-full sm:w-auto min-h-[44px] rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary w-full sm:w-auto min-h-[44px] rounded-xl flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </>
              ) : (
                'Add Subject'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default Subjects
