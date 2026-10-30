import { MapPin, Monitor, UserRound } from 'lucide-react'
import { StatusBadge } from '@/components/StatusBadge'
import { formatTimeRange, weekdayShort } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { ClassWithCourse, Profile, Shift } from '@/lib/types'

export function isUncovered(shift: Shift) {
  return shift.needs_cover && !shift.cover_trainer_id && shift.status !== 'cancelled'
}

/** The person actually delivering the shift. */
export function deliveringTrainerId(shift: Shift) {
  return shift.cover_trainer_id ?? shift.trainer_id
}

export function ShiftListItem({
  shift,
  cls,
  profiles,
  showDate = true,
  showTrainer = true,
  conflict = false,
  onClick,
}: {
  shift: Shift
  cls?: ClassWithCourse
  profiles: Map<string, Profile>
  showDate?: boolean
  showTrainer?: boolean
  conflict?: boolean
  onClick?: () => void
}) {
  const trainer = profiles.get(shift.trainer_id)
  const cover = shift.cover_trainer_id ? profiles.get(shift.cover_trainer_id) : undefined
  const Wrapper = onClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border bg-card p-3 text-left',
        onClick && 'transition-colors hover:border-primary/40 hover:bg-accent/30',
        shift.status === 'cancelled' && 'opacity-60',
        isUncovered(shift) && 'border-warning/50',
        conflict && 'border-destructive/50',
      )}
    >
      {showDate && (
        <div className="flex w-12 shrink-0 flex-col items-center rounded-md bg-muted py-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase">{weekdayShort(shift.date)}</span>
          <span className="font-heading text-xl leading-none font-bold">{shift.date.slice(8, 10)}</span>
          <span className="text-[10px] text-muted-foreground">{shift.date.slice(5, 7)}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{cls?.name ?? 'Class'}</span>
          {shift.status !== 'scheduled' && <StatusBadge status={shift.status} />}
          {isUncovered(shift) && <StatusBadge status="needs-cover" />}
          {conflict && <StatusBadge status="conflict" />}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{formatTimeRange(shift.start_time, shift.end_time)}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {cls?.room && (
            <span className="inline-flex items-center gap-1">
              {cls.delivery_mode === 'online' ? <Monitor className="size-3" /> : <MapPin className="size-3" />}
              {cls.room}
            </span>
          )}
          {showTrainer && trainer && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3" />
              {cover ? (
                <>
                  <span className="line-through">{trainer.full_name}</span> {cover.full_name}
                </>
              ) : (
                trainer.full_name
              )}
            </span>
          )}
        </div>
      </div>
    </Wrapper>
  )
}
