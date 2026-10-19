import React from 'react'
import { useLightOnlyTheme } from '@/utils/theme'
import { Boxes, ShieldCheck, Star } from 'lucide-react'
import fullLogo from '../assets/full logo.png'

const Pricing: React.FC = () => {
  useLightOnlyTheme()
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col items-center px-4 py-10 sm:py-12">
      <header className="w-full max-w-5xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <img src={fullLogo} alt="Cntr" className="h-9 w-auto" />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Pricing
            </p>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
              Choose Your Perfect Plan
            </h1>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
          Flexible pricing designed for CBSE examination centres of every size.
        </p>
      </header>

      <main className="w-full max-w-5xl">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2 py-1 text-xs shadow-inner">
            <button className="px-3 py-1 rounded-full bg-white shadow-sm text-slate-800 font-medium">
              Monthly
            </button>
            <button className="px-3 py-1 rounded-full text-slate-500 font-medium">
              Yearly <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">Save 20%</span>
            </button>
          </div>
        </div>

        <section className="grid gap-4 sm:gap-6 sm:grid-cols-3">
          {/* Lite */}
          <article className="rounded-3xl bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] border border-slate-100 px-5 py-6 flex flex-col">
            <div className="mb-4 flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 shadow-sm">
                <Boxes className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide">Lite</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">For small examination centres</p>
            <div className="mb-4">
              <div className="text-2xl font-semibold text-slate-900">₹999</div>
              <p className="text-xs text-slate-500">per exam season • billed annually</p>
            </div>
            <ul className="mt-1 mb-5 space-y-1.5 text-xs text-slate-600">
              <li>Manage up to 5 exam rooms</li>
              <li>Centre datesheet generation</li>
              <li>Basic seating plan</li>
              <li>Candidate list access</li>
              <li>Email support</li>
            </ul>
            <button className="mt-auto w-full rounded-full bg-slate-900 text-white text-xs font-semibold py-2.5 hover:bg-slate-800 transition">
              Start Lite
            </button>
          </article>

          {/* Plus */}
          <article className="relative rounded-3xl bg-gradient-to-b from-violet-500/90 via-violet-500/80 to-indigo-500/90 text-white shadow-[0_22px_70px_rgba(88,28,135,0.45)] px-5 py-7 flex flex-col border border-white/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white text-[10px] font-semibold text-violet-700 px-3 py-1 shadow-md">
              Most Popular
            </div>
            <div className="mb-4 pt-1 flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-violet-200/80 text-violet-800 shadow-sm shadow-violet-900/30">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide">Plus</p>
            </div>
            <p className="text-xs text-violet-100 mb-3">For most examination centres</p>
            <div className="mb-4">
              <div className="text-2xl font-semibold">₹1,999</div>
              <p className="text-xs text-violet-100">per exam season • billed annually</p>
            </div>
            <ul className="mt-1 mb-5 space-y-1.5 text-xs text-violet-50">
              <li>Manage up to 20 exam rooms</li>
              <li>Seating plan automation</li>
              <li>Functionary duty assignment</li>
              <li>Attendance tracking</li>
              <li>Answer sheet management</li>
            </ul>
            <button className="mt-auto w-full rounded-full bg-white text-violet-700 text-xs font-semibold py-2.5 hover:bg-violet-50 transition">
              Start Plus
            </button>
          </article>

          {/* Pro */}
          <article className="rounded-3xl bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] border border-slate-100 px-5 py-6 flex flex-col">
            <div className="mb-4 flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
                <Star className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Pro</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">For large examination centres</p>
            <div className="mb-4">
              <div className="text-2xl font-semibold text-slate-900">₹3,999</div>
              <p className="text-xs text-slate-500">per exam season • billed annually</p>
            </div>
            <ul className="mt-1 mb-5 space-y-1.5 text-xs text-slate-600">
              <li>Unlimited exam rooms</li>
              <li>Advanced seating algorithms</li>
              <li>Smart invigilator assignment</li>
              <li>Real-time exam monitoring</li>
              <li>Advanced reports</li>
            </ul>
            <button className="mt-auto w-full rounded-full bg-indigo-600 text-white text-xs font-semibold py-2.5 hover:bg-indigo-700 transition">
              Get Pro
            </button>
          </article>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500">
          <span>Secure</span>
          <span>•</span>
          <span>Indian market optimized</span>
          <span>•</span>
          <span>Localized</span>
        </footer>
      </main>
    </div>
  )
}

export default Pricing

