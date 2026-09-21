import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import { useCreateSupportTicketMutation } from '@/hooks/useSupport'
import { useSchoolProfile } from '@/hooks/useSchoolProfile'
import { findSupportSelectionFromPath, getSupportModules } from '@/constants/supportCatalog'
import toast from 'react-hot-toast'

type SupportFormProps = {
  onSubmitted?: () => void
  initialModuleId?: string
  initialPageId?: string
  embedded?: boolean
}

const SupportForm: React.FC<SupportFormProps> = ({
  onSubmitted,
  initialModuleId,
  initialPageId,
  embedded = false,
}) => {
  const location = useLocation()
  const currentUser = useSelector(selectUser)
  const { data: schoolProfile } = useSchoolProfile(Boolean(currentUser))

  const moduleOptions = useMemo(
    () => getSupportModules(currentUser?.featureToggles),
    [currentUser?.featureToggles]
  )

  const [productModule, setProductModule] = useState('')
  const [pageId, setPageId] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [description, setDescription] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submitTicketMutation = useCreateSupportTicketMutation()
  const submitting = submitTicketMutation.isPending

  const selectedModule = moduleOptions.find((mod) => mod.id === productModule)
  const pageOptions = selectedModule?.pages || []
  const selectedPage = pageOptions.find((page) => page.id === pageId)

  const schoolCode = String(schoolProfile?.schoolCode || '').trim()
  const affiliationNo = String(schoolProfile?.affiliationNo || '').trim()

  useEffect(() => {
    if (initialModuleId && moduleOptions.some((mod) => mod.id === initialModuleId)) {
      setProductModule(initialModuleId)
      if (initialPageId) {
        const pages = moduleOptions.find((mod) => mod.id === initialModuleId)?.pages || []
        if (pages.some((page) => page.id === initialPageId)) {
          setPageId(initialPageId)
          return
        }
      }
      const pages = moduleOptions.find((mod) => mod.id === initialModuleId)?.pages || []
      setPageId(pages[0]?.id || '')
      return
    }

    if (moduleOptions.length === 0) return

    const isHelpPage = location.pathname.includes('/help-support')
    if (!isHelpPage) {
      const fromPath = findSupportSelectionFromPath(location.pathname, currentUser?.featureToggles)
      if (fromPath && moduleOptions.some((mod) => mod.id === fromPath.moduleId)) {
        setProductModule(fromPath.moduleId)
        setPageId(fromPath.pageId)
        return
      }
    }

    setProductModule((prev) => prev || moduleOptions[0].id)
    setPageId((prev) => prev || moduleOptions[0].pages[0]?.id || '')
  }, [moduleOptions, location.pathname, currentUser?.featureToggles, initialModuleId, initialPageId])

  useEffect(() => {
    if (!selectedModule) return
    if (!pageOptions.some((page) => page.id === pageId)) {
      setPageId(pageOptions[0]?.id || '')
    }
  }, [selectedModule, pageOptions, pageId])

  const validate = () => {
    const next: Record<string, string> = {}
    if (!productModule) next.productModule = 'Select a module'
    if (!pageId) next.pageId = 'Select the page or area'
    if (!description.trim()) next.description = 'Please describe the issue'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate() || !selectedModule || !selectedPage) return
    try {
      await submitTicketMutation.mutateAsync({
        productModule: selectedModule.id,
        productModuleLabel: `${selectedModule.abbreviation} — ${selectedModule.label}`,
        pageOrArea: selectedPage.label,
        pagePath: selectedPage.path,
        schoolCode,
        affiliationNo,
        issueDate: issueDate || undefined,
        description: description.trim(),
        screenshot: screenshot?.name,
      })
      setDescription('')
      setScreenshot(null)
      toast.success('Issue reported successfully.')
      if (onSubmitted) onSubmitted()
    } catch {
      // API interceptor already shows message.
    }
  }

  if (moduleOptions.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 shadow-sm">
        No modules are enabled for this tenant. Contact your administrator to activate modules before reporting issues.
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        embedded
          ? 'space-y-4'
          : 'space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5'
      }
    >
      {!embedded ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Report an Issue</h2>
          <p className="mt-1 text-xs text-gray-500">
            Choose the module and page where you faced the problem, then describe what happened.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Module</label>
          <select
            value={productModule}
            onChange={(e) => {
              const nextModule = e.target.value
              setProductModule(nextModule)
              const nextPages = moduleOptions.find((mod) => mod.id === nextModule)?.pages || []
              setPageId(nextPages[0]?.id || '')
            }}
            title="Module"
            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {moduleOptions.map((mod) => (
              <option key={mod.id} value={mod.id}>
                {mod.abbreviation} — {mod.label}
              </option>
            ))}
          </select>
          {errors.productModule ? <p className="mt-1 text-[11px] text-red-500">{errors.productModule}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Page / Area</label>
          <select
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            title="Page or area"
            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {pageOptions.map((page) => (
              <option key={page.id} value={page.id}>
                {page.label}
              </option>
            ))}
          </select>
          {errors.pageId ? <p className="mt-1 text-[11px] text-red-500">{errors.pageId}</p> : null}
          {selectedPage?.path ? (
            <p className="mt-1 truncate text-[11px] text-gray-400">Route: {selectedPage.path}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Aff. No.</label>
          <input
            type="text"
            value={affiliationNo || '—'}
            readOnly
            title="Affiliation number"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">CBSE Code</label>
          <input
            type="text"
            value={schoolCode || '—'}
            readOnly
            title="CBSE code"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Issue date (optional)</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            title="Issue date"
            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-600">Screenshot (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
            title="Screenshot"
            className="w-full text-xs"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-600">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-lg border border-gray-300 px-2.5 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="What were you trying to do? What happened instead? Include steps and any error messages."
        />
        {errors.description ? <p className="mt-1 text-[11px] text-red-500">{errors.description}</p> : null}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit Issue'}
        </button>
      </div>
    </form>
  )
}

export default SupportForm
