import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Copy, Layers, Plus, Users } from 'lucide-react'
import { useFeeStructures, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { FeeStructure } from '@/services/cpitlService'
import { CpitlBadge, CpitlEmpty, CpitlPageShell, btnGhost, btnPrimary, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'

const StructureCard: React.FC<{ structure: FeeStructure; onDuplicate: (s: FeeStructure) => void }> = ({ structure, onDuplicate }) => (
  <Link
    to={`/cpitl/fee-structures/${structure._id}`}
    className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white">{structure.name}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{structure.description || `${structure.components.length} fee heads`}</p>
      </div>
      <CpitlBadge status={structure.status} />
    </div>

    <div className="mt-4 flex flex-wrap gap-1.5">
      {structure.applicableClasses.length ? (
        structure.applicableClasses.map((cls) => (
          <span key={cls} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {cls}
          </span>
        ))
      ) : (
        <span className="text-xs text-slate-400">No classes selected</span>
      )}
    </div>

    <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
      <div>
        <p className="text-xs text-slate-500">Annual per student</p>
        <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{inr(structure.annualTotal)}</p>
        {structure.annualTotalWithOptional > structure.annualTotal ? (
          <p className="text-[11px] text-slate-400">up to {inr(structure.annualTotalWithOptional)} with optional heads</p>
        ) : null}
      </div>
      <div className="text-right text-xs text-slate-500">
        <div className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {structure.assignedCount} students
        </div>
        <div className="mt-0.5">
          v{structure.version} · {fmtDate(structure.updatedAt)}
        </div>
      </div>
    </div>

    <div className="mt-3 flex justify-end">
      <button
        type="button"
        className={btnGhost}
        onClick={(e) => {
          e.preventDefault()
          onDuplicate(structure)
        }}
      >
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </button>
    </div>
  </Link>
)

const CpitlFeeStructures: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: structures = [], isLoading } = useFeeStructures()

  const duplicate = async (structure: FeeStructure) => {
    try {
      const copy = await cpitlService.duplicateStructure(structure._id)
      toast.success('Structure duplicated as draft.')
      invalidate()
      navigate(`/cpitl/fee-structures/${copy._id}`)
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  const active = structures.filter((s) => s.status !== 'archived')
  const archived = structures.filter((s) => s.status === 'archived')

  return (
    <CpitlPageShell
      title="Fee Structures"
      subtitle="Define class-wise fee heads, installments and late fee rules. Every change is versioned."
      actions={
        <>
          <Link to="/cpitl/settings" className={btnGhost}>
            <Layers className="h-3.5 w-3.5" /> Fee heads
          </Link>
          <Link to="/cpitl/fee-structures/new" className={btnPrimary}>
            <Plus className="h-4 w-4" /> New structure
          </Link>
        </>
      }
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : active.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {active.map((s) => (
            <StructureCard key={s._id} structure={s} onDuplicate={duplicate} />
          ))}
        </div>
      ) : (
        <CpitlEmpty
          message="No fee structures yet. Create one per class group, for example “Primary (I–V)” or “Senior Secondary Science”."
          action={
            <Link to="/cpitl/fee-structures/new" className={btnPrimary}>
              <Plus className="h-4 w-4" /> Create first structure
            </Link>
          }
        />
      )}

      {archived.length ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-500">Archived</h3>
          <div className="grid gap-4 opacity-75 md:grid-cols-2 xl:grid-cols-3">
            {archived.map((s) => (
              <StructureCard key={s._id} structure={s} onDuplicate={duplicate} />
            ))}
          </div>
        </div>
      ) : null}
    </CpitlPageShell>
  )
}

export default CpitlFeeStructures
