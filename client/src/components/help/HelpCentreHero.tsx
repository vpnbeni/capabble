import React from 'react'
import { Headphones, Search } from 'lucide-react'
import { POPULAR_SEARCHES } from '@/constants/helpFaqs'

type HelpCentreHeroProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
}

const HelpCentreHero: React.FC<HelpCentreHeroProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}) => {
  return (
    <section className="help-centre-hero relative overflow-hidden rounded-2xl px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-violet-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-violet-700 ring-1 ring-violet-100">
            <Headphones className="h-3.5 w-3.5" />
            Capabble School OS Help Centre
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Help Centre</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Search guides, browse modules, report issues, and get support for every part of your school ERP.
          </p>
        </div>

        <div className="hidden shrink-0 lg:block">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/60 ring-1 ring-violet-100">
            <Headphones className="h-12 w-12 text-violet-500/80" strokeWidth={1.5} />
          </div>
        </div>
      </div>

      <form
        className="help-centre-search relative mt-6 flex items-center gap-2 rounded-xl border border-violet-100 bg-white p-1.5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          onSearchSubmit()
        }}
      >
        <Search className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search for help articles, e.g. 'attendance', 'report card'"
          className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Popular:</span>
        {POPULAR_SEARCHES.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => onSearchChange(term)}
            className="help-chip rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600"
          >
            {term}
          </button>
        ))}
      </div>
    </section>
  )
}

export default HelpCentreHero
