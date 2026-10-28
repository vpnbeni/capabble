import { KeyRound, Share2 } from 'lucide-react-native'
import { Share, View } from 'react-native'

import type { Delivery } from '@/services/usersService'
import { space } from '@/theme/tokens'
import { MobileButton, StatusView, Surface, Text } from '@/ui'

/**
 * What to give the person after a login is made or a password reset: a temporary password
 * (shown this once; they change it when they sign in) or the invite that was emailed.
 */
export function CredentialResult({ delivery, name, loginId, onDone }: { delivery: Delivery; name: string; loginId: string; onDone: () => void }) {
  const message = delivery.temporaryPassword
    ? `Your Capabble login\nSign in with: ${loginId}\nTemporary password: ${delivery.temporaryPassword}\nYou'll choose your own password when you sign in.`
    : `Set up your Capabble login (${loginId}): ${delivery.inviteUrl ?? ''}`
  return (
    <StatusView
      kind="success"
      icon={KeyRound}
      title={delivery.temporaryPassword ? `Give ${name || 'them'} this password` : delivery.emailSent ? `Invite emailed to ${loginId}` : 'Send them the invite link'}
      body={
        delivery.temporaryPassword
          ? 'It shows only now. They choose their own password when they first sign in.'
          : delivery.emailSent
            ? 'The link works for 7 days. They set their own password from it.'
            : "The email didn't go out. Share the link another way; it works for 7 days."
      }
      details={
        delivery.temporaryPassword || (!delivery.emailSent && delivery.inviteUrl) ? (
          <Surface>
            <View style={{ gap: space['space-1'] }}>
              <Text variant="m-subhead" tone="muted">
                Sign in with {loginId}
              </Text>
              <Text variant="m-section" selectable numeric>
                {delivery.temporaryPassword ?? delivery.inviteUrl}
              </Text>
            </View>
          </Surface>
        ) : undefined
      }
      actions={
        <View style={{ gap: space['space-2'], alignSelf: 'stretch' }}>
          {delivery.temporaryPassword || (!delivery.emailSent && delivery.inviteUrl) ? (
            <MobileButton fullWidth icon={Share2} onPress={() => Share.share({ message })}>
              Share with {name || 'them'}
            </MobileButton>
          ) : null}
          <MobileButton variant="gray" fullWidth onPress={onDone}>
            Done
          </MobileButton>
        </View>
      }
    />
  )
}
