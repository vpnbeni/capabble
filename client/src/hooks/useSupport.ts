import { useMutation, useQuery, type UseMutationOptions } from '@tanstack/react-query'
import supportService, {
  type FeedbackPayload,
  type SupportTicketPayload,
  type SystemStatusResponse,
} from '../services/supportService'

export function useCreateSupportTicketMutation(
  options?: UseMutationOptions<unknown, Error, SupportTicketPayload>
) {
  return useMutation({
    mutationFn: (payload) => supportService.submitTicket(payload),
    ...options,
  })
}

export function useCreateFeedbackMutation(
  options?: UseMutationOptions<unknown, Error, FeedbackPayload>
) {
  return useMutation({
    mutationFn: (payload) => supportService.submitFeedback(payload),
    ...options,
  })
}

export function useSystemStatusQuery() {
  return useQuery<SystemStatusResponse>({
    queryKey: ['support', 'system-status'],
    queryFn: () => supportService.getSystemStatus(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}
