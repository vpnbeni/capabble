import React, { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '@/redux/slices/authSlice'
import FAQAccordion from '@/components/FAQAccordion'
import SupportForm from '@/components/SupportForm'
import FeedbackForm from '@/components/FeedbackForm'
import Modal from '@/components/common/Modal'
import HelpCentreHero from '@/components/help/HelpCentreHero'
import HelpModuleGrid from '@/components/help/HelpModuleGrid'
import HelpModuleDetail from '@/components/help/HelpModuleDetail'
import HelpContactPanel, { HelpGettingStarted, HelpSystemStatus } from '@/components/help/HelpContactPanel'
import { HELP_MODULE_CATALOG } from '@/constants/helpCentreCatalog'
import { getSupportModules } from '@/constants/supportCatalog'
import { useSystemStatusQuery } from '@/hooks/useSupport'
import '@/styles/helpCentre.css'

const HelpSupport: React.FC = () => {
  const currentUser = useSelector(selectUser)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showAllFaqs, setShowAllFaqs] = useState(false)

  const supportModules = useMemo(
    () => getSupportModules(currentUser?.featureToggles),
    [currentUser?.featureToggles]
  )
  const enabledModuleIds = useMemo(
    () => new Set(supportModules.map((mod) => mod.id)),
    [supportModules]
  )

  const { data: systemStatus } = useSystemStatusQuery()

  const modulesWithState = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return HELP_MODULE_CATALOG.map((mod) => ({
      ...mod,
      enabled: Boolean(mod.registryId && enabledModuleIds.has(mod.registryId)),
    })).filter((mod) => {
      if (!query) return true
      return (
        mod.abbreviation.toLowerCase().includes(query) ||
        mod.title.toLowerCase().includes(query) ||
        mod.description.toLowerCase().includes(query) ||
        mod.keywords.some((kw) => kw.includes(query))
      )
    })
  }, [enabledModuleIds, searchQuery])

  const selectedCatalogModule = HELP_MODULE_CATALOG.find((mod) => mod.id === selectedModuleId)
  const selectedSupportModule = supportModules.find(
    (mod) => mod.id === selectedCatalogModule?.registryId
  )

  const reportModuleId = selectedCatalogModule?.registryId || supportModules[0]?.id

  const statusUpdatedAt = systemStatus?.updatedAt
    ? new Date(systemStatus.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="help-centre-page -m-4 p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <HelpCentreHero
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchSubmit={() => {
                if (modulesWithState.length === 1 && !modulesWithState[0].comingSoon) {
                  setSelectedModuleId(modulesWithState[0].id)
                }
              }}
            />

            {selectedModuleId && selectedCatalogModule && !selectedCatalogModule.comingSoon ? (
              <HelpModuleDetail
                module={selectedCatalogModule}
                supportModule={selectedSupportModule}
                onBack={() => setSelectedModuleId(null)}
                onReportIssue={() => setShowReportModal(true)}
                onShareFeedback={() => setShowFeedbackModal(true)}
              />
            ) : (
              <section>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Browse by School OS Modules</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Select a module to see its pages and report issues in context.
                    </p>
                  </div>
                </div>
                <HelpModuleGrid
                  modules={modulesWithState}
                  selectedModuleId={selectedModuleId}
                  onSelectModule={setSelectedModuleId}
                />
              </section>
            )}

            {showAllFaqs ? (
              <section className="xl:hidden">
                <FAQAccordion compact searchQuery={searchQuery} showAll />
              </section>
            ) : null}

            <footer className="flex flex-col gap-2 border-t border-slate-200/80 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Capabble School OS</span>
              <div className="flex flex-wrap gap-4">
                <a href="mailto:support@capabble.cloud" className="hover:text-violet-600">
                  Privacy Policy
                </a>
                <a href="mailto:support@capabble.cloud" className="hover:text-violet-600">
                  Terms of Use
                </a>
                <button type="button" onClick={() => setShowReportModal(true)} className="hover:text-violet-600">
                  Support Policy
                </button>
              </div>
            </footer>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <HelpContactPanel onReportIssue={() => setShowReportModal(true)} />
            <FAQAccordion
              compact
              searchQuery={searchQuery}
              showAll={showAllFaqs}
              onViewAll={() => setShowAllFaqs(true)}
            />
            <HelpSystemStatus
              status={systemStatus?.status}
              message={systemStatus?.message}
              updatedAt={statusUpdatedAt}
            />
            <HelpGettingStarted />
          </aside>
        </div>
      </div>

      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="Report an Issue"
        size="lg"
      >
        <SupportForm
          embedded
          initialModuleId={reportModuleId}
          onSubmitted={() => setShowReportModal(false)}
        />
      </Modal>

      <Modal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        title="Share Feedback"
        size="md"
      >
        <FeedbackForm embedded onSubmitted={() => setShowFeedbackModal(false)} />
      </Modal>
    </div>
  )
}

export default HelpSupport
