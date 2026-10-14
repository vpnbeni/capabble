import React, { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { UserX } from 'lucide-react'
import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  StatCard,
  formatDate,
  formatINR,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import dutiesService from '../services/dutiesService'
import teacherService, { type Teacher } from '../services/teacherService'
import { useRemunerationRates } from '../hooks/useRemunerationRates'

const DUTY_TABS = [
  { key: 'CS', dutyType: 'Centre Superintendent' },
  { key: 'DCS', dutyType: 'Deputy Centre Superintendent' },
  { key: 'OBR', dutyType: 'Observer' },
  { key: 'ASI', dutyType: 'Invigilator' },
  { key: 'ASC', dutyType: 'ASI (CCTV)' },
  { key: 'ASFM', dutyType: 'ASI (Frisking Male)' },
  { key: 'ASFF', dutyType: 'ASI (Frisking Female)' },
  { key: 'CLR', dutyType: 'Clerk' },
  { key: 'CL4', dutyType: 'Class IV' },
] as const

/** Zero amounts show "—", as before. */
const money = (value: number) => (value ? formatINR(value) : '—')

const toDateKey = (value: string) => String(value || '').trim().slice(0, 10)

const formatDateLabel = (dateKey: string) => {
  const [year, month, day] = String(dateKey || '').split('-')
  if (!year || !month || !day) return dateKey
  return `${day}.${month}.${year.slice(-2)}`
}

const getDayLabel = (dateKey: string) => {
  const d = new Date(dateKey)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { weekday: 'short' })
}

const normalizeDutyType = (value: string | undefined) => String(value || '').trim()
const hasDutyType = (teacher: Teacher | null | undefined, dutyType: string) => {
  if (!teacher) return false
  const target = normalizeDutyType(dutyType)
  if (!target) return false
  if (normalizeDutyType(teacher.dutyType) === target) return true
  if (!Array.isArray(teacher.dutyHistory)) return false
  return teacher.dutyHistory.some((d) => normalizeDutyType(d) === target)
}

const sumRates = (
  byDutyType: Record<string, { remuneration: number; conveyance: number; refreshment: number }>,
  keys: string[]
) => {
  return keys.reduce(
    (acc, key) => {
      const rate = byDutyType[key] || { remuneration: 0, conveyance: 0, refreshment: 0 }
      acc.remuneration += Number(rate.remuneration || 0)
      acc.conveyance += Number(rate.conveyance || 0)
      acc.refreshment += Number(rate.refreshment || 0)
      return acc
    },
    { remuneration: 0, conveyance: 0, refreshment: 0 }
  )
}

type DayRow = {
  dateKey: string
  dateLabel: string
  dayLabel: string
  remuneration: number
  conveyance: number
  refreshment: number
}

const RemunerationDetails: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const functionaryId = String(id || '').trim()
  const { data: ratesData } = useRemunerationRates()
  const ratesByDutyType = ratesData?.byDutyType ?? {}

  const teacherQuery = useQuery({
    queryKey: ['teacher', functionaryId] as const,
    queryFn: async (): Promise<Teacher | null> => {
      if (!functionaryId) return null
      const res = await teacherService.getById(functionaryId)
      return (res?.data?.data ?? res?.data ?? null) as Teacher | null
    },
    enabled: !!functionaryId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const selectionQueries = useQueries({
    queries: DUTY_TABS.map((tab) => ({
      queryKey: ['duties', 'selections', tab.dutyType] as const,
      queryFn: () => dutiesService.getDutySelections(tab.dutyType),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      enabled: !!functionaryId,
    })),
  })

  const isLoading = teacherQuery.isLoading || selectionQueries.some((q) => q.isLoading)
  const error = (teacherQuery.error as Error | null) || (selectionQueries.find((q) => q.error)?.error as Error | undefined)

  const sections = useMemo(() => {
    const result: Array<{ dutyType: string; days: DayRow[] }> = []
    if (!functionaryId) return result

    DUTY_TABS.forEach((tab, idx) => {
      // If the functionary was never assigned this duty type historically, don't show it
      // even if stray selections exist.
      if (!hasDutyType(teacherQuery.data, tab.dutyType)) return
      const selectionMap = selectionQueries[idx]?.data ?? {}
      const dateSet = new Set<string>()
      for (const [slotKey, checked] of Object.entries(selectionMap)) {
        if (!checked) continue
        const [funcIdRaw, dateRaw] = String(slotKey || '').split('::')
        const funcId = String(funcIdRaw || '').trim()
        if (!funcId || funcId !== functionaryId) continue
        const dateKey = toDateKey(dateRaw || '')
        if (dateKey) dateSet.add(dateKey)
      }

      const rate =
        tab.dutyType === 'Centre Superintendent'
          ? (() => {
            const sums = sumRates(ratesByDutyType, ['CS', 'QP Collection', 'AB Deposit'])
            const csBase = ratesByDutyType['Centre Superintendent'] || { remuneration: 0, conveyance: 0, refreshment: 0 }
            return {
              remuneration: sums.remuneration,
              conveyance: sums.conveyance,
              refreshment: Number(csBase.refreshment || 0),
            }
          })()
          : (ratesByDutyType[tab.dutyType] || { remuneration: 0, conveyance: 0, refreshment: 0 })
      const days: DayRow[] = Array.from(dateSet)
        .sort((a, b) => a.localeCompare(b))
        .map((dateKey) => ({
          dateKey,
          dateLabel: formatDateLabel(dateKey),
          dayLabel: getDayLabel(dateKey),
          remuneration: Number(rate.remuneration || 0),
          conveyance: Number(rate.conveyance || 0),
          refreshment: Number(rate.refreshment || 0),
        }))

      if (days.length > 0) result.push({ dutyType: tab.dutyType, days })
    })

    return result
  }, [functionaryId, selectionQueries, ratesByDutyType, teacherQuery.data])

  const overallTotals = useMemo(() => {
    let remuneration = 0
    let conveyance = 0
    let refreshment = 0

    for (const section of sections) {
      for (const day of section.days) {
        remuneration += day.remuneration
        conveyance += day.conveyance
        refreshment += day.refreshment
      }
    }

    return {
      remuneration,
      conveyance,
      refreshment,
      total: remuneration + conveyance + refreshment,
    }
  }, [sections])

  const teacher = teacherQuery.data
  const back = { label: 'Remuneration', onClick: () => navigate('/remuneration') }

  const columns: DataTableColumn<DayRow>[] = [
    { key: 'date', header: 'Date', mobile: 'title', render: (row) => formatDate(row.dateKey) },
    { key: 'day', header: 'Day', mobile: 'subtitle', render: (row) => row.dayLabel },
    { key: 'remuneration', header: 'Remuneration', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.remuneration) },
    { key: 'conveyance', header: 'Conveyance', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.conveyance) },
    { key: 'refreshment', header: 'Refreshment', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.refreshment) },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      align: 'right',
      mobile: 'aside',
      render: (row) => <span className="cb-strong">{money(row.remuneration + row.conveyance + row.refreshment)}</span>,
    },
  ]

  if (isLoading) {
    return (
      <Page>
        <PageHeader back={back} title="Remuneration details" />
        <Card>
          <CardLoading label="Loading remuneration…" />
        </Card>
      </Page>
    )
  }

  if (error || !teacher) {
    return (
      <Page>
        <PageHeader back={back} title="Remuneration details" />
        {error ? (
          <Banner tone="danger" title="Couldn't load remuneration details">
            Refresh the page to try again.
          </Banner>
        ) : (
          <Card>
            <EmptyState
              icon={UserX}
              title="Functionary not found"
              body="They may have been removed. Go back to remuneration and pick someone else."
            />
          </Card>
        )}
      </Page>
    )
  }

  const oasisId = String(teacher.oasisId || '').trim()

  return (
    <Page>
      <PageHeader back={back} title={orDash(teacher.name)} subtitle={`Oasis ID ${oasisId || '—'}`} />

      <div className="cb-stats">
        <StatCard label="Remuneration" value={money(overallTotals.remuneration)} />
        <StatCard label="Conveyance" value={money(overallTotals.conveyance)} />
        <StatCard label="Refreshment" value={money(overallTotals.refreshment)} />
        <StatCard label="Grand total" value={money(overallTotals.total)} />
      </div>

      {sections.length === 0 ? (
        <Card>
          <EmptyState
            title="No saved duties for this functionary"
            body="Assign and save their duties on the Duties page to see remuneration here."
          />
        </Card>
      ) : (
        sections.map((section) => (
          <Card
            key={section.dutyType}
            flush
            title={section.dutyType}
            action={
              <Badge dot={false}>
                {section.days.length} day{section.days.length !== 1 ? 's' : ''}
              </Badge>
            }
          >
            <DataTable
              caption={section.dutyType}
              columns={columns}
              rows={section.days}
              getRowKey={(row) => row.dateKey}
            />
          </Card>
        ))
      )}
    </Page>
  )
}

export default RemunerationDetails
