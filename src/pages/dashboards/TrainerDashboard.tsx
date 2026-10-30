import { Link } from 'react-router-dom'
import { BookOpen, CalendarDays, Monitor, MapPin } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { ShiftListItem } from '@/components/roster/ShiftListItem'
import { useMyClasses, useProfileMap, useRosterConflicts, useShifts } from '@/hooks/use-data'
import { useClassMap } from '@/hooks/use-class-map'
import { addDays, formatDayDate, defaultWeekStart, isWeekend, todayISO } from '@/lib/dates'
import { useProfile } from '@/auth/AuthProvider'
import { NextSessionPlan, findNextSession } from './NextSessionPlan'
import { Panel, PanelLink } from './shared'

export function TrainerDashboard() {
  const profile = useProfile()
  const today = todayISO()
  const weekStart = defaultWeekStart(today)
  const weekLabel = isWeekend(today) ? 'next week' : 'this week'
  const weekEnd = addDays(weekStart, 6)

  // RLS returns only this trainer's own and covered shifts.
  const shifts = useShifts(weekStart, addDays(weekStart, 27))
  const conflicts = useRosterConflicts(weekStart, weekEnd)
  const myClasses = useMyClasses()
  const profiles = useProfileMap()
  const classMap = useClassMap()

  const thisWeek = shifts.data?.filter((s) => s.date <= weekEnd) ?? []
  const next = findNextSession(shifts.data)

  return (
    <>
      <PageHeader title={`Welcome, ${profile.full_name.split(' ')[0]}`} description={`Today is ${formatDayDate(today)} · Melbourne`} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={`My shifts ${weekLabel}`} action={<PanelLink to="/roster">Full roster</PanelLink>}>
          {shifts.error ? (
            <ErrorState error={shifts.error} />
          ) : shifts.isPending ? (
            <ListSkeleton rows={4} />
          ) : thisWeek.length === 0 ? (
            <EmptyState icon={CalendarDays} title={`No shifts ${weekLabel}`} description="Enjoy the break — nothing is rostered for you." />
          ) : (
            <div className="space-y-2">
              {thisWeek.map((s) => (
                <ShiftListItem
                  key={s.id}
                  shift={s}
                  cls={classMap.get(s.class_id)}
                  profiles={profiles}
                  conflict={conflicts.data?.has(s.id)}
                  showTrainer={s.trainer_id !== profile.id || Boolean(s.cover_trainer_id)}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Next session plan">
          {shifts.isPending ? <ListSkeleton rows={2} /> : <NextSessionPlan shift={next} cls={next && classMap.get(next.class_id)} audience="trainer" />}
        </Panel>

        <Panel title="My classes" action={<PanelLink to="/classes">All classes</PanelLink>} className="lg:col-span-2">
          {myClasses.error ? (
            <ErrorState error={myClasses.error} />
          ) : myClasses.isPending ? (
            <ListSkeleton rows={3} />
          ) : !myClasses.data?.length ? (
            <EmptyState icon={BookOpen} title="No classes assigned" description="Ask an administrator to assign you as a class trainer." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {myClasses.data.map((c) => (
                <Link key={c.id} to={`/classes/${c.id}`} className="rounded-md border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.course?.name}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {c.delivery_mode === 'online' ? <Monitor className="size-3" /> : <MapPin className="size-3" />}
                    {c.room}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
