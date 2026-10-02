import { useParams } from 'react-router-dom'
import { CollectionRunProgress } from '@/components/collection/CollectionRunProgress'

export function CollectionRunPage() {
  const { runId = '' } = useParams()
  return <CollectionRunProgress runId={runId} />
}
