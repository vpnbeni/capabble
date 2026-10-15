import React from 'react'
import { classLabel } from '@/utils/classLabel'
import { Avatar, Card, DetailList, Page, PageHeader, formatDate } from '@/components/ui'
import { usePortal } from '../PortalContext'
import { usePortalProfile } from '../usePortal'
import { LoadFailed, NoChild } from './shared'

/** The student's record as the school has it. Changes go through the school office. */
const PortalProfile: React.FC = () => {
  const { child } = usePortal()
  const { data, isError } = usePortalProfile(child?.studentId)

  if (!child) return <Page><NoChild /></Page>

  const address = data?.address
    ? [data.address.street, data.address.city, data.address.state, data.address.pincode].filter(Boolean).join(', ')
    : ''

  return (
    <Page>
      <PageHeader title="Profile" subtitle="To correct anything here, contact the school office." />
      {isError ? <LoadFailed what="The profile" /> : null}
      {data ? (
        <>
          <Card
            title={data.name}
            subtitle={`${classLabel(data.className, data.section)} · Admission no. ${data.rollNumber}`}
            action={<Avatar name={data.name} src={data.profileImage} size="lg" />}
          >
            <DetailList
              columns={3}
              items={[
                { label: 'Roll no.', value: data.classRollNo ?? '—' },
                { label: 'Date of birth', value: formatDate(data.dateOfBirth) },
                { label: 'Gender', value: data.gender || '—' },
                { label: 'House', value: data.house || '—' },
                { label: 'Bus', value: data.busNo || '—' },
                { label: 'Admitted on', value: formatDate(data.admissionDate) },
              ]}
            />
          </Card>
          <Card title="Family and contact">
            <DetailList
              columns={2}
              items={[
                { label: "Father's name", value: data.fatherName || '—' },
                { label: "Mother's name", value: data.motherName || '—' },
                ...(data.guardianName ? [{ label: 'Guardian', value: data.guardianName }] : []),
                { label: 'Guardian phone', value: data.guardianPhone || '—' },
                { label: 'Guardian email', value: data.guardianEmail || '—' },
                { label: 'Address', value: address || '—', wide: true },
              ]}
            />
          </Card>
        </>
      ) : null}
    </Page>
  )
}

export default PortalProfile
