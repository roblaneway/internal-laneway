import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ListSkeleton } from '@/components/ListSkeleton'
import { keys, useNotifications } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useProfile } from '@/auth/AuthProvider'
import type { Notification } from '@/lib/types'

export function useNotificationActions() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const queryKey = [...keys.notifications, profile.id]

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<Notification[]>(queryKey, (old) =>
        old?.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey })
      const now = new Date().toISOString()
      queryClient.setQueryData<Notification[]>(queryKey, (old) => old?.map((n) => ({ ...n, read_at: n.read_at ?? now })))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { markRead, markAllRead }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data, isPending } = useNotifications()
  const { markRead, markAllRead } = useNotificationActions()
  const unread = data?.filter((n) => !n.read_at).length ?? 0
  const recent = data?.slice(0, 8) ?? []

  const openNotification = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            <CheckCheck className="size-3.5" /> Mark all as read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isPending ? (
            <ListSkeleton rows={4} className="space-y-3 p-4" />
          ) : recent.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/60', !n.read_at && 'bg-accent/40')}
                  >
                    <span
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t px-4 py-2 text-center">
          <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
