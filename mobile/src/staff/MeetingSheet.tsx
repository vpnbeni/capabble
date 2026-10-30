import { useRouter } from 'expo-router'
import { MoreHorizontal, Phone } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDayKey, formatTime, schoolToday } from '@/lib/format'
import type { Appointment, AppointmentAction, AppointmentMode, AppointmentStatus, VisitorType } from '@/services/appntService'
import { space, type Tone } from '@/theme/tokens'
import { ActionSheet, Badge, BottomSheet, DetailList, MobileButton, MobileTextField, Text, haptic } from '@/ui'

import { useMeetingAction, useSaveMeetingNotes } from './queries'

// Same words as the website (client/src/components/appnt/AppntUi.tsx).
export const MEETING_STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  checked_in: { label: 'Checked in', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'No-show', tone: 'danger' },
}

export const VISITOR_LABEL: Record<VisitorType, string> = { parent: 'Parent', visitor: 'Visitor', staff: 'Staff', vendor: 'Vendor', other: 'Other' }
export const MODE_LABEL: Record<AppointmentMode, string> = { in_person: 'In person', phone: 'Phone call', video: 'Video call' }

/** "Mother of Aarav Shah · Class 7-A" */
export const visitorDetail = (a: Appointment) => {
  const s = a.studentSnapshot
  if (a.visitorType === 'parent' && s?.name) return `${a.visitor.relation ? `${a.visitor.relation} of` : 'Parent of'} ${s.name} · ${classLabel(s.className, s.section)}`
  if (a.visitor.organisation) return `${VISITOR_LABEL[a.visitorType]} · ${a.visitor.organisation}`
  return VISITOR_LABEL[a.visitorType]
}

const DONE: Record<AppointmentAction, string> = {
  confirm: 'Meeting confirmed',
  decline: 'Request declined',
  'check-in': 'Checked in',
  complete: 'Meeting completed',
  'no-show': 'Marked as no-show',
  cancel: 'Meeting cancelled',
}

/** The one next step for a meeting, if this login may take it. */
const nextStep = (a: Appointment): { action: AppointmentAction; label: string } | null => {
  if (!a.canAct) return null
  if (a.status === 'requested') return { action: 'confirm', label: 'Confirm meeting' }
  if (a.status === 'confirmed' && a.date <= schoolToday()) return { action: 'check-in', label: 'Check in' }
  if (a.status === 'checked_in') return { action: 'complete', label: 'Mark completed' }
  return null
}

/**
 * One meeting for its host: who, when, why, a call button, private notes, and the next step.
 * Decline and cancel ask for an optional reason (shared with the visitor) inside the sheet.
 * `onDone` gets the past-tense message; the screen shows it as a toast once the sheet is closed.
 */
export function MeetingSheet({ meeting, onClose, onDone }: { meeting: Appointment | null; onClose: () => void; onDone: (message: string) => void }) {
  const router = useRouter()
  const act = useMeetingAction()
  const saveNotes = useSaveMeetingNotes()
  const [notes, setNotes] = useState<string | null>(null)
  const [reasonFor, setReasonFor] = useState<'decline' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // A different meeting opened: start clean.
  if ((meeting?._id ?? null) !== openedFor) {
    setOpenedFor(meeting?._id ?? null)
    setNotes(null)
    setReasonFor(null)
    setReason('')
    setError(null)
  }

  if (!meeting) return <BottomSheet open={false} onClose={onClose} title="" />
  const a = meeting
  const step = nextStep(a)
  const others: { action: AppointmentAction; label: string; tone?: 'danger' }[] = a.canAct
    ? [
        ...(a.status === 'confirmed' && a.date <= schoolToday() ? [{ action: 'no-show' as const, label: 'Mark no-show' }] : []),
        ...(a.status === 'requested' ? [{ action: 'decline' as const, label: 'Decline request', tone: 'danger' as const }] : []),
        ...(a.status === 'confirmed' ? [{ action: 'cancel' as const, label: 'Cancel meeting', tone: 'danger' as const }] : []),
      ]
    : []
  const noteText = notes ?? a.outcomeNotes ?? ''

  const run = async (action: AppointmentAction, note?: string) => {
    setError(null)
    try {
      await act.mutateAsync({ id: a._id, action, note })
      haptic.success()
      onClose()
      onDone(DONE[action])
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "That didn't save. Check your connection and try again.")
    }
  }

  const footer = reasonFor ? (
    <View style={{ gap: space['space-2'] }}>
      <MobileButton variant="destructive" fullWidth loading={act.isPending} onPress={() => run(reasonFor, reason.trim() || undefined)}>
        {reasonFor === 'decline' ? 'Decline request' : 'Cancel meeting'}
      </MobileButton>
      <MobileButton variant="gray" fullWidth onPress={() => setReasonFor(null)}>
        {reasonFor === 'decline' ? 'Keep request' : 'Keep meeting'}
      </MobileButton>
    </View>
  ) : (
    <View style={{ gap: space['space-2'] }}>
      {step ? (
        <MobileButton fullWidth loading={act.isPending} onPress={() => run(step.action)}>
          {step.label}
        </MobileButton>
      ) : null}
      {others.length ? (
        <MobileButton variant="gray" fullWidth icon={MoreHorizontal} onPress={() => setMore(true)}>
          More actions
        </MobileButton>
      ) : null}
      {!step && !others.length ? (
        <MobileButton variant="gray" fullWidth onPress={onClose}>
          Done
        </MobileButton>
      ) : null}
    </View>
  )

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        detent="large"
        title={a.visitor.name}
        description={`${formatDayKey(a.date, { weekday: 'short' })}, ${formatTime(a.startTime)} to ${formatTime(a.endTime)}`}
        footer={footer}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] }}>
          <Badge label={MEETING_STATUS[a.status].label} tone={MEETING_STATUS[a.status].tone} />
          {a.hostAbsent ? <Badge label="You're marked absent today" tone="warning" /> : null}
        </View>
        {error ? (
          <Text variant="label" tone="danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {reasonFor ? (
          <MobileTextField
            label="Reason (optional)"
            hint="Shared with the visitor."
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
          />
        ) : (
          <>
            <DetailList
              items={[
                { label: 'Visitor', value: visitorDetail(a) },
                { label: 'Purpose', value: a.purpose },
                { label: 'How', value: `${MODE_LABEL[a.mode]}${a.location ? ` · ${a.location}` : ''}` },
                { label: 'Reference', value: a.refNo },
                ...(a.agenda ? [{ label: "What it's about", value: a.agenda, wide: true }] : []),
                ...(a.cancelReason ? [{ label: a.status === 'declined' ? 'Reason declined' : 'Reason cancelled', value: a.cancelReason, wide: true }] : []),
              ]}
            />
            {a.visitor.phone ? (
              <MobileButton
                variant="tinted"
                size="medium"
                icon={Phone}
                onPress={() => Linking.openURL(`tel:${String(a.visitor.phone).replace(/\s+/g, '')}`)}
              >
                {`Call ${a.visitor.name.split(' ')[0]}`}
              </MobileButton>
            ) : null}
            {a.canSeeNotes ? (
              <View style={{ gap: space['space-2'] }}>
                <MobileTextField
                  label="Private notes"
                  hint="Only you and the principal can read these."
                  value={noteText}
                  onChangeText={setNotes}
                  multiline
                  maxLength={4000}
                />
                {notes !== null && notes !== (a.outcomeNotes ?? '') ? (
                  <MobileButton
                    variant="gray"
                    size="medium"
                    loading={saveNotes.isPending}
                    onPress={async () => {
                      setError(null)
                      try {
                        await saveNotes.mutateAsync({ id: a._id, notes: noteText })
                        haptic.success()
                        setNotes(null)
                      } catch (failure) {
                        haptic.error()
                        setError(failure instanceof ApiError ? failure.message : "Your notes didn't save. Try again.")
                      }
                    }}
                  >
                    Save notes
                  </MobileButton>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </BottomSheet>
      <ActionSheet
        open={more}
        onClose={() => setMore(false)}
        title={a.visitor.name}
        actions={[
          // A booked meeting can move to another free time (the visitor is told).
          ...(a.canAct && (a.status === 'confirmed' || a.status === 'requested')
            ? [
                {
                  label: 'Change time',
                  onSelect: () => {
                    setMore(false)
                    onClose()
                    router.push({ pathname: '/meetings/reschedule', params: { id: a._id, hostId: a.host, date: a.date, name: a.visitor.name } })
                  },
                },
              ]
            : []),
          ...others.map((entry) => ({
            label: entry.label,
            tone: entry.tone,
            onSelect: () => {
              setMore(false)
              if (entry.action === 'decline' || entry.action === 'cancel') setReasonFor(entry.action)
              else run(entry.action)
            },
          })),
        ]}
      />
    </>
  )
}
