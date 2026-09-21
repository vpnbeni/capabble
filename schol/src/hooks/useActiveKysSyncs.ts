import { useQuery } from '@tanstack/react-query'
import { fetchActiveKysSyncs } from '@/services/api'

export function useActiveKysSyncs() {
  return useQuery({
    queryKey: ['active-kys-syncs'],
    queryFn: fetchActiveKysSyncs,
    refetchInterval: 4000,
    retry: false,
  })
}
