import React, { useEffect, useState } from 'react'
import { classLabel } from '@/utils/classLabel'
import toast from 'react-hot-toast'
import { Printer, Users } from 'lucide-react'
import { Banner, Button, DataTable, Dialog, RadioGroup, Sheet, TextField, type DataTableColumn } from '@/components/ui'
import { useBulkPortalLogins } from '@/hooks/useUserAdmin'
import type { BulkPortalResult, CredentialMethod } from '@/services/userAdminService'
import { errorMessage, printCredentialSlips } from './AccessUi'

type CreatedRow = BulkPortalResult['created'][number]
type SkippedRow = BulkPortalResult['skipped'][number]

/** Create parent or student logins for a whole class at once. */
const BulkPortalSheet: React.FC<{
  open: boolean
  kind: 'parent' | 'student'
  schoolName: string
  onClose: () => void
}> = ({ open, kind, schoolName, onClose }) => {
  const bulk = useBulkPortalLogins()
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [method, setMethod] = useState<CredentialMethod>('temporary')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BulkPortalResult | null>(null)

  useEffect(() => {
    if (!open) return
    setClassName('')
    setSection('')
    setMethod(kind === 'student' ? 'temporary' : 'invite')
    setError(null)
  }, [open, kind])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!className.trim()) {
      setError('Enter a class, for example 7')
      return
    }
    try {
      const data = await bulk.mutateAsync({ kind, className: className.trim(), section: section.trim() || undefined, method })
      setResult(data)
      onClose()
      toast.success(`${data.created.length} login${data.created.length === 1 ? '' : 's'} created`)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the logins.'))
    }
  }

  const createdColumns: DataTableColumn<CreatedRow>[] = [
    { key: 'student', header: 'Student', render: (row) => row.studentName, mobile: 'title' },
    { key: 'login', header: 'Login ID', render: (row) => row.loginId, mobile: 'subtitle' },
    {
      key: 'password',
      header: 'Temporary password',
      render: (row) => row.temporaryPassword || (row.emailSent ? 'Invite emailed' : 'Invite link (email failed)'),
      mobile: 'aside',
    },
  ]
  const skippedColumns: DataTableColumn<SkippedRow>[] = [
    { key: 'student', header: 'Student', render: (row) => row.studentName, mobile: 'title' },
    { key: 'class', header: 'Class', render: (row) => classLabel(row.className, row.section), mobile: 'hidden' },
    { key: 'reason', header: 'Why', render: (row) => row.reason, mobile: 'subtitle', wrap: true },
  ]

  const hasPasswords = Boolean(result?.created.some((row) => row.temporaryPassword))

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        icon={Users}
        title={kind === 'parent' ? 'Create parent logins for a class' : 'Create student logins for a class'}
        description={kind === 'parent'
          ? 'Uses the guardian email on each student record. Brothers and sisters share one parent login.'
          : 'Each student gets a login ID made from their admission number.'}
        onSubmit={submit}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" loading={bulk.isPending}>Create logins</Button>
          </>
        }
      >
        <div className="cb-form-section">
          <div className="cb-form-grid">
            <TextField
              label="Class"
              placeholder="e.g. 7"
              value={className}
              error={error || undefined}
              onChange={(event) => {
                setClassName(event.target.value)
                setError(null)
              }}
            />
            <TextField
              label="Section (optional)"
              placeholder="All sections"
              value={section}
              onChange={(event) => setSection(event.target.value)}
            />
          </div>
          <p className="cb-muted">Students who already have a login are skipped.</p>
        </div>
        <div className="cb-form-section">
          <div className="cb-form-section__title">How they get their password</div>
          <RadioGroup
            value={method}
            onChange={(value) => setMethod(value as CredentialMethod)}
            variant="cards"
            options={[
              {
                value: 'invite',
                label: 'Email an invite link',
                description: 'Anyone without an email gets a temporary password instead.',
              },
              {
                value: 'temporary',
                label: 'Give temporary passwords',
                description: 'Print the slips and hand them out. Each must be changed at first sign-in.',
              },
            ]}
          />
        </div>
      </Sheet>

      <Dialog
        open={Boolean(result)}
        onClose={() => setResult(null)}
        size="lg"
        title={`${result?.created.length || 0} logins created`}
        description={hasPasswords
          ? 'Temporary passwords are shown only now. Print the slips before you close this.'
          : undefined}
        footer={
          <>
            {hasPasswords ? (
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => printCredentialSlips(
                  (result?.created || []).map((row) => ({
                    name: row.studentName,
                    loginId: row.loginId,
                    temporaryPassword: row.temporaryPassword,
                    detail: classLabel(row.className, row.section),
                  })),
                  schoolName
                )}
              >
                Print login slips
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setResult(null)}>Done</Button>
          </>
        }
      >
        <div className="cb-app ua-results">
          {result && result.linked.length > 0 ? (
            <Banner tone="info">
              {result.linked.length} existing parent login{result.linked.length === 1 ? '' : 's'} now also cover{result.linked.length === 1 ? 's' : ''} these children.
            </Banner>
          ) : null}
          {result && result.created.length > 0 ? (
            <DataTable columns={createdColumns} rows={result.created} getRowKey={(row) => row.userId} maxHeight="320px" />
          ) : null}
          {result && result.skipped.length > 0 ? (
            <>
              <div className="cb-form-section__title">Skipped ({result.skipped.length})</div>
              <DataTable
                columns={skippedColumns}
                rows={result.skipped}
                getRowKey={(row) => `${row.studentName}-${row.className}-${row.section}-${row.reason}`}
                maxHeight="240px"
              />
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}

export default BulkPortalSheet
