import { UserRound } from 'lucide-react-native'
import { View } from 'react-native'

import { space } from '@/theme/tokens'
import { Button, Card, EmptyState, Skeleton } from '@/ui'

/** A parent with no child linked yet. */
export function NoChild() {
  return (
    <Card>
      <EmptyState icon={UserRound} title="No student is linked to this login" body="Ask the school office to link your child to your login." />
    </Card>
  )
}

/** A screen's data didn't load: what failed, the server's reason and a retry. */
export function LoadFailed({ what, error, onRetry }: { what: string; error?: Error | null; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        title={`${what} didn't load`}
        body={error?.message || 'Check your connection and try again.'}
        action={<Button label="Try again" variant="secondary" onPress={onRetry} />}
      />
    </Card>
  )
}

/** Placeholder rows for a card that is loading. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <View style={{ gap: space['space-4'] }}>
        {Array.from({ length: rows }, (_, row) => (
          <View key={row} style={{ gap: space['space-2'] }}>
            <Skeleton width="55%" />
            <Skeleton width="80%" height={12} />
          </View>
        ))}
      </View>
    </Card>
  )
}
