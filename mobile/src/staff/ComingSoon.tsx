import { ExternalLink, type LucideIcon } from 'lucide-react-native'

import { MobileButton, StatusView, Surface } from '@/ui'

import { openWebsite } from './useStaff'

/** A staff tab whose screen ships in a later update: what it will do, and the website page meanwhile. */
export function ComingSoon({ icon, title, body, webPath }: { icon: LucideIcon; title: string; body: string; webPath?: string }) {
  return (
    <Surface padded={false}>
      <StatusView
        compact
        kind="empty"
        icon={icon}
        title={title}
        body={body}
        actions={
          webPath ? (
            <MobileButton variant="gray" size="medium" icon={ExternalLink} onPress={() => openWebsite(webPath)}>
              Open on the website
            </MobileButton>
          ) : undefined
        }
      />
    </Surface>
  )
}
