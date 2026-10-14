import React from 'react'
import { ClipboardList } from 'lucide-react'
import { Badge, Card, DetailList, EmptyState, Page } from '@/components/ui'

interface UtilityCardItem {
  title: string
  description: string
}

interface UtilityChecklistItem {
  title: string
  description: string
}

interface CentreRecordsUtilityPageProps {
  title: string
  description: string
  summaryLabel: string
  /** No longer shown; kept so existing callers still compile. */
  summaryValue?: string
  /** No longer shown; kept so existing callers still compile. */
  accentClasses?: string
  overview: string[]
  workflows: UtilityCardItem[]
  outputs: UtilityChecklistItem[]
}

const lowerFirst = (value: string) => (value ? value.charAt(0).toLowerCase() + value.slice(1) : value)

/**
 * A planned Exam centre records page: what it will cover, with nothing to manage yet.
 * `title` is shown by the shell header, so the page itself doesn't repeat it.
 */
const CentreRecordsUtilityPage: React.FC<CentreRecordsUtilityPageProps> = ({
  description,
  summaryLabel,
  overview,
  workflows,
  outputs,
}) => {
  return (
    <Page>
      <Card title="About this page" subtitle={description} action={<Badge tone="neutral">Planned</Badge>}>
        <EmptyState
          icon={ClipboardList}
          title="Nothing to manage here yet"
          body={`This page will cover ${lowerFirst(summaryLabel)}. ${overview.join(' ')}`}
        />
      </Card>

      <div className="cb-grid-8-4">
        <Card title="What you'll do here" subtitle={`${workflows.length} ${workflows.length === 1 ? 'workflow' : 'workflows'}`}>
          <DetailList
            columns={2}
            items={workflows.map((workflow) => ({ label: workflow.title, value: workflow.description }))}
          />
        </Card>

        <Card title="Documents" subtitle="What this page will produce">
          <DetailList
            columns={1}
            items={outputs.map((output) => ({ label: output.title, value: output.description }))}
          />
        </Card>
      </div>
    </Page>
  )
}

export default CentreRecordsUtilityPage
