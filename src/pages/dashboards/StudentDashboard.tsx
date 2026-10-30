import { Link } from 'react-router-dom'
import { Bell, CalendarDays, Pin } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { RichText } from '@/components/RichText'
import { ShiftListItem } from '@/components/roster/ShiftListItem'
import { useNotificationActions } from '@/components/layout/NotificationBell'
import { useAnnouncements, useNotifications, useProfileMap, useShifts } from '@/hooks/use-data'
import { useClassMap } from '@/hooks/use-class-map'
import { addDays, defaultWeekStart, formatDayDate, formatTimestampDate, isWeekend, timeAgo, todayISO } from '@/lib/dates'
import { useProfile } from '@/auth/AuthProvider'
import { NextSessionPlan, findNextSession } from './NextSessionPlan'
import { Panel, PanelLink } from './shared'

export function StudentDashboard() {
  const profile = useProfile()
  const today = todayISO()
  const weekStart = defaultWeekStart(today)
  const weekLabel = isWeekend(today) ? 'next week' : 'this week'
  const weekEnd = addDays(weekStart, 6)

  // RLS returns the sessions of the student's enrolled classes.
  const sessions = useShifts(weekStart, addDays(weekStart, 27))
  const announcements = useAnnouncements()
  const notifications = useNotifications()
  const { markRead } = useNotificationActions()
  const profiles = useProfileMap()
  const classMap = useClassMap()

  const thisWeek = sessions.data?.filter((s) => s.date <= weekEnd) ?? []
  const next = findNextSession(sessions.data)
  const pinned = announcements.data?.filter((a) => a.pinned && a.published_at) ?? []
  const unread = notifications.data?.filter((n) => !n.read_at) ?? []

  return (
    <>
      <PageHeader title={`Hi, ${profile.full_name.split(' ')[0]}`} description={`Today is ${formatDayDate(today)} · Melbourne`} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={`My timetable ${weekLabel}`} action={<PanelLink to="/timetable">Full timetable</PanelLink>}>
          {sessions.error ? (
            <ErrorState error={sessions.error} />
          ) : sessions.isPending ? (
            <ListSkeleton rows={3} />
          ) : thisWeek.length === 0 ? (
            <EmptyState icon={CalendarDays} title={`No classes ${weekLabel}`} description="Check the full timetable for upcoming weeks." />
          ) : (
            <div className="space-y-2">
              {thisWeek.map((s) => (
                <ShiftListItem key={s.id} shift={s} cls={classMap.get(s.class_id)} profiles={profiles} />
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Unread notifications" action={<PanelLink to="/notifications">View all</PanelLink>}>
            {notifications.isPending ? (
              <ListSkeleton rows={3} />
            ) : unread.length === 0 ? (
              <EmptyState icon={Bell} title="You're all caught up" />
            ) : (
              <ul className="divide-y">
                {unread.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <Link to={n.link ?? '/notifications'} onClick={() => markRead.mutate(n.id)} className="block py-2.5 hover:text-primary">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Coming up in class">
            {sessions.isPending ? <ListSkeleton rows={2} /> : <NextSessionPlan shift={next} cls={next && classMap.get(next.class_id)} audience="student" />}
          </Panel>
        </div>

        <Panel title="Pinned announcements" action={<PanelLink to="/announcements">All announcements</PanelLink>} className="lg:col-span-2">
          {announcements.error ? (
            <ErrorState error={announcements.error} />
          ) : announcements.isPending ? (
            <ListSkeleton rows={2} />
          ) : pinned.length === 0 ? (
            <EmptyState icon={Pin} title="Nothing pinned right now" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {pinned.map((a) => (
                <Link key={a.id} to={`/announcements/${a.id}`} className="rounded-md border p-4 transition-colors hover:border-primary/40">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Pin className="size-3.5 text-primary" /> {a.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatTimestampDate(a.published_at)}</p>
                  <RichText html={a.body} className="mt-2 line-clamp-3" />
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
