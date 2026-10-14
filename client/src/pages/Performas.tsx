import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CentreRecordsUtilityPage from '../components/centre-records/CentreRecordsUtilityPage'
import { ChevronRight } from 'lucide-react'
import { Badge, Card, DataTable, Entity, Icon, Page, type DataTableColumn } from '@/components/ui'

type FormatRow = {
  id: string
  name: string
  description: string
  href?: string
}

const FORMATS: FormatRow[] = [
  {
    id: 'award-list',
    name: 'Award list',
    description: 'Open the shared format editor with the award list template, then generate PDFs from Award List.',
    href: '/exmcl/performas/award-list',
  },
  {
    id: 'admit-card',
    name: 'Admit card',
    description: 'Open the shared format editor with the admit card template, then generate PDFs from Admit Cards.',
    href: '/exmcl/performas/admit-card',
  },
  {
    id: 'datesheet',
    name: 'Datesheet',
    description: 'Create and print class-wise examination datesheets.',
    href: '/exmcl/datesheets',
  },
  {
    id: 'seating-plan',
    name: 'Seating plan',
    description: 'Generate seating plan PDFs for exam rooms and halls.',
    href: '/exmcl/seatingplan',
  },
  {
    id: 'duties',
    name: 'Duties',
    description: 'Assign invigilators and print duty records for exam days.',
    href: '/exmcl/duties',
  },
  {
    id: 'rechecking',
    name: 'Rechecking',
    description: 'Prepare rechecking and re-evaluation request formats.',
  },
  {
    id: 'report-card',
    name: 'Report card',
    description: 'Open the shared format editor with the IB-style report card template, then generate PDFs from Report Card.',
    href: '/exmcl/performas/report-card',
  },
  {
    id: 'consolidated-sheet',
    name: 'Consolidated sheet',
    description: 'Compile class-wise consolidated marks sheets for records.',
  },
]

const ExmclFormats: React.FC = () => {
  const navigate = useNavigate()

  const columns: DataTableColumn<FormatRow>[] = [
    {
      key: 'name',
      header: 'Format',
      mobile: 'title',
      wrap: true,
      render: (row) => <Entity primary={row.name} secondary={row.description} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: 140,
      mobile: 'aside',
      render: (row) =>
        row.href ? <Badge tone="success">Available</Badge> : <Badge tone="neutral">Coming soon</Badge>,
    },
    {
      key: 'open',
      header: '',
      headerLabel: 'Open',
      align: 'right',
      width: 48,
      mobile: 'hidden',
      render: (row) => (row.href ? <Icon icon={ChevronRight} size={16} className="cb-subtle" /> : null),
    },
  ]

  return (
    <Page>
      <Card flush title="Formats" subtitle="Printable exam documents and the templates they are built from">
        <DataTable
          caption="Exam formats"
          columns={columns}
          rows={FORMATS}
          getRowKey={(row) => row.id}
          onRowClick={(row) => {
            if (row.href) navigate(row.href)
          }}
        />
      </Card>
    </Page>
  )
}

const Performas: React.FC = () => {
  const location = useLocation()
  const isExmcl = location.pathname.includes('/exmcl/performas') || location.hash.includes('/exmcl/performas')

  if (isExmcl) {
    return <ExmclFormats />
  }

  return (
    <CentreRecordsUtilityPage
      title="Performa's"
      description="Prepare commonly needed centre documents such as relieving letters and answer sheet submission letters without rebuilding the same content manually every exam day."
      summaryLabel="Letter generation and centre document drafting"
      summaryValue="Docs"
      accentClasses="bg-[linear-gradient(135deg,#eefaf4_0%,#f9fcff_52%,#fff7ed_100%)]"
      overview={[
        'Generate relieving letters with centre and duty context already in place.',
        'Prepare answer sheet submission letters with standard wording and date-wise details.',
        'Reduce repeat document drafting during busy exam-day operations.',
      ]}
      workflows={[
        {
          title: 'Relieving Letter Drafting',
          description: 'Generate relieving letters for functionaries or staff once duty completion details are available.',
        },
        {
          title: 'Answer Sheet Submission Letter',
          description: 'Prepare the submission letter for answer sheets with the relevant centre details and exam-day context.',
        },
        {
          title: 'Reusable Templates',
          description: 'Keep a standard set of centre-level performas ready so documents stay consistent across all exam days.',
        },
        {
          title: 'Print and Archive Flow',
          description: 'Use one place to review, print, and later archive the generated letters for record keeping.',
        },
      ]}
      outputs={[
        {
          title: 'Relieving letter',
          description: 'A ready-to-print letter for staff or functionaries after duty completion.',
        },
        {
          title: 'Answer sheet submission letter',
          description: 'A formal letter to accompany submission of answer sheets and related material.',
        },
        {
          title: 'Template-driven performas',
          description: 'A base library of standard centre letters that can be reused with minimal edits.',
        },
      ]}
    />
  )
}

export default Performas
