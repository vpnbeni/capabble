import React, { useMemo, useCallback, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  Page,
  StatCard,
  formatINR,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading } from '@/components/exmcl/ExmclUi'
import dutiesService from '../services/dutiesService'
import { useCentreDetails } from '../hooks/useCentreDetails'
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

type RemunerationRow = {
  functionaryId: string
  functionaryName: string
  oasisId: string
  functionaryType: string
  schoolCode: string
  schoolName: string
  dutyCount: number
  remuneration: number
  conveyance: number
  refreshment: number
}

type RemunerationGroup = {
  key: string
  title: string
  dutyTypes: string[]
}

const normalizeValue = (value: string | undefined) => String(value || '').trim().toLowerCase()

const REMUNERATION_GROUPS: RemunerationGroup[] = [
  { key: 'cs', title: 'Centre Superintendent', dutyTypes: ['Centre Superintendent'] },
  { key: 'dcs', title: 'Deputy Centre Superintendent', dutyTypes: ['Deputy Centre Superintendent'] },
  { key: 'inv', title: 'Invigilators', dutyTypes: ['Invigilator'] },
  { key: 'asi_cctv', title: 'ASI CCTV', dutyTypes: ['ASI (CCTV)'] },
  { key: 'asi_frisk', title: 'ASI Frisking (Male + Female)', dutyTypes: ['ASI (Frisking Male)', 'ASI (Frisking Female)'] },
  { key: 'clerk', title: 'Clerk', dutyTypes: ['Clerk'] },
  { key: 'class_iv', title: 'Class IV', dutyTypes: ['Class IV'] },
]

const DUTIES_SUMMARY_ITEMS = [
  { dutyType: 'Centre Superintendent', groupKey: 'cs' },
  { dutyType: 'Deputy Centre Superintendent', groupKey: 'dcs' },
  { dutyType: 'Invigilator', groupKey: 'inv' },
  { dutyType: 'ASI (CCTV)', groupKey: 'asi_cctv' },
  { dutyType: 'ASI (Frisking Male)', groupKey: 'asi_frisk' },
  { dutyType: 'ASI (Frisking Female)', groupKey: 'asi_frisk' },
  { dutyType: 'Clerk', groupKey: 'clerk' },
  { dutyType: 'Class IV', groupKey: 'class_iv' },
] as const

/** Zero amounts show "—", as before. */
const money = (value: number) => (value ? formatINR(value) : '—')

type DutySummaryRow = {
  dutyType: string
  groupKey: string
  dutyCount: number
  remuneration: number
  conveyance: number
  refreshment: number
  total: number
}

type InvigilatorFilter = 'all' | 'self' | 'outside'
const normalizeDutyType = (value: string | undefined) => String(value || '').trim()
const hasDutyType = (teacher: Teacher | undefined, dutyType: string) => {
  if (!teacher) return false
  const target = normalizeDutyType(dutyType)
  if (!target) return false
  if (normalizeDutyType(teacher.dutyType) === target) return true
  if (!Array.isArray(teacher.dutyHistory)) return false
  return teacher.dutyHistory.some((d) => normalizeDutyType(d) === target)
}

const getDutyLabelsForGroup = (groupKey: string): string[] => {
  switch (groupKey) {
    case 'cs':
      return ['CS', 'QP Collection', 'AB Deposit']
    case 'dcs':
      return ['DCS']
    case 'inv':
      return ['Invigilator']
    case 'asi_cctv':
      return ['ASI (CCTV)']
    case 'asi_frisk':
      return ['ASI (Frisking)']
    case 'clerk':
      return ['Clerk']
    case 'class_iv':
      return ['Class IV']
    default:
      return ['—']
  }
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

const Remuneration: React.FC = () => {
  const navigate = useNavigate()
  const { data: centreDetails } = useCentreDetails()
  const { data: ratesData } = useRemunerationRates()
  const ratesByDutyType = ratesData?.byDutyType ?? {}
  const [invigilatorFilter, setInvigilatorFilter] = useState<InvigilatorFilter>('all')
  const teachersQuery = useQuery({
    queryKey: ['teachers', 'all-for-remuneration'] as const,
    queryFn: async (): Promise<Teacher[]> => {
      const all: Teacher[] = []
      let page = 1
      let totalPages = 1
      do {
        const res = await teacherService.getAll({ page, limit: 100, sort: 'name' })
        all.push(...(res?.items || []))
        totalPages = Number(res?.totalPages || 1)
        page += 1
      } while (page <= totalPages)
      return all
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const teachers = teachersQuery.data ?? []

  const selectionQueries = useQueries({
    queries: DUTY_TABS.map((tab) => ({
      queryKey: ['duties', 'selections', tab.dutyType] as const,
      queryFn: () => dutiesService.getDutySelections(tab.dutyType),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  })

  const loadingSelections = selectionQueries.some((q) => q.isLoading)
  const selectionsError = selectionQueries.find((q) => q.error)?.error as Error | undefined

  const rows = useMemo<RemunerationRow[]>(() => {
    const selectionByDutyType = new Map<string, Record<string, boolean>>()
    DUTY_TABS.forEach((tab, index) => {
      const data = selectionQueries[index]?.data
      selectionByDutyType.set(tab.dutyType, (data && typeof data === 'object') ? data : {})
    })

    // Count duties per (functionaryId, dutyType) so duties remain valid
    // even if the functionary's current dutyType changes later.
    // Saved selections use keys like "functionaryId::dateKey".
    const dutyCountByFunctionaryAndType = new Map<string, Map<string, number>>()

    for (const tab of DUTY_TABS) {
      const selectionMap = selectionByDutyType.get(tab.dutyType) || {}
      for (const [slotKey, checked] of Object.entries(selectionMap)) {
        if (!checked) continue
        const rawFunctionaryId = slotKey.split('::')[0]
        const functionaryId = String(rawFunctionaryId || '').trim()
        if (!functionaryId) continue
        if (!dutyCountByFunctionaryAndType.has(functionaryId)) {
          dutyCountByFunctionaryAndType.set(functionaryId, new Map())
        }
        const byType = dutyCountByFunctionaryAndType.get(functionaryId)!
        byType.set(tab.dutyType, (byType.get(tab.dutyType) || 0) + 1)
      }
    }

    const teacherById = new Map<string, Teacher>()
    teachers.forEach((t) => {
      const id = String(t?._id || '').trim()
      if (!id) return
      teacherById.set(id, t)
    })

    // Only include functionaries that still exist in the fetched teacher list
    // and have at least one saved selection (no 0-duty rows).
    const computed: RemunerationRow[] = []
    for (const [functionaryId, byType] of dutyCountByFunctionaryAndType.entries()) {
      const teacher = teacherById.get(functionaryId)
      if (!teacher) continue
      for (const [dutyType, dutyCount] of byType.entries()) {
        if (!dutyCount) continue
        // Guard against stray selections saved under the wrong dutyType.
        // Only count duties for types that exist in the functionary's current dutyType or dutyHistory.
        if (!hasDutyType(teacher, dutyType)) continue
        const effectiveRate =
          dutyType === 'Centre Superintendent'
            ? (() => {
              const sums = sumRates(ratesByDutyType, ['CS', 'QP Collection', 'AB Deposit'])
              const csBase = ratesByDutyType['Centre Superintendent'] || { remuneration: 0, conveyance: 0, refreshment: 0 }
              return {
                remuneration: sums.remuneration,
                conveyance: sums.conveyance,
                refreshment: Number(csBase.refreshment || 0),
              }
            })()
            : (ratesByDutyType[dutyType] || { remuneration: 0, conveyance: 0, refreshment: 0 })
        const remuneration = dutyCount * Number(effectiveRate.remuneration || 0)
        const conveyance = dutyCount * Number(effectiveRate.conveyance || 0)
        const refreshment = dutyCount * Number(effectiveRate.refreshment || 0)
        computed.push({
          functionaryId,
          functionaryName: String(teacher.name || '').trim() || '—',
          oasisId: dutyType === 'Class IV' ? 'N/A' : (teacher.oasisId || '—'),
          functionaryType: dutyType,
          schoolCode: String(teacher.schoolCode || '').trim(),
          schoolName: String(teacher.schoolName || '').trim(),
          dutyCount,
          remuneration,
          conveyance,
          refreshment,
        })
      }
    }

    computed.sort((a, b) => {
      const nameDiff = a.functionaryName.localeCompare(b.functionaryName, undefined, { sensitivity: 'base' })
      if (nameDiff !== 0) return nameDiff
      return a.functionaryType.localeCompare(b.functionaryType, undefined, { sensitivity: 'base' })
    })

    return computed
  }, [teachers, selectionQueries, ratesByDutyType])

  const invigilatorGroups = useMemo(() => {
    const invRows = rows.filter((r) => String(r.functionaryType || '').trim() === 'Invigilator')
    const centreSchoolCode = normalizeValue(centreDetails?.centreSchoolCode)
    const centreName = normalizeValue(centreDetails?.centreName)

    const isSelf = (row: RemunerationRow) => {
      const rowSchoolCode = normalizeValue(row.schoolCode)
      const rowSchoolName = normalizeValue(row.schoolName)
      if (centreSchoolCode) return rowSchoolCode === centreSchoolCode
      if (centreName) return rowSchoolName === centreName
      return false
    }

    const selfSchool = invRows.filter(isSelf)
    const outsideSchool = invRows.filter((r) => !isSelf(r))

    return { selfSchool, outsideSchool }
  }, [centreDetails?.centreName, centreDetails?.centreSchoolCode, rows])

  const grouped = useMemo(() => {
    const byKey: Array<{ group: RemunerationGroup; rows: RemunerationRow[] }> = []
    for (const group of REMUNERATION_GROUPS) {
      const set = new Set(group.dutyTypes.map((t) => t.toLowerCase()))
      const groupRows = rows.filter((r) => set.has(String(r.functionaryType || '').toLowerCase()))
      byKey.push({ group, rows: groupRows })
    }
    return byKey
  }, [rows])

  const dutiesSummary = useMemo(() => {
    const summaryRows: DutySummaryRow[] = DUTIES_SUMMARY_ITEMS.map(({ dutyType, groupKey }) => {
      const matchingRows = rows.filter((row) => normalizeDutyType(row.functionaryType) === dutyType)
      const dutyCount = matchingRows.reduce((sum, row) => sum + Number(row.dutyCount || 0), 0)
      const remuneration = matchingRows.reduce((sum, row) => sum + Number(row.remuneration || 0), 0)
      const conveyance = matchingRows.reduce((sum, row) => sum + Number(row.conveyance || 0), 0)
      const refreshment = matchingRows.reduce((sum, row) => sum + Number(row.refreshment || 0), 0)

      return {
        dutyType,
        groupKey,
        dutyCount,
        remuneration,
        conveyance,
        refreshment,
        total: remuneration + conveyance + refreshment,
      }
    })

    const grandTotal = summaryRows.reduce(
      (acc, row) => {
        acc.dutyCount += row.dutyCount
        acc.remuneration += row.remuneration
        acc.conveyance += row.conveyance
        acc.refreshment += row.refreshment
        acc.total += row.total
        return acc
      },
      { dutyCount: 0, remuneration: 0, conveyance: 0, refreshment: 0, total: 0 }
    )

    return { rows: summaryRows, grandTotal }
  }, [rows])

  const isLoading = teachersQuery.isLoading || loadingSelections
  const error = (teachersQuery.error as Error | null) || teachersQuery.error || selectionsError

  const openDetails = useCallback((functionaryId: string) => {
    const id = String(functionaryId || '').trim()
    if (!id) return
    navigate(`/remuneration/${id}`)
  }, [navigate])

  const scrollToGroup = useCallback((groupKey: string) => {
    const element = document.getElementById(`remuneration-group-${groupKey}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const summaryColumns: DataTableColumn<DutySummaryRow>[] = [
    { key: 'dutyType', header: 'Duty type', mobile: 'title', render: (row) => <span className="cb-strong">{row.dutyType}</span> },
    { key: 'dutyCount', header: 'Duties', numeric: true, align: 'right', mobile: 'aside', render: (row) => (row.dutyCount ? row.dutyCount : '—') },
    { key: 'remuneration', header: 'Remuneration', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.remuneration) },
    { key: 'conveyance', header: 'Conveyance', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.conveyance) },
    { key: 'refreshment', header: 'Refreshment', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.refreshment) },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (row) => money(row.total) },
  ]

  const functionaryColumn: DataTableColumn<RemunerationRow> = {
    key: 'functionary',
    header: 'Functionary',
    mobile: 'title',
    render: (row) => <Entity primary={row.functionaryName} secondary={row.oasisId === '—' || row.oasisId === 'N/A' ? undefined : `Oasis ID ${row.oasisId}`} />,
  }
  const dutiesColumn: DataTableColumn<RemunerationRow> = {
    key: 'dutyCount',
    header: 'Duties',
    numeric: true,
    align: 'right',
    mobile: 'subtitle',
    render: (row) => `${row.dutyCount} ${row.dutyCount === 1 ? 'duty' : 'duties'}`,
  }
  const totalColumn: DataTableColumn<RemunerationRow> = {
    key: 'total',
    header: 'Total',
    numeric: true,
    align: 'right',
    mobile: 'aside',
    render: (row) => <span className="cb-strong">{money(row.remuneration + row.conveyance + row.refreshment)}</span>,
  }

  const columnsForGroup = (groupKey: string): DataTableColumn<RemunerationRow>[] => {
    if (groupKey === 'cs') {
      // Centre Superintendent: remuneration and conveyance are broken down per CS duty.
      const csDuties = ['CS', 'QP Collection', 'AB Deposit'] as const
      const refreshmentPerDay = Number((ratesByDutyType['Centre Superintendent']?.refreshment ?? 0) || 0)
      return [
        functionaryColumn,
        dutiesColumn,
        {
          key: 'duty',
          header: 'Duty',
          mobile: 'hidden',
          render: () => csDuties.map((label) => <div key={label}>{label}</div>),
        },
        {
          key: 'remuneration',
          header: 'Remuneration',
          numeric: true,
          align: 'right',
          render: (row) =>
            csDuties.map((label) => (
              <div key={label}>{money(row.dutyCount * Number(ratesByDutyType[label]?.remuneration || 0))}</div>
            )),
        },
        {
          key: 'conveyance',
          header: 'Conveyance',
          numeric: true,
          align: 'right',
          render: (row) =>
            csDuties.map((label) => (
              <div key={label}>{money(row.dutyCount * Number(ratesByDutyType[label]?.conveyance || 0))}</div>
            )),
        },
        {
          key: 'refreshment',
          header: 'Refreshment',
          numeric: true,
          align: 'right',
          mobile: 'hidden',
          render: (row) => money(row.dutyCount * refreshmentPerDay),
        },
        totalColumn,
      ]
    }

    const moneyColumns: DataTableColumn<RemunerationRow>[] = [
      { key: 'remuneration', header: 'Remuneration', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.remuneration) },
      { key: 'conveyance', header: 'Conveyance', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.conveyance) },
      { key: 'refreshment', header: 'Refreshment', numeric: true, align: 'right', mobile: 'hidden', render: (row) => money(row.refreshment) },
      totalColumn,
    ]

    if (groupKey === 'inv') {
      return [
        functionaryColumn,
        {
          key: 'school',
          header: 'School',
          render: (row) => (
            <Badge dot={false}>{invigilatorGroups.selfSchool.includes(row) ? 'Self school' : 'Outside school'}</Badge>
          ),
        },
        dutiesColumn,
        ...moneyColumns,
      ]
    }

    return [
      functionaryColumn,
      dutiesColumn,
      {
        key: 'duty',
        header: 'Duty',
        mobile: 'hidden',
        render: () => getDutyLabelsForGroup(groupKey).map((label) => <div key={label}>{label}</div>),
      },
      ...moneyColumns,
    ]
  }

  const invigilatorRows =
    invigilatorFilter === 'self'
      ? invigilatorGroups.selfSchool
      : invigilatorFilter === 'outside'
        ? invigilatorGroups.outsideSchool
        : [...invigilatorGroups.selfSchool, ...invigilatorGroups.outsideSchool]

  const { grandTotal } = dutiesSummary

  return (
    <Page>

      {isLoading ? (
        <Card>
          <CardLoading label="Loading remuneration…" />
        </Card>
      ) : error ? (
        <Banner tone="danger" title="Couldn't load remuneration data">
          Refresh the page to try again.
        </Banner>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No duties assigned yet"
            body="Assign duties on the Duties page and remuneration will be worked out here."
            action={
              <Button variant="primary" onClick={() => navigate('/duties')}>
                Go to duties
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="cb-stats">
            <StatCard label="Duties" value={grandTotal.dutyCount} hint={`${rows.length} functionary records`} />
            <StatCard label="Remuneration" value={formatINR(grandTotal.remuneration)} />
            <StatCard label="Conveyance and refreshment" value={formatINR(grandTotal.conveyance + grandTotal.refreshment)} />
            <StatCard label="Grand total" value={formatINR(grandTotal.total)} />
          </div>

          <Card
            flush
            title="Duties summary"
            subtitle="Totals by duty type. Select a row to jump to its functionaries."
            action={<Badge dot={false}>{grandTotal.dutyCount} duties</Badge>}
          >
            <DataTable
              caption="Duties summary"
              columns={summaryColumns}
              rows={dutiesSummary.rows}
              getRowKey={(row) => row.dutyType}
              onRowClick={(row) => scrollToGroup(row.groupKey)}
              footer={
                <>
                  <span>Grand total</span>
                  <span className="cb-strong is-num">
                    {grandTotal.dutyCount || '—'} duties · {money(grandTotal.total)}
                  </span>
                </>
              }
            />
          </Card>

          {grouped.map(({ group, rows: groupRows }) => {
            const dutyTotal = groupRows.reduce((sum, r) => sum + (r.dutyCount || 0), 0)
            const isInv = group.key === 'inv'
            return (
              <div id={`remuneration-group-${group.key}`} key={group.key}>
                <Card
                  flush
                  title={group.title}
                  subtitle={
                    isInv
                      ? `${invigilatorGroups.selfSchool.length} self school · ${invigilatorGroups.outsideSchool.length} outside school`
                      : `${groupRows.length} ${groupRows.length === 1 ? 'functionary' : 'functionaries'}`
                  }
                  action={<Badge dot={false}>{dutyTotal} duties</Badge>}
                >
                  {isInv && groupRows.length > 0 ? (
                    <CardToolbar>
                      <FilterBar
                        chipsLabel="School"
                        chips={[
                          { id: 'all', label: 'All', count: groupRows.length, active: invigilatorFilter === 'all' },
                          { id: 'self', label: 'Self school', count: invigilatorGroups.selfSchool.length, active: invigilatorFilter === 'self' },
                          { id: 'outside', label: 'Outside school', count: invigilatorGroups.outsideSchool.length, active: invigilatorFilter === 'outside' },
                        ]}
                        onChipClick={(id) => setInvigilatorFilter(id as InvigilatorFilter)}
                      />
                    </CardToolbar>
                  ) : null}
                  <DataTable
                    caption={group.title}
                    columns={columnsForGroup(group.key)}
                    rows={isInv ? invigilatorRows : groupRows}
                    getRowKey={(row) => `${row.functionaryId}::${row.functionaryType}`}
                    onRowClick={(row) => openDetails(row.functionaryId)}
                    empty={
                      <EmptyState
                        compact
                        title={isInv && groupRows.length > 0 ? 'No invigilators in this list' : 'No duties for this group yet'}
                        body={isInv && groupRows.length > 0 ? 'Choose another school filter.' : 'Assign these duties on the Duties page.'}
                      />
                    }
                  />
                </Card>
              </div>
            )
          })}
        </>
      )}
    </Page>
  )
}

export default Remuneration
