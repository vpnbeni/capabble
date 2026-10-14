import React, { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { Banner, Button, Checkbox, Dialog, Select } from '@/components/ui'
import {
  DEFAULT_ATTND_SETTINGS,
  saveAttndSettings,
  useAttndSettings,
  type AttndSettings,
} from './attndSettings'

/** Gear button that opens the attendance settings. */
export const AttndSettingsButton: React.FC = () => {
  const settings = useAttndSettings()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AttndSettings>(settings)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  const update = <K extends keyof AttndSettings>(key: K, value: AttndSettings[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const handleSave = () => {
    saveAttndSettings(draft)
    setOpen(false)
  }

  return (
    <>
      <Button
        size="sm"
        icon={Settings}
        aria-label="Attendance settings"
        title="Attendance settings"
        onClick={() => setOpen(true)}
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Attendance settings"
        description="How the attendance grids fill in and count days. Applies to staff and student attendance on this device."
        footer={
          <>
            <Button variant="tertiary" onClick={() => setDraft(DEFAULT_ATTND_SETTINGS)}>
              Restore defaults
            </Button>
            <span style={{ flex: 1 }} />
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>
              Save settings
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <Select
            label="Working days with no absence"
            hint={
              draft.unmarkedAs === 'present'
                ? 'Everyone starts present. Tick a box only for people who were absent.'
                : 'Days stay blank and are not counted as present until marked.'
            }
            value={draft.unmarkedAs}
            onChange={(event) => update('unmarkedAs', event.target.value as AttndSettings['unmarkedAs'])}
            options={[
              { value: 'present', label: 'Mark everyone present by default' },
              { value: 'unmarked', label: 'Leave not marked' },
            ]}
          />
          <Checkbox
            label='Show "P" on present days'
            description="Present days show a green P instead of an empty box."
            checked={draft.showPresentMark}
            onChange={(checked) => update('showPresentMark', checked)}
            disabled={draft.unmarkedAs !== 'present'}
          />
          <Checkbox
            label="Treat Sundays as holidays"
            description="Sundays start as holidays. You can still switch any date by clicking its header."
            checked={draft.sundayHoliday}
            onChange={(checked) => update('sundayHoliday', checked)}
          />
          <Checkbox
            label="Allow absences on future dates"
            description="For planned leave. Future dates are never counted as present."
            checked={draft.allowFutureMarking}
            onChange={(checked) => update('allowFutureMarking', checked)}
          />
        </div>
        <div className="cb-form-section">
          <Banner tone="info">
            Attendance is saved as absences. These settings change what the grids show and count, not what is
            stored.
          </Banner>
        </div>
      </Dialog>
    </>
  )
}
