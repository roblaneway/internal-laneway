import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { ShiftListItem } from '@/components/roster/ShiftListItem'
import { useProfileMap, useShifts } from '@/hooks/use-data'
import { useClassMap } from '@/hooks/use-class-map'
import { addDays, formatDate, startOfWeek, todayISO, weekDays, weekdayLong, defaultWeekStart, isWeekend } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Student timetable: the sessions of their enrolled classes, a week at a time. */
export function TimetablePage() {
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const thisWeek = defaultWeekStart(today)
  const weekStart = startOfWeek(params.get('week') ?? thisWeek)
  const weekEnd = addDays(weekStart, 6)
  const sessions = useShifts(weekStart, weekEnd)
  const classMap = useClassMap()
  const profiles = useProfileMap()

  const go = (week: string) => setParams({ week }, { replace: true })
  const days = weekDays(weekStart).filter((d) => sessions.data?.some((s) => s.date === d))

  return (
    <>
      <PageHeader title="My timetable" description="Sessions for the classes you're enrolled in." />

      <div className="mb-5 flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => go(addDays(weekStart, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-48 text-center text-sm font-medium">
          {formatDate(weekStart)} – {formatDate(weekEnd)}
        </span>
        <Button variant="outline" size="icon" aria-label="Next week" onClick={() => go(addDays(weekStart, 7))}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" disabled={weekStart === thisWeek} onClick={() => go(thisWeek)}>
          {isWeekend(today) ? 'Next week' : 'This week'}
        </Button>
      </div>

      {sessions.error ? (
        <ErrorState error={sessions.error} />
      ) : sessions.isPending ? (
        <ListSkeleton rows={4} />
      ) : days.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No classes this week" description="Try the next week, or check announcements for timetable changes." />
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <section key={d}>
              <h2 className={cn('mb-2 text-xl font-semibold uppercase', d === today && 'text-primary')}>
                {weekdayLong(d)} <span className="text-base font-normal text-muted-foreground">{formatDate(d)}</span>
                {d === today && <span className="ml-2 text-sm">· Today</span>}
              </h2>
              <div className="space-y-2">
                {sessions.data
                  ?.filter((s) => s.date === d)
                  .map((s) => (
                    <ShiftListItem key={s.id} shift={s} cls={classMap.get(s.class_id)} profiles={profiles} showDate={false} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
