import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Briefcase, Contact, GraduationCap, UserCheck, Users, UserX } from 'lucide-react'
import { useAllTeachers } from '../hooks/useTeachers'
import {
  getDesignationCode,
  getStaffGender,
  isAdminStaff,
  isClassIvStaff,
  isConductor,
  isDriver,
  isSecurityStaff,
  isSportsCoach,
  isTeachingStaff,
} from '../utils/staafStaff'
import type { Teacher } from '../redux/slices/teacherSlice'
import { Badge, Button, Card, EmptyState, Icon, Page, Progress, StatCard } from '@/components/ui'
import { formatCount } from '@/components/students/studentFormat'
import '@/components/staaf/staaf.css'

const GROUP_CARDS = [
  { key: 'teaching', label: 'Teaching', match: isTeachingStaff },
  { key: 'sports-coach', label: 'Sports coaches', match: isSportsCoach },
  { key: 'admin', label: 'Admin', match: isAdminStaff },
  { key: 'class-iv', label: 'Class IV', match: isClassIvStaff },
  { key: 'drivers', label: 'Drivers', match: isDriver },
  { key: 'conductors', label: 'Conductors', match: isConductor },
  { key: 'security', label: 'Security', match: isSecurityStaff },
] as const

const DESIGNATION_TILES = [
  { key: 'PRT', label: 'PRT' },
  { key: 'TGT', label: 'TGT' },
  { key: 'PGT', label: 'PGT' },
  { key: 'Other', label: 'Other teaching' },
] as const

const GENDER_SERIES = [
  { key: 'Male', label: 'Male', color: 'var(--chart-1)' },
  { key: 'Female', label: 'Female', color: 'var(--chart-2)' },
  { key: 'Other', label: 'Other', color: 'var(--chart-4)' },
  { key: 'Unspecified', label: 'Not recorded', color: 'var(--neutral-solid)' },
] as const

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
const staffWord = (n: number) => (n === 1 ? 'member' : 'members')

const StaafOverview: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading } = useAllTeachers({
    includeAllRecords: true,
    sort: 'name',
  })

  const staff = (data?.items || []) as Teacher[]

  const stats = useMemo(() => {
    const active = staff.filter((member) => member.isActive !== false).length
    const gender = { Male: 0, Female: 0, Other: 0, Unspecified: 0 }
    const designations: Record<'PRT' | 'TGT' | 'PGT' | 'Other', number> = {
      PRT: 0,
      TGT: 0,
      PGT: 0,
      Other: 0,
    }

    staff.forEach((member) => {
      gender[getStaffGender(member)] += 1
      const code = getDesignationCode(member)
      if (code === 'PRT') designations.PRT += 1
      else if (code === 'TGT') designations.TGT += 1
      else if (code === 'PGT') designations.PGT += 1
      else if (isTeachingStaff(member)) designations.Other += 1
    })

    return {
      total: staff.length,
      active,
      gender,
      designations,
      groups: GROUP_CARDS.map((group) => ({
        ...group,
        count: staff.filter(group.match).length,
      })),
    }
  }, [staff])

  const goToStaff = () => navigate('/staaf/teaching-staff')

  if (isLoading && staff.length === 0) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the staff overview
        </div>
      </Page>
    )
  }

  const total = stats.total
  const teachingCount = stats.groups.find((group) => group.key === 'teaching')?.count || 0
  const supportCount = total - teachingCount
  const inactive = Math.max(0, total - stats.active)
  const largestGroup = Math.max(1, ...stats.groups.map((group) => group.count))
  const teachingDesignated = DESIGNATION_TILES.reduce((sum, tile) => sum + stats.designations[tile.key], 0)
  const largestDesignation = Math.max(1, ...DESIGNATION_TILES.map((tile) => stats.designations[tile.key]))
  const genderCounts = GENDER_SERIES.map((series) => ({ ...series, count: stats.gender[series.key] }))
  const unrecordedGender = stats.gender.Unspecified

  return (
    <Page>
      <section className="cb-stats" aria-label="Staff totals">
        <StatCard label="Total staff" value={formatCount(total)} icon={Users} hint="All staff records this session" />
        <StatCard
          label="Active staff"
          value={formatCount(stats.active)}
          icon={UserCheck}
          hint={inactive > 0 ? `${formatCount(inactive)} inactive` : 'Everyone is active'}
          progress={percent(stats.active, total)}
        />
        <StatCard label="Teaching staff" value={formatCount(teachingCount)} icon={GraduationCap} hint="Teachers and PRT, TGT, PGT" />
        <StatCard label="Support staff" value={formatCount(supportCount)} icon={Briefcase} hint="Admin, Class IV, transport and security" />
      </section>

      <div className="cb-grid-8-4">
        <div className="cb-stack">
          <Card
            title="Staff by group"
            subtitle="Bars compare each group with the largest one."
            action={
              total > 0 ? (
                <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={goToStaff}>
                  View teaching staff
                </Button>
              ) : null
            }
          >
            {total === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="No staff added yet"
                body="Group, designation and gender counts appear here once staff records are added."
                action={
                  <Button variant="primary" size="sm" onClick={goToStaff}>
                    Add staff
                  </Button>
                }
              />
            ) : (
              <ul className="staaf-tiles">
                {stats.groups.map((group, index) => (
                  <li key={group.key} className={`staaf-tile staaf-tint--c${(index % 6) + 1}`}>
                    <span className="staaf-tile__name">{group.label}</span>
                    <span className="staaf-tile__count">{formatCount(group.count)}</span>
                    <Progress value={group.count} max={largestGroup} showValue={false} size="sm" />
                    <span className="staaf-tile__meta">{percent(group.count, total)}% of staff</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Teaching staff by designation"
            subtitle={total === 0 ? 'PRT, TGT and PGT counts' : `${formatCount(teachingDesignated)} teaching staff`}
          >
            {teachingDesignated === 0 ? (
              <EmptyState
                compact
                icon={GraduationCap}
                title="No teaching staff yet"
                body="Designations are read from each teacher's designation, such as PRT, TGT or PGT."
              />
            ) : (
              <ul className="staaf-tiles">
                {DESIGNATION_TILES.map((tile, index) => {
                  const count = stats.designations[tile.key]
                  return (
                    <li key={tile.key} className={`staaf-tile staaf-tint--c${(index % 6) + 1}`}>
                      <span className="staaf-tile__name">{tile.label}</span>
                      <span className="staaf-tile__count">{formatCount(count)}</span>
                      <Progress value={count} max={largestDesignation} showValue={false} size="sm" />
                      <span className="staaf-tile__meta">{percent(count, teachingDesignated)}% of teaching</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="cb-stack">
          <Card title="Gender split" subtitle={`${formatCount(total)} staff`}>
            {total === 0 ? (
              <EmptyState compact icon={Contact} title="No staff yet" />
            ) : (
              <div className="staaf-gender">
                <div
                  className="staaf-gender__bar"
                  role="img"
                  aria-label={genderCounts.map((g) => `${g.label} ${g.count}`).join(', ')}
                >
                  {genderCounts
                    .filter((g) => g.count > 0)
                    .map((g) => (
                      <span key={g.key} style={{ width: `${(g.count / total) * 100}%`, background: g.color }} />
                    ))}
                </div>
                <ul className="staaf-legend">
                  {genderCounts.map((g) => (
                    <li key={g.key}>
                      <span className="staaf-legend__dot" style={{ background: g.color }} aria-hidden="true" />
                      <span className="staaf-legend__label">{g.label}</span>
                      <span className="staaf-legend__value">{formatCount(g.count)}</span>
                      <span className="staaf-legend__pct">{percent(g.count, total)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {total > 0 ? (
            <Card
              title="Records to complete"
              subtitle={unrecordedGender + inactive === 0 ? 'Every record has the basics.' : 'Fix these from the staff lists.'}
            >
              <ul className="staaf-todo">
                {[
                  { icon: Contact, label: 'Gender not recorded', count: unrecordedGender, tone: 'warning' as const },
                  { icon: UserX, label: 'Marked inactive', count: inactive, tone: 'neutral' as const },
                ].map((item) => (
                  <li key={item.label}>
                    <Icon icon={item.icon} size={16} className="staaf-todo__icon" />
                    <span className="staaf-todo__label">{item.label}</span>
                    {item.count > 0 ? (
                      <Badge tone={item.tone}>
                        {formatCount(item.count)} staff {staffWord(item.count)}
                      </Badge>
                    ) : (
                      <Badge tone="success">None</Badge>
                    )}
                  </li>
                ))}
              </ul>
              <div className="staaf-todo__action">
                <Button size="sm" onClick={goToStaff}>
                  Review staff
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  )
}

export default StaafOverview
