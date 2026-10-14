import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, ArchiveRestore } from 'lucide-react'
import cpitlService, { FeeStructure } from '@/services/cpitlService'
import { useInvalidateCpitl } from '@/hooks/useCpitl'
import { Button, Dialog, TextField } from '@/components/ui'
import { errorMessage } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/fees.css'

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
  const archiving = mode === 'archive'

  const submit = async () => {
    setBusy(true)
    try {
      const res = archiving
        ? await cpitlService.archiveStructure(structure._id, reason.trim() || undefined)
        : await cpitlService.restoreStructure(structure._id)
      toast.success(res?.message || (archiving ? 'Structure archived.' : 'Structure restored.'))
      invalidate()
      onDone?.(res?.data as FeeStructure)
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  return (
    <Dialog
      open
      onClose={close}
      size="sm"
      tone={archiving ? 'danger' : 'default'}
      title={archiving ? 'Archive fee structure?' : 'Restore fee structure?'}
      description={`${structure.name} · version ${structure.version}`}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant={archiving ? 'danger' : 'primary'}
            icon={archiving ? Archive : ArchiveRestore}
            loading={busy}
            onClick={submit}
          >
            {archiving ? 'Archive structure' : 'Restore structure'}
          </Button>
        </>
      }
    >
      <div className="cf-confirm">
        {archiving ? (
          <>
            <ul className="cf-confirm__list">
              <li>It becomes read-only and can't be assigned to more students.</li>
              {assigned ? (
                <li>
                  The <strong>{assigned} assigned student{assigned === 1 ? '' : 's'}</strong> keep their current dues and
                  payments. Collection continues as normal.
                </li>
              ) : (
                <li>No students are assigned, so no dues are affected.</li>
              )}
              <li>You can restore it at any time, or duplicate it to start a new version.</li>
            </ul>
            <TextField
              autoFocus
              label="Reason (optional)"
              hint="Shown in the change history."
              value={reason}
              placeholder="e.g. Replaced by 2027-28 structure"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
            />
          </>
        ) : (
          <p>
            It will become <strong>{restoresAs}</strong> again
            {assigned ? ` (${assigned} student${assigned === 1 ? ' is' : 's are'} still assigned)` : ''} and can be edited and
            assigned.
          </p>
        )}
      </div>
    </Dialog>
  )
}

export default StructureArchiveDialog
