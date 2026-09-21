import { useQuery } from '@tanstack/react-query'
import schoolProfileService from '@/services/schoolProfileService'

export const schoolProfileKeys = {
  all: ['school-profile'] as const,
}

export const useSchoolProfile = (enabled = true) =>
  useQuery({
    queryKey: schoolProfileKeys.all,
    queryFn: () => schoolProfileService.getProfile(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
