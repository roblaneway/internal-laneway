import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarCheck2, ClipboardList, Megaphone, Pin, TriangleAlert, UserX } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ShiftListItem, isUncovered } from '@/components/roster/ShiftListItem'
import { audienceLabel } from '@/components/announcements/audience'
import {
  useAllContentPlans,
  useAnnouncements,
  useClasses,
  useCourses,
  useProfileMap,
  useRosterConflicts,
  useShifts,
} from '@/hooks/use-data'
import { useClassMap } from '@/hooks/use-class-map'
import { addDays, formatDate, formatDayDate, formatTimestampDate, inTerm, startOfWeek, termWeek, todayISO } from '@/lib/dates'
import { useProfile } from '@/auth/AuthProvider'
import { Panel, PanelLink, StatCard } from './shared'

export function AdminDashboard() {
  const profile = useProfile()
  const today = todayISO()
  const horizon = addDays(today, 13)
  const nextWeekStart = addDays(startOfWeek(today), 7)

  const shifts = useShifts(today, horizon)
  const conflicts = useRosterConflicts(today, horizon)
  const announcements = useAnnouncements()
  const classes = useClasses()
  const courses = useCourses()
  const plans = useAllContentPlans()
  const profiles = useProfileMap()
  const classMap = useClassMap()

  const todays = shifts.data?.filter((s) => s.date === today) ?? []
  const uncovered = shifts.data?.filter(isUncovered) ?? []
  const conflictIds = conflicts.data ?? new Set<string>()

  const plansNotReady = useMemo(() => {
    if (!classes.data || !plans.data) return []
    return classes.data
      .map((cls) => {
        const week = termWeek(cls.start_date, nextWeekStart)
        const plan = plans.data.find((p) => p.class_id === cls.id && p.week_number === week)
        return { cls, week, plan }
      })
      .filter(({ week, plan }) => inTerm(week) && (!plan || plan.status === 'draft'))
  }, [classes.data, plans.data, nextWeekStart])

  const recent = (announcements.data ?? []).filter((a) => a.published_at).slice(0, 5)

  return (
    <>
      <PageHeader title={`Good day, ${profile.full_name.split(' ')[0]}`} description={`Today is ${formatDayDate(today)} · Melbourne`} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Shifts today" value={todays.length} icon={CalendarCheck2} loading={shifts.isPending} to="/roster" />
        <StatCard
          label="Shifts needing cover"
          value={uncovered.length}
          icon={UserX}
          tone={uncovered.length ? 'warning' : 'default'}
          loading={shifts.isPending}
          to="/roster"
        />
        <StatCard
          label="Roster overlaps"
          value={conflictIds.size}
          icon={TriangleAlert}
          tone={conflictIds.size ? 'danger' : 'default'}
          loading={conflicts.isPending}
          to="/roster"
        />
        <StatCard
          label="Plans not ready (next week)"
          value={plansNotReady.length}
          icon={ClipboardList}
          tone={plansNotReady.length ? 'warning' : 'default'}
          loading={plans.isPending || classes.isPending}
          to="/classes"
        />
      </div>

      {uncovered.length > 0 && (
        <Alert className="mb-6 border-warning/50 bg-warning/10">
          <AlertTriangle className="text-[oklch(0.45_0.12_60)]" />
          <AlertTitle>
            {uncovered.length} upcoming {uncovered.length === 1 ? 'shift needs' : 'shifts need'} a cover trainer
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-0.5">
              {uncovered.map((s) => (
                <li key={s.id}>
                  {formatDayDate(s.date)} · {classMap.get(s.class_id)?.name} · {profiles.get(s.trainer_id)?.full_name}
                </li>
              ))}
            </ul>
            <Link to={`/roster?week=${startOfWeek(uncovered[0].date)}`} className="mt-2 inline-block font-medium text-primary hover:underline">
              Assign cover in the roster →
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Today's shifts" action={<PanelLink to="/roster">Open roster</PanelLink>}>
          {shifts.error ? (
            <ErrorState error={shifts.error} />
          ) : shifts.isPending ? (
            <ListSkeleton rows={3} />
          ) : todays.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="No shifts today" description="Nothing is rostered for today." />
          ) : (
            <div className="space-y-2">
              {todays.map((s) => (
                <ShiftListItem key={s.id} shift={s} cls={classMap.get(s.class_id)} profiles={profiles} showDate={false} conflict={conflictIds.has(s.id)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Content not ready for next week" action={<PanelLink to="/classes">All plans</PanelLink>}>
          {plans.error ? (
            <ErrorState error={plans.error} />
          ) : plans.isPending || classes.isPending ? (
            <ListSkeleton rows={3} />
          ) : plansNotReady.length === 0 ? (
            <EmptyState icon={ClipboardList} title="All set for next week" description="Every class has its next-week plan marked ready." />
          ) : (
            <ul className="divide-y">
              {plansNotReady.map(({ cls, week, plan }) => (
                <li key={cls.id}>
                  <Link to={`/classes/${cls.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{cls.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        Week {week} · {plan?.topic || 'No plan entered yet'}
                      </span>
                    </span>
                    {plan ? (
                      <StatusBadge status={plan.status} />
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Not started
                      </Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent announcements" action={<PanelLink to="/announcements">View all</PanelLink>} className="lg:col-span-2">
          {announcements.error ? (
            <ErrorState error={announcements.error} />
          ) : announcements.isPending ? (
            <ListSkeleton rows={4} />
          ) : recent.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements yet" />
          ) : (
            <ul className="divide-y">
              {recent.map((a) => (
                <li key={a.id}>
                  <Link to={`/announcements/${a.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                    <span className="flex min-w-0 items-center gap-2">
                      {a.pinned && <Pin className="size-3.5 shrink-0 text-primary" aria-label="Pinned" />}
                      <span className="truncate text-sm font-medium">{a.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {audienceLabel(a, courses.data, classes.data)} · {formatTimestampDate(a.published_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Next week starts {formatDate(nextWeekStart)}.</p>
    </>
  )
}
