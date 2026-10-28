import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { AppState } from 'react-native'

import { useToast } from '@/ui'

import { flushAttendanceQueue, useAttendanceQueue } from './attendanceQueue'
import { staffKeys } from './queries'

const RETRY_MS = 30_000

/** Sends registers saved on this phone: at launch, when the app comes back, and every 30 s while any wait. */
export function AttendanceSync() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const waiting = useAttendanceQueue().filter((entry) => !entry.error).length

  useEffect(() => {
    const flush = async () => {
      const sent = await flushAttendanceQueue()
      if (sent > 0) {
        queryClient.invalidateQueries({ queryKey: staffKeys.all })
        toast(sent === 1 ? 'Register sent to school' : `${sent} registers sent to school`)
      }
    }
    flush()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush()
    })
    const timer = waiting ? setInterval(flush, RETRY_MS) : null
    return () => {
      subscription.remove()
      if (timer) clearInterval(timer)
    }
  }, [waiting, queryClient, toast])

  return null
}
