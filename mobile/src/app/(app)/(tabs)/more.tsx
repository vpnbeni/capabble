import Constants from 'expo-constants'
import { useState } from 'react'

import { useSession } from '@/session/SessionProvider'
import { Card, ListRow, Screen, Text } from '@/ui'

const KIND_LABEL = { staff: 'Staff', parent: 'Parent', student: 'Student' } as const

export default function MoreScreen() {
  const session = useSession()
  const [signingOut, setSigningOut] = useState(false)
  if (session.status !== 'signedIn') return null

  const { user, school } = session
  const name = user.displayName || user.name || user.email || user.username || 'Signed in'

  return (
    <Screen title="More">
      <Card title="Account" flush>
        <ListRow primary={name} secondary={user.email || user.username || undefined} divider />
        <ListRow primary={school.name} secondary={KIND_LABEL[user.kind]} />
      </Card>

      <Card flush>
        <ListRow
          primary={signingOut ? 'Signing out…' : 'Sign out'}
          tone="danger"
          onPress={
            signingOut
              ? undefined
              : async () => {
                  setSigningOut(true)
                  await session.signOut()
                }
          }
        />
      </Card>

      <Text variant="caption" tone="subtle" style={{ textAlign: 'center' }}>
        Capabble {Constants.expoConfig?.version}
      </Text>
    </Screen>
  )
}
