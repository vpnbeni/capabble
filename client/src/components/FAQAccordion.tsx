import React, { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { HELP_FAQS, type HelpFaqItem } from '@/constants/helpFaqs'

type FAQAccordionProps = {
  compact?: boolean
  searchQuery?: string
  showAll?: boolean
  onViewAll?: () => void
  limit?: number
}

const FAQAccordion: React.FC<FAQAccordionProps> = ({
  compact = false,
  searchQuery = '',
  showAll = false,
  onViewAll,
  limit = 4,
}) => {
  const [openId, setOpenId] = useState<string | null>('login-1')

  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return HELP_FAQS
    return HELP_FAQS.filter(
      (item) =>
        item.question.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.answer.toLowerCase().includes(query) ||
        item.keywords.some((kw) => kw.includes(query))
    )
  }, [searchQuery])

  const visibleFaqs = showAll ? filteredFaqs : filteredFaqs.slice(0, limit)

  return (
    <div className={`help-sidebar-card rounded-2xl ${compact ? 'p-4' : 'p-5'}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Frequently Asked Questions</h2>
        {!showAll && filteredFaqs.length > limit && onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-violet-600 hover:text-violet-700"
          >
            View all
          </button>
        ) : null}
      </div>

      {visibleFaqs.length === 0 ? (
        <p className="text-xs text-slate-500">No FAQs match your search.</p>
      ) : (
        <div className="space-y-2">
          {visibleFaqs.map((item: HelpFaqItem) => {
            const isOpen = openId === item.id
            return (
              <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : item.id)}
                  className="flex w-full items-start justify-between gap-2 bg-slate-50/80 px-3 py-2.5 text-left transition hover:bg-violet-50/50"
                >
                  <div className="min-w-0">
                    {!compact ? (
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {item.category}
                      </p>
                    ) : null}
                    <p className="text-xs font-medium leading-snug text-slate-800">{item.question}</p>
                  </div>
                  <ChevronRight
                    className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>
                {isOpen ? (
                  <div className="border-t border-slate-100 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                    {item.answer}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FAQAccordion
