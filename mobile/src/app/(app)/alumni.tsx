import { useRouter } from 'expo-router'
import { GraduationCap, Mail, Phone } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useAlumni } from '@/staff/queries'
import { space } from '@/theme/tokens'
import { Avatar, ListGroup, MobileButton, MobileScreen, NavBar, SearchBar, StatusView, Surface } from '@/ui'

/** Past students by batch, to find and call or email one (the website's Alumni directory). */
export default function AlumniScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const alumni = useAlumni(query.trim())
  const records = alumni.data?.records ?? []

  return (
    <MobileScreen refreshing={alumni.isRefetching} onRefresh={alumni.refetch} nav={<NavBar title="Alumni" back={{ label: 'Back', onPress: router.back }} />}>
      <SearchBar label="Search alumni" placeholder="Name, admission number or phone" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
      {alumni.isPending ? (
        <CardSkeleton rows={5} />
      ) : alumni.isError ? (
        <LoadFailed what="Alumni" error={alumni.error} onRetry={alumni.refetch} />
      ) : records.length ? (
        <ListGroup
          footer={`${alumni.data?.total ?? records.length} past students`}
          items={records.slice(0, 100).map((row) => ({
            title: row.name,
            subtitle: [row.batchSession ? `Batch ${row.batchSession}` : null, row.section ? `Section ${row.section}` : null, row.rollNumber, row.phone].filter(Boolean).join(' · '),
            lines: 2,
            avatar: <Avatar name={row.name} size={36} />,
            accessory:
              row.phone || row.email ? (
                <View style={{ flexDirection: 'row', gap: space['space-2'] }}>
                  {row.phone ? (
                    <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${row.name}`} onPress={() => Linking.openURL(`tel:${String(row.phone).replace(/\s+/g, '')}`)} />
                  ) : (
                    <MobileButton variant="tinted" size="medium" icon={Mail} aria-label={`Email ${row.name}`} onPress={() => Linking.openURL(`mailto:${row.email}`)} />
                  )}
                </View>
              ) : undefined,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={GraduationCap}
            title={query.trim() ? 'No one found' : 'No alumni yet'}
            body={query.trim() ? 'Check the spelling, or search by admission number.' : 'Students who pass out of the final class show here at the end of a session.'}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
