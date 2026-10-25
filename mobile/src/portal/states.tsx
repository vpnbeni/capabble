import { RefreshCw, UserRound } from 'lucide-react-native'

import { MobileButton, Skeleton, StatusView, Surface } from '@/ui'

/** A parent with no child linked yet. */
export function NoChild() {
  return (
    <Surface padded={false}>
      <StatusView compact kind="empty" icon={UserRound} title="No student is linked to this login" body="Ask the school office to link your child to your login." />
    </Surface>
  )
}

/** A screen's data didn't load: what failed, the server's reason and a retry. */
export function LoadFailed({ what, error, onRetry }: { what: string; error?: Error | null; onRetry: () => void }) {
  return (
    <Surface padded={false}>
      <StatusView
        compact
        kind="error"
        title={`${what} didn't load`}
        body={error?.message || 'Check your connection, then try again.'}
        actions={
          <MobileButton variant="gray" size="medium" icon={RefreshCw} onPress={onRetry}>
            Try again
          </MobileButton>
        }
      />
    </Surface>
  )
}

/** Placeholder rows for a card that is loading. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Surface>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} lines={2} height={14} />
      ))}
    </Surface>
  )
}
