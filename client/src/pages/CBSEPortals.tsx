import React from 'react'
import { ExternalLink } from 'lucide-react'
import { Card, DataTable, Entity, Icon, Page, type DataTableColumn } from '@/components/ui'

interface PortalItem {
  id: string
  name: string
  description: string
  url: string
}

const portals: PortalItem[] = [
  {
    id: 'cbse-main',
    name: 'CBSE main website',
    description: 'Official Central Board of Secondary Education website',
    url: 'https://www.cbse.gov.in/cbsenew/cbse.html',
  },
  {
    id: 'cbse-academics',
    name: 'CBSE academics',
    description: 'Academic circulars, curriculum and exam resources',
    url: 'https://cbseacademic.nic.in/',
  },
  {
    id: 'pariksha-sangam',
    name: 'Pariksha Sangam',
    description: 'Integrated examination portal for schools and students',
    url: 'https://parikshasangam.cbse.gov.in/',
  },
  {
    id: 'cbse-results',
    name: 'CBSE results',
    description: 'Official result and exam outcome portal',
    url: 'https://results.cbse.nic.in/',
  },
  {
    id: 'oecms',
    name: 'OECMS',
    description: 'Exam centre management system for board examinations',
    url: 'https://cbseit.in/cbse/web/oecms/LoginAction.aspx',
  },
  {
    id: 'loc-admit-card',
    name: 'LOC and admit cards',
    description: 'List of candidates submission and admit card download portal',
    url: 'https://cbseit.in/cbse/web/LOC/LoginAction.aspx',
  },
]

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const openPortal = (portal: PortalItem) => {
  window.open(portal.url, '_blank', 'noopener,noreferrer')
}

const columns: DataTableColumn<PortalItem>[] = [
  {
    key: 'name',
    header: 'Portal',
    mobile: 'title',
    wrap: true,
    render: (portal) => <Entity primary={portal.name} secondary={portal.description} />,
  },
  {
    key: 'site',
    header: 'Address',
    mobile: 'subtitle',
    render: (portal) => <span className="cb-muted">{hostOf(portal.url)}</span>,
  },
  {
    key: 'open',
    header: '',
    align: 'right',
    interactive: true,
    render: (portal) => (
      <a className="cb-link" href={portal.url} target="_blank" rel="noreferrer">
        Open portal <Icon icon={ExternalLink} size={14} />
      </a>
    ),
  },
]

const CBSEPortals: React.FC = () => (
  <Page>
    <Card flush title="Official portals" subtitle="CBSE examination portals and management systems. Each opens in a new tab.">
      <DataTable
        caption="CBSE portals"
        columns={columns}
        rows={portals}
        getRowKey={(portal) => portal.id}
        onRowClick={openPortal}
      />
    </Card>
  </Page>
)

export default CBSEPortals
