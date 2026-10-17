import React from 'react'
import { Bus } from 'lucide-react'
import { Card, DataTable, DetailList, EmptyState, Page, PageHeader, formatTime, type DataTableColumn } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalTransport } from '../usePortal'
import type { PortalTransport as Transport } from '../portalService'
import { LoadFailed, NoChild } from './shared'

type Stop = NonNullable<Transport['routes']>[number]['stops'][number]

const stopColumns: DataTableColumn<Stop>[] = [
  { key: 'name', header: 'Stop', mobile: 'title', render: (row) => row.name },
  { key: 'landmark', header: 'Landmark', mobile: 'subtitle', render: (row) => row.landmark || '—' },
  { key: 'pickup', header: 'Pickup', mobile: 'aside', render: (row) => (row.pickupTime ? formatTime(row.pickupTime) : '—') },
  { key: 'drop', header: 'Drop', mobile: 'hidden', render: (row) => (row.dropTime ? formatTime(row.dropTime) : '—') },
]

/** The school bus the student uses, its crew and stops. */
const PortalTransport: React.FC = () => {
  const { child } = usePortal()
  const { data, isLoading, isError } = usePortalTransport(child?.studentId)

  if (!child) return <Page><NoChild /></Page>

  return (
    <Page>
      <PageHeader title="Transport" subtitle={child.name} />
      {isError ? <LoadFailed what="Transport" /> : null}
      {!isLoading && data && !data.usesSchoolTransport ? (
        <Card>
          <EmptyState
            icon={Bus}
            title="Not using school transport"
            body={data.commuteMode ? `The school has noted: ${data.commuteMode}.` : 'No school bus is assigned. Contact the school office to change this.'}
          />
        </Card>
      ) : null}
      {data?.usesSchoolTransport ? (
        <>
          <Card title={`Bus ${data.busNo}`}>
            <DetailList
              columns={2}
              items={[
                { label: 'Vehicle number', value: data.vehicle?.registrationNumber || '—' },
                { label: 'Driver', value: data.vehicle?.driverName ? `${data.vehicle.driverName}${data.vehicle.driverPhone ? ` · ${data.vehicle.driverPhone}` : ''}` : '—' },
                { label: 'Conductor', value: data.vehicle?.conductorName ? `${data.vehicle.conductorName}${data.vehicle.conductorPhone ? ` · ${data.vehicle.conductorPhone}` : ''}` : '—' },
              ]}
            />
          </Card>
          {(data.routes || []).map((route) => (
            <Card key={route.name} flush title={route.name}>
              <DataTable columns={stopColumns} rows={route.stops} getRowKey={(row) => `${row.name}-${row.pickupTime}`} />
            </Card>
          ))}
        </>
      ) : null}
    </Page>
  )
}

export default PortalTransport
