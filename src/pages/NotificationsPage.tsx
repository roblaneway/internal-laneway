import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { useNotificationActions } from '@/components/layout/NotificationBell'
import { useNotifications } from '@/hooks/use-data'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function NotificationsPage() {
  const notifications = useNotifications()
  const { markRead, markAllRead } = useNotificationActions()
  const unread = notifications.data?.filter((n) => !n.read_at).length ?? 0

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={
          <Button variant="outline" disabled={!unread || markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck className="size-4" /> Mark all as read
          </Button>
        }
      />

      {notifications.error ? (
        <ErrorState error={notifications.error} />
      ) : notifications.isPending ? (
        <ListSkeleton rows={6} />
      ) : !notifications.data?.length ? (
        <EmptyState icon={Bell} title="No notifications yet" description="You'll be notified here when announcements are published for you." />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {notifications.data.map((n) => (
            <div key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.read_at && 'bg-accent/40')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} aria-hidden />
              <div className="min-w-0 flex-1">
                <Link
                  to={n.link ?? '#'}
                  onClick={() => !n.read_at && markRead.mutate(n.id)}
                  className={cn('text-sm hover:text-primary', !n.read_at && 'font-semibold')}
                >
                  {n.title}
                </Link>
                {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(n.created_at)}>
                  {timeAgo(n.created_at)}
                </p>
              </div>
              {!n.read_at && (
                <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => markRead.mutate(n.id)}>
                  Mark as read
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
