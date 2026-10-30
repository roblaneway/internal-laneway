import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useProfile } from '@/auth/AuthProvider'
import { keys, useNotifications } from './use-data'

interface NotificationEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  title?: string
  body?: string | null
}

/** Serverless hosts (Vercel) can't hold a stream open, so they build with VITE_NOTIFICATIONS=poll. */
const POLL_MS = import.meta.env.VITE_NOTIFICATIONS === 'poll' ? 20_000 : 0

/** Keep the notification cache live via the server's event stream (only this user's events). */
function useStreamedNotifications() {
  const profile = useProfile()
  const queryClient = useQueryClient()

  useEffect(() => {
    const queryKey = [...keys.notifications, profile.id]
    // EventSource reconnects on its own if the connection drops.
    const source = new EventSource('/api/notifications/stream')
    source.addEventListener('notification', (e) => {
      const event = JSON.parse((e as MessageEvent<string>).data) as NotificationEvent
      if (event.type === 'INSERT' && event.title) toast.info(event.title, { description: event.body ?? undefined })
      queryClient.invalidateQueries({ queryKey })
      // A new announcement usually accompanies a new notification.
      queryClient.invalidateQueries({ queryKey: keys.announcements })
    })
    return () => source.close()
  }, [profile.id, queryClient])
}

/** Refetch notifications while the tab is visible and toast the ones that are new since last time. */
function usePolledNotifications() {
  const queryClient = useQueryClient()
  const { data } = useNotifications(POLL_MS)
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!data) return
    // The first load only records what's already there.
    const fresh = seen.current ? data.filter((n) => !seen.current!.has(n.id)) : []
    seen.current = new Set(data.map((n) => n.id))
    for (const n of fresh) if (!n.read_at) toast.info(n.title, { description: n.body ?? undefined })
    if (fresh.length) queryClient.invalidateQueries({ queryKey: keys.announcements })
  }, [data, queryClient])
}

export const useRealtimeNotifications = POLL_MS ? usePolledNotifications : useStreamedNotifications
