import { getStaffTypeId, STAFF_TYPE_OPTIONS, type StaffTypeId } from '@capabble/shared/staffTypes'
import { usePreventRemove, useRouter } from 'expo-router'
import { CalendarDays, CalendarOff, UserCheck, Users } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useSaveStaffAttendance, useStaffAttendance, useStaffDirectory } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  Avatar,
  BottomSheet,
  Callout,
  ChipRail,
  Hero,
  ListGroup,
  MobileScreen,
  MonthPicker,
  NavBar,
  SearchBar,
  SegmentedControl,
  StatusView,
  Surface,
  haptic,
  useFixedColumn,
  useToast,
} from '@/ui'

type Mark = 'P' | 'A'

/**
 * Staff attendance for one day (today by default): everyone present, tap who is absent, save.
 * Saving replaces that day's marks for every active staff member listed, as the website does
 * for a month. Logins that can only read see the day's absences without the switches.
 */
export default function StaffAttendanceScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canEdit = staff.can('attnd.staff.write')
  const today = schoolToday()
  const [date, setDate] = useState(today)
  const directory = useStaffDirectory()
  const day = useStaffAttendance(date)
  const save = useSaveStaffAttendance()
  const segmentWidth = useFixedColumn(132)

  const [edits, setEdits] = useState<Map<string, Mark>>(() => new Map())
  const [group, setGroup] = useState<'all' | StaffTypeId>('all')
  const [query, setQuery] = useState('')
  const [picking, setPicking] = useState(false)
  const [leaving, setLeaving] = useState<null | (() => void)>(null)
  const [error, setError] = useState<string | null>(null)
  const dirty = edits.size > 0
  const allowLeaving = usePreventRemove(dirty && !save.isPending, ({ repeat }) => setLeaving(() => repeat))

  const active = useMemo(
    () => (directory.data ?? []).filter((member) => member.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [directory.data],
  )
  const absent = useMemo(() => {
    const next = new Set(day.data?.absentIds ?? [])
    edits.forEach((value, id) => (value === 'A' ? next.add(id) : next.delete(id)))
    return next
  }, [day.data, edits])
  const groups = STAFF_TYPE_OPTIONS.map((option) => ({ ...option, count: active.filter((member) => getStaffTypeId(member) === option.id).length })).filter(
    (option) => option.count,
  )
  const q = query.trim().toLowerCase()
  const shown = active.filter(
    (member) =>
      (group === 'all' || getStaffTypeId(member) === group) &&
      (!q || member.name.toLowerCase().includes(q) || String(member.employeeId ?? '').toLowerCase().includes(q) || String(member.designation ?? '').toLowerCase().includes(q)),
  )
  const absentCount = active.filter((member) => absent.has(member._id)).length
  const off = day.data?.day && !day.data.day.working

  const mark = (id: string, value: Mark) => {
    setEdits((current) => new Map(current).set(id, value))
    setError(null)
  }

  const changeDate = (next: string) => {
    setPicking(false)
    if (next === date) return
    const go = () => {
      setEdits(new Map())
      setDate(next)
    }
    if (dirty) setLeaving(() => go)
    else go()
  }

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({ date, staffIds: active.map((member) => member._id), absentIds: active.filter((member) => absent.has(member._id)).map((member) => member._id) })
      haptic.success()
      setEdits(new Map())
      allowLeaving()
      toast(`Staff attendance saved for ${date === today ? 'today' : formatDayKey(date, { weekday: 'short' })}`)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "Attendance didn't save. Check your connection and try again.")
    }
  }

  return (
    <MobileScreen
      refreshing={directory.isRefetching || day.isRefetching}
      onRefresh={() => {
        directory.refetch()
        if (!dirty) day.refetch()
      }}
      nav={
        <NavBar
          title="Staff attendance"
          back={{ label: 'Back', onPress: router.back }}
          actions={[{ icon: CalendarDays, label: 'Choose a day', onPress: () => setPicking(true) }]}
        />
      }
      actionBar={
        canEdit && dirty && active.length ? (
          <ActionBar
            icon={UserCheck}
            summary={`${active.length - absentCount} of ${active.length} present`}
            detail={`${formatDayKey(date, { weekday: 'short' })} · ${absentCount} absent`}
            label={save.isPending ? 'Saving…' : 'Save attendance'}
            onPress={submit}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet open={picking} onClose={() => setPicking(false)} title="Choose a day">
            <MonthPicker value={date} today={today} onChange={(value) => changeDate(value > today ? today : value)} />
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard your marks?"
            message="Staff attendance for this day isn't saved yet."
            actions={[
              {
                label: 'Discard marks',
                tone: 'danger',
                onSelect: () => {
                  setEdits(new Map())
                  leaving?.()
                },
              },
            ]}
            cancelLabel="Keep marking"
          />
        </>
      }
    >
      {error ? (
        <Callout tone="danger" title="Attendance wasn't saved">
          {error}
        </Callout>
      ) : null}
      {directory.isPending || day.isPending ? (
        <CardSkeleton rows={6} />
      ) : directory.isError ? (
        <LoadFailed what="The staff list" error={directory.error} onRetry={directory.refetch} />
      ) : day.isError ? (
        <LoadFailed what="This day's attendance" error={day.error} onRetry={day.refetch} />
      ) : !active.length ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title="No staff yet" body="Staff show here once the office adds them on the website." />
        </Surface>
      ) : off ? (
        <Hero tone="surface" icon={CalendarOff} label={date === today ? 'No school today' : formatDayKey(date, { weekday: 'long' })} value={day.data?.day?.label || 'Day off'} />
      ) : (
        <>
          <Hero
            tone="surface"
            icon={UserCheck}
            label={date === today ? 'Staff today' : formatDayKey(date, { weekday: 'long', month: 'long' })}
            value={absentCount ? `${absentCount} absent` : 'All present'}
            detail={`${active.length - absentCount} of ${active.length} present${dirty ? ' · not saved yet' : ''}`}
          />
          <View style={{ gap: space['space-3'] }}>
            {active.length > 12 ? <SearchBar placeholder={`Search ${active.length} staff`} value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
            {groups.length > 1 ? (
              <ChipRail
                label="Staff group"
                value={group}
                onChange={setGroup}
                items={[{ id: 'all' as const, label: 'All', count: active.length }, ...groups.map((option) => ({ id: option.id, label: option.label, count: option.count }))]}
              />
            ) : null}
          </View>
          {shown.length ? (
            <ListGroup
              footer={canEdit ? 'Everyone is present unless you mark them absent.' : undefined}
              items={shown.map((member) => {
                const value: Mark = absent.has(member._id) ? 'A' : 'P'
                return {
                  title: member.name,
                  subtitle: [member.designation, member.employeeId].filter(Boolean).join(' · ') || undefined,
                  avatar: <Avatar name={member.name} size={36} />,
                  badge: !canEdit && value === 'A' ? { label: 'Absent', tone: 'danger' as const } : undefined,
                  onPress: canEdit
                    ? () => {
                        haptic.selection()
                        mark(member._id, value === 'A' ? 'P' : 'A')
                      }
                    : undefined,
                  accessoryWidth: segmentWidth,
                  accessory: canEdit ? (
                    <SegmentedControl
                      label={`${member.name}: attendance`}
                      value={value}
                      onChange={(next) => mark(member._id, next)}
                      options={[
                        { value: 'P', label: 'Present' },
                        { value: 'A', label: 'Absent' },
                      ]}
                    />
                  ) : undefined,
                }
              })}
            />
          ) : (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={Users} title="No one matches" body="Check the name, employee ID or designation." />
            </Surface>
          )}
        </>
      )}
    </MobileScreen>
  )
}
