import { useRouter } from 'expo-router'
import { CalendarOff, CalendarPlus } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { SchoolDayRule } from '@/services/schoolDaysService'
import { useRemoveRule, useSchoolDays } from '@/staff/schoolDayQueries'
import { KIND_LABELS, ruleDates, ruleFor, weeklyText } from '@/staff/schoolDayUi'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ActionSheet, Dialog, Hero, ListGroup, MobileButton, MobileScreen, NavBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

/**
 * Days off and changes to the school day: holidays, vacations, sudden closures (a rain or
 * pollution order), half days and extra working days. The principal adds one from the phone and
 * can tell families at once. Weekly days off are set up once on the website.
 */
export default function SchoolDaysScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('core.schooldays.write')
  const days = useSchoolDays()
  const remove = useRemoveRule()
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [open, setOpen] = useState<SchoolDayRule | null>(null)
  const [removing, setRemoving] = useState<SchoolDayRule | null>(null)

  const data = days.data
  const today = data?.today ?? ''
  const rules = (data?.rules ?? []).filter((rule) => rule.status === 'active')
  const weekly = rules.filter((rule) => rule.kind === 'weekly_off')
  const dated = rules.filter((rule) => rule.kind !== 'weekly_off')
  const upcoming = dated.filter((rule) => rule.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const past = dated.filter((rule) => rule.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const shown = view === 'upcoming' ? upcoming : past
  const nextOff = upcoming.find((rule) => ['holiday', 'vacation', 'closure'].includes(rule.kind))

  const confirmRemove = async () => {
    if (!removing) return
    try {
      await remove.mutateAsync(removing.id)
      haptic.medium()
      toast(removing.eventId ? 'Removed. People who were told hear it is a school day again.' : 'Removed')
      setRemoving(null)
    } catch (error) {
      haptic.error()
      setRemoving(null)
      toast(error instanceof ApiError ? error.message : "It wasn't removed. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={days.isRefetching}
      onRefresh={days.refetch}
      nav={<NavBar title="School days" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        canWrite ? (
          <ActionBar
            icon={CalendarPlus}
            summary={upcoming.length ? `${upcoming.length} coming up` : 'Nothing coming up'}
            detail={data ? `${data.summary.working} school days this session` : undefined}
            label="Add a day off"
            onPress={() => router.push('/school-days/new')}
          />
        ) : undefined
      }
      overlay={
        <>
          <ActionSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open ? open.title || KIND_LABELS[open.kind] : ''}
            message={open ? `${ruleDates(open)} · ${ruleFor(open)}` : undefined}
            actions={
              open && canWrite
                ? [
                    {
                      label: 'Edit',
                      onSelect: () => {
                        setOpen(null)
                        router.push({ pathname: '/school-days/new', params: { id: open.id } })
                      },
                    },
                    { label: 'Remove', tone: 'danger', onSelect: () => (setOpen(null), setRemoving(open)) },
                  ]
                : []
            }
          />
          <Dialog
            open={Boolean(removing)}
            onClose={() => setRemoving(null)}
            tone="danger"
            title={`Remove ${removing?.title || 'this day'}?`}
            description={removing?.eventId ? 'It becomes a school day again, and everyone who was told hears about it.' : 'It becomes a school day again.'}
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setRemoving(null)}>
                  Keep it
                </MobileButton>
                <MobileButton variant="destructive" loading={remove.isPending} onPress={confirmRemove}>
                  Remove
                </MobileButton>
              </>
            }
          />
        </>
      }
    >
      {days.isPending ? (
        <CardSkeleton rows={4} />
      ) : days.isError || !data ? (
        <LoadFailed what="School days" error={days.error} onRetry={days.refetch} />
      ) : (
        <>
          <Hero
            tone="surface"
            icon={CalendarOff}
            label="Next day off"
            value={nextOff ? nextOff.title || KIND_LABELS[nextOff.kind] : 'None planned'}
            detail={nextOff ? `${ruleDates(nextOff)} · ${ruleFor(nextOff)}` : 'Holidays and closures you add show here.'}
          />
          <SegmentedControl
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'upcoming', label: upcoming.length ? `Coming up ${upcoming.length}` : 'Coming up' },
              { value: 'past', label: 'Past' },
            ]}
          />
          {shown.length ? (
            <ListGroup
              items={shown.map((rule) => ({
                title: rule.title || KIND_LABELS[rule.kind],
                subtitle: [ruleDates(rule), rule.title ? KIND_LABELS[rule.kind] : null, ruleFor(rule)].filter(Boolean).join(' · '),
                lines: 2,
                badge: rule.eventId ? { label: 'Announced', tone: 'info' as const } : undefined,
                onPress: canWrite ? () => setOpen(rule) : undefined,
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView
                compact
                kind="empty"
                icon={CalendarOff}
                title={view === 'upcoming' ? 'No days off coming up' : 'No past days off this session'}
                body={canWrite ? 'Add a holiday, a closure or a half day.' : 'Days off the school adds show here.'}
              />
            </Surface>
          )}
          {weekly.length ? (
            <ListGroup
              header="Every week"
              footer="Weekly days off are set once a session in Settings on the website."
              items={weekly.map((rule) => ({ title: rule.title || weeklyText(rule), subtitle: rule.title ? weeklyText(rule) : undefined }))}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
