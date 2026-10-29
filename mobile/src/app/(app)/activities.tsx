import { useRouter } from 'expo-router'
import { Award, Flag, Medal, Printer, Settings2, Trophy, Users } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate, formatDayKey, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { sharePdf } from '@/lib/sharePdf'
import { activityService, type Certificate } from '@/services/activityService'
import type { StudentRow } from '@/services/studentService'
import { useActivityEvents, useAddCertificate, useAddPoints, useCertificates, useClubs, useHouseRanking, useHouses, useRemoveCertificate } from '@/staff/activityQueries'
import { useStudentSearch } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ChipRail,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  NavBar,
  OptionList,
  SearchBar,
  StatusView,
  Surface,
  haptic,
  useToast,
} from '@/ui'

type View_ = 'houses' | 'clubs' | 'events' | 'certificates'
const ROLES = ['Participant', 'Winner', 'Runner-up', 'Third', 'Organiser', 'Volunteer']

/**
 * Houses (standings and points), clubs, events and certificates. Teachers in charge award house
 * points, record certificates from the field and print them as a PDF (one or a whole event's);
 * setting up houses, clubs and councils is under Set up.
 */
export default function ActivitiesScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const canWrite = staff.can('actvt.activities.write')
  const [view, setView] = useState<View_>('houses')
  const houses = useHouses()
  const ranking = useHouseRanking()
  const clubs = useClubs(view === 'clubs')
  const events = useActivityEvents(view === 'events')
  const certificates = useCertificates(view === 'certificates')
  const addPoints = useAddPoints()
  const addCertificate = useAddCertificate()
  const today = schoolToday()
  const removeCertificate = useRemoveCertificate()
  const [picked, setPicked] = useState<Certificate | null>(null)
  const [batch, setBatch] = useState(false)
  const [making, setMaking] = useState(false)

  const [sheet, setSheet] = useState<'points' | 'certificate' | 'house' | 'student' | 'role' | null>(null)
  const [houseId, setHouseId] = useState('')
  const [points, setPoints] = useState('')
  const [title, setTitle] = useState('')
  const [student, setStudent] = useState<StudentRow | null>(null)
  const [role, setRole] = useState('Participant')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const search = useStudentSearch(query.trim())
  const house = houses.data?.find((row) => row._id === houseId)

  const reset = () => {
    setTitle('')
    setPoints('')
    setStudent(null)
    setError(null)
  }

  const savePoints = async () => {
    const value = Number(points)
    if (!house) return setError('Choose the house.')
    if (!Number.isFinite(value) || value === 0) return setError('Enter the points (take points away with a minus).')
    if (!title.trim()) return setError('Write what they are for, such as "Inter-house quiz".')
    try {
      await addPoints.mutateAsync({ title: title.trim(), date: today, houseId: house._id, houseName: house.name, houseColor: house.color, points: value, category: 'Inter-house' })
      haptic.success()
      toast(`${value > 0 ? '+' : ''}${value} to ${house.name}`)
      setSheet(null)
      reset()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The points weren't saved. Try again.")
    }
  }

  const saveCertificate = async () => {
    if (!student) return setError('Choose the student.')
    if (!title.trim()) return setError('Write what it is for, such as "Science fair".')
    try {
      await addCertificate.mutateAsync({ title: title.trim(), participantName: student.name, studentId: student._id, className: student.class, section: student.section, role, issuedOn: today })
      haptic.success()
      toast(`Certificate recorded for ${student.name}`)
      setSheet(null)
      reset()
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "The certificate wasn't saved. Try again.")
    }
  }

  /** Certificates as a PDF to the share sheet (the server makes it, at most 200 at a time). */
  const printCertificates = async (rows: Certificate[], name: string) => {
    setPicked(null)
    setBatch(false)
    if (making || !rows.length) return
    setMaking(true)
    try {
      const bytes = await activityService.certificatesPdf(rows.slice(0, 200).map((row) => row._id))
      haptic.success()
      await sharePdf(bytes, `${name}.pdf`)
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "The certificates didn't download. Try again.", 'danger')
    } finally {
      setMaking(false)
    }
  }

  const doRemoveCertificate = async (row: Certificate) => {
    setPicked(null)
    try {
      await removeCertificate.mutateAsync(row._id)
      haptic.medium()
      toast('Certificate removed')
    } catch (failure) {
      haptic.error()
      toast(failure instanceof ApiError ? failure.message : "It wasn't removed. Try again.", 'danger')
    }
  }

  // Certificates grouped by what they are for, for printing a whole event's at once.
  const batches = Object.values(
    (certificates.data ?? []).reduce<Record<string, { title: string; rows: Certificate[] }>>((groups, row) => {
      const key = (row.title || 'Certificate').trim()
      ;(groups[key] ??= { title: key, rows: [] }).rows.push(row)
      return groups
    }, {}),
  )

  const standings = ranking.data?.standings ?? []
  const pickerSheet = sheet === 'house' || sheet === 'student' || sheet === 'role'
  const back = () => setSheet(sheet === 'house' ? 'points' : 'certificate')

  return (
    <MobileScreen
      refreshing={ranking.isRefetching}
      onRefresh={() => (ranking.refetch(), houses.refetch())}
      nav={
        <NavBar
          title="Activities"
          back={{ label: 'Back', onPress: router.back }}
          actions={staff.can('actvt.activities.write') ? [{ icon: Settings2, label: 'Set up', onPress: () => router.push('/activities-setup') }] : []}
        />
      }
      actionBar={
        canWrite && view === 'houses' && houses.data?.length ? (
          <ActionBar
            icon={Trophy}
            summary={standings[0] ? `${standings[0].houseName} leads` : 'House points'}
            detail={standings[0] ? `${standings[0].totalPoints} points` : undefined}
            label="Award points"
            onPress={() => (reset(), setSheet('points'))}
          />
        ) : canWrite && view === 'certificates' ? (
          <ActionBar icon={Award} summary={`${certificates.data?.length ?? 0} certificates`} label="Record a certificate" onPress={() => (reset(), setSheet('certificate'))} />
        ) : undefined
      }
      overlay={
        <>
          <ActionSheet
            open={Boolean(picked)}
            onClose={() => setPicked(null)}
            title={picked?.participantName ?? ''}
            message={picked ? [picked.title, picked.role].filter(Boolean).join(' · ') : undefined}
            actions={
              picked
                ? [
                    ...(canWrite ? [{ label: 'Share as PDF', onSelect: () => printCertificates([picked], `Certificate ${picked.participantName}`) }] : []),
                    ...(picked.studentId
                      ? [{ label: 'Open the student', onSelect: () => (setPicked(null), router.push({ pathname: '/student/[id]', params: { id: picked.studentId as string } })) }]
                      : []),
                    ...(staff.can('actvt.activities.delete') ? [{ label: 'Remove certificate', tone: 'danger' as const, onSelect: () => doRemoveCertificate(picked) }] : []),
                  ]
                : []
            }
          />
          <BottomSheet open={batch} onClose={() => setBatch(false)} title="Print certificates" detent="large">
            <OptionList
              label="Certificates for"
              footer="One page each, to share or print."
              value={null}
              onChange={(title) => {
                const group = batches.find((row) => row.title === title)
                if (group) void printCertificates(group.rows, `Certificates ${group.title}`)
              }}
              options={batches.map((group) => ({ value: group.title, label: group.title, meta: `${group.rows.length} ${group.rows.length === 1 ? 'certificate' : 'certificates'}` }))}
            />
          </BottomSheet>
          <BottomSheet
            open={sheet !== null}
            onClose={() => (pickerSheet ? back() : setSheet(null))}
            detent={sheet === 'student' ? 'large' : 'medium'}
            title={{ points: 'Award house points', certificate: 'Record a certificate', house: 'House', student: 'Student', role: 'For' }[sheet ?? 'points']}
            footer={
              sheet === 'points' ? (
                <MobileButton fullWidth loading={addPoints.isPending} onPress={savePoints}>
                  Award points
                </MobileButton>
              ) : sheet === 'certificate' ? (
                <MobileButton fullWidth loading={addCertificate.isPending} onPress={saveCertificate}>
                  Record certificate
                </MobileButton>
              ) : undefined
            }
          >
            {error && !pickerSheet ? (
              <Callout tone="danger" title="Not saved">
                {error}
              </Callout>
            ) : null}
            {sheet === 'points' ? (
              <View style={{ gap: space['space-4'] }}>
                <ListGroup items={[{ title: 'House', value: house?.name ?? 'Choose', onPress: () => setSheet('house') }]} />
                <MobileTextField label="Points" type="number" value={points} onChangeText={(text) => setPoints(text.replace(/[^0-9-]/g, ''))} hint="A minus takes points away." maxLength={5} />
                <MobileTextField label="For" value={title} onChangeText={setTitle} placeholder="Inter-house quiz" maxLength={120} />
              </View>
            ) : sheet === 'certificate' ? (
              <View style={{ gap: space['space-4'] }}>
                <ListGroup
                  items={[
                    { title: 'Student', value: student ? `${student.name}, ${classLabel(student.class, student.section)}` : 'Choose', lines: 2, onPress: () => setSheet('student') },
                    { title: 'As', value: role, onPress: () => setSheet('role') },
                  ]}
                />
                <MobileTextField label="For" value={title} onChangeText={setTitle} placeholder="Science fair" maxLength={120} />
              </View>
            ) : sheet === 'house' ? (
              <OptionList
                label="House"
                value={houseId || null}
                onChange={(value) => (setHouseId(value), setSheet('points'))}
                options={(houses.data ?? []).map((row) => ({ value: row._id, label: row.name }))}
              />
            ) : sheet === 'role' ? (
              <OptionList label="As" value={role} onChange={(value) => (setRole(value), setSheet('certificate'))} options={ROLES.map((value) => ({ value, label: value }))} />
            ) : sheet === 'student' ? (
              <View style={{ gap: space['space-3'] }}>
                <SearchBar label="Find a student" placeholder="Search students" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
                {query.trim().length < 2 ? (
                  <StatusView compact kind="empty" title="Type at least two letters" body="Search by name or admission number." />
                ) : (
                  <ListGroup
                    items={(search.data ?? []).map((row) => ({
                      title: row.name,
                      subtitle: [classLabel(row.class, row.section), row.rollNumber].join(' · '),
                      onPress: () => (setStudent(row), setQuery(''), setSheet('certificate')),
                    }))}
                  />
                )}
              </View>
            ) : null}
          </BottomSheet>
        </>
      }
    >
      <ChipRail
        label="Show"
        value={view}
        onChange={setView}
        items={[
          { id: 'houses', label: 'Houses' },
          { id: 'clubs', label: 'Clubs' },
          { id: 'events', label: 'Events' },
          { id: 'certificates', label: 'Certificates' },
        ]}
      />
      {view === 'houses' ? (
        ranking.isPending || houses.isPending ? (
          <CardSkeleton rows={4} />
        ) : ranking.isError ? (
          <LoadFailed what="House standings" error={ranking.error} onRetry={ranking.refetch} />
        ) : standings.length || houses.data?.length ? (
          <>
            <ListGroup
              header="Standings"
              items={(standings.length ? standings : (houses.data ?? []).map((row, index) => ({ houseId: row._id, houseName: row.name, totalPoints: 0, entries: 0, rank: index + 1 }))).map((row) => ({
                title: `${row.rank}. ${row.houseName}`,
                subtitle: `${row.entries} ${row.entries === 1 ? 'award' : 'awards'}`,
                value: `${row.totalPoints} pts`,
                icon: Flag,
                tile: 1,
              }))}
            />
            {ranking.data?.recent.length ? (
              <ListGroup
                header="Latest points"
                items={ranking.data.recent.slice(0, 10).map((entry) => ({
                  title: entry.title,
                  subtitle: `${entry.houseName} · ${entry.date ? formatDayKey(entry.date, { weekday: 'short' }) : ''}`,
                  value: `${entry.points > 0 ? '+' : ''}${entry.points}`,
                  lines: 2,
                }))}
              />
            ) : null}
          </>
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Flag} title="No houses yet" body="Houses are set up on the website once a session." />
          </Surface>
        )
      ) : view === 'clubs' ? (
        clubs.isPending ? (
          <CardSkeleton rows={3} />
        ) : clubs.isError ? (
          <LoadFailed what="Clubs" error={clubs.error} onRetry={clubs.refetch} />
        ) : clubs.data?.length ? (
          <ListGroup
            items={clubs.data.map((club) => ({
              title: club.name,
              subtitle: [club.incharge ? `In charge: ${club.incharge}` : null, club.meetingDay ? `Meets ${club.meetingDay}` : null].filter(Boolean).join(' · ') || club.description,
              lines: 2,
              icon: Users,
              tile: 1,
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Users} title="No clubs yet" body="Clubs the school runs show here." />
          </Surface>
        )
      ) : view === 'events' ? (
        events.isPending ? (
          <CardSkeleton rows={3} />
        ) : events.isError ? (
          <LoadFailed what="Events" error={events.error} onRetry={events.refetch} />
        ) : events.data?.length ? (
          <ListGroup
            items={[...events.data]
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .map((event) => ({
                title: event.title,
                subtitle: [event.date ? formatDayKey(event.date, { weekday: 'short' }) : null, event.venue, event.houseName || event.clubName].filter(Boolean).join(' · '),
                lines: 2,
                icon: Medal,
                tile: 1,
                badge:
                  event.status === 'completed'
                    ? { label: 'Completed', tone: 'success' as const }
                    : event.status === 'cancelled'
                      ? { label: 'Cancelled', tone: 'neutral' as const }
                      : { label: 'Planned', tone: 'info' as const },
              }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Medal} title="No events yet" body="Inter-house and club events show here." />
          </Surface>
        )
      ) : certificates.isPending ? (
        <CardSkeleton rows={3} />
      ) : certificates.isError ? (
        <LoadFailed what="Certificates" error={certificates.error} onRetry={certificates.refetch} />
      ) : certificates.data?.length ? (
        <>
          {canWrite ? (
            <ListGroup
              items={[
                { title: making ? 'Making the PDF…' : 'Print certificates', subtitle: 'All of an event’s at once', icon: Printer, tile: 1 as const, chevron: true, onPress: () => setBatch(true) },
              ]}
            />
          ) : null}
          <ListGroup
            items={certificates.data.slice(0, 100).map((certificate) => ({
              title: certificate.participantName,
              subtitle: [certificate.title, certificate.role, classLabel(certificate.className, certificate.section), certificate.issuedOn ? formatDate(certificate.issuedOn) : null]
                .filter(Boolean)
                .join(' · '),
              lines: 2,
              icon: Award,
              tile: 1,
              onPress: canWrite || certificate.studentId ? () => setPicked(certificate) : undefined,
            }))}
          />
        </>
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Award} title="No certificates yet" body={canWrite ? 'Record one when a student takes part or wins.' : 'Certificates the school gives show here.'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
