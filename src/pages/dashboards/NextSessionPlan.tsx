import { Link } from 'react-router-dom'
import { ClipboardList, ExternalLink } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { StatusBadge } from '@/components/StatusBadge'
import { useContentPlans } from '@/hooks/use-data'
import { formatDayDate, formatTimeRange, nowTimeHHMM, termWeek, todayISO, toTimeInput } from '@/lib/dates'
import type { ClassWithCourse, Shift } from '@/lib/types'

/** First non-cancelled shift that hasn't finished yet. */
export function findNextSession(shifts: Shift[] | undefined): Shift | undefined {
  const today = todayISO()
  const now = nowTimeHHMM()
  return shifts?.find(
    (s) => s.status !== 'cancelled' && (s.date > today || (s.date === today && toTimeInput(s.end_time) > now)),
  )
}

export function NextSessionPlan({ shift, cls, audience }: { shift?: Shift; cls?: ClassWithCourse; audience: 'trainer' | 'student' }) {
  const plans = useContentPlans(shift?.class_id)

  if (!shift || !cls) {
    return <EmptyState icon={ClipboardList} title="No upcoming sessions" description="Nothing is scheduled in the next few weeks." />
  }
  if (plans.isPending) return <ListSkeleton rows={2} />

  const week = termWeek(cls.start_date, shift.date)
  const plan = plans.data?.find((p) => p.week_number === week)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{cls.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatDayDate(shift.date)} · {formatTimeRange(shift.start_time, shift.end_time)} · Week {week}
          </p>
        </div>
        {plan && audience === 'trainer' && <StatusBadge status={plan.status} />}
      </div>

      {plan ? (
        <div className={`rounded-md border p-3 ${plan.assessment_due ? 'border-warning/50 bg-warning/10' : 'bg-muted/40'}`}>
          <div className="flex flex-wrap items-center gap-2">
            {plan.unit_code && <span className="font-mono text-xs text-muted-foreground">{plan.unit_code}</span>}
            {plan.assessment_due && <StatusBadge status="assessment" />}
          </div>
          <p className="mt-1 text-sm font-medium">{plan.topic}</p>
          {plan.learning_outcomes && <p className="mt-1 text-sm text-muted-foreground">{plan.learning_outcomes}</p>}
          {plan.resources_url && (
            <a
              href={plan.resources_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Resources <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {audience === 'trainer' ? `No plan for week ${week} yet.` : 'Content for this session will be shared soon.'}
        </p>
      )}

      <Link to={`/classes/${cls.id}`} className="text-xs font-medium text-primary hover:underline">
        {audience === 'trainer' ? 'Open content plan →' : 'See all weeks →'}
      </Link>
    </div>
  )
}
