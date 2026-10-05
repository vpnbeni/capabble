import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, ArchiveRestore } from 'lucide-react'
import Modal from '@/components/common/Modal'
import cpitlService, { FeeStructure } from '@/services/cpitlService'
import { useInvalidateCpitl } from '@/hooks/useCpitl'
import { Field, btnPrimary, btnSecondary, errorMessage, inputClass } from '@/components/cpitl/CpitlUi'

type Mode = 'archive' | 'restore'

/** Confirm archiving or restoring a fee structure, spelling out what happens to assigned students. */
const StructureArchiveDialog: React.FC<{
  structure: FeeStructure | null
  mode: Mode
  onClose: () => void
  onDone?: (updated: FeeStructure) => void
}> = ({ structure, mode, onClose, onDone }) => {
  const invalidate = useInvalidateCpitl()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (structure) setReason('')
  }, [structure])

  if (!structure) return null
  const assigned = structure.assignedCount || 0
  const restoresAs = assigned ? 'active' : 'draft'

  const submit = async () => {
    setBusy(true)
    try {
      const res =
        mode === 'archive'
          ? await cpitlService.archiveStructure(structure._id, reason.trim() || undefined)
          : await cpitlService.restoreStructure(structure._id)
      toast.success(res?.message || (mode === 'archive' ? 'Structure archived.' : 'Structure restored.'))
      invalidate()
      onDone?.(res?.data as FeeStructure)
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={() => !busy && onClose()} title={mode === 'archive' ? 'Archive fee structure' : 'Restore fee structure'} size="sm">
      <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
        <p>
          <span className="font-semibold text-slate-900 dark:text-white">{structure.name}</span> · v{structure.version}
        </p>

        {mode === 'archive' ? (
          <>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>It becomes read-only and can't be assigned to more students.</li>
              {assigned ? (
                <li>
                  The <span className="font-semibold text-slate-900 dark:text-white">{assigned} assigned student{assigned === 1 ? '' : 's'}</span>{' '}
                  keep their current dues and payments. Collection continues as normal.
                </li>
              ) : (
                <li>No students are assigned, so no dues are affected.</li>
              )}
              <li>You can restore it at any time, or duplicate it to start a new version.</li>
            </ul>
            <Field label="Reason (optional, shown in history)">
              <input
                autoFocus
                className={inputClass}
                value={reason}
                placeholder="e.g. Replaced by 2027-28 structure"
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
              />
            </Field>
          </>
        ) : (
          <p>
            It will become <span className="font-semibold text-slate-900 dark:text-white">{restoresAs}</span> again
            {assigned ? ` (${assigned} student${assigned === 1 ? ' is' : 's are'} still assigned)` : ''} and can be edited and
            assigned.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={busy} onClick={submit}>
            {mode === 'archive' ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
            {busy ? (mode === 'archive' ? 'Archiving…' : 'Restoring…') : mode === 'archive' ? 'Archive' : 'Restore'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default StructureArchiveDialog
