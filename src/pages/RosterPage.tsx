import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { MonthRoster, RangeTabs } from '@/components/roster/MonthRoster'
import { ShiftDialog, type ShiftDraft } from '@/components/roster/ShiftDialog'
import { ShiftListItem, deliveringTrainerId, isUncovered } from '@/components/roster/ShiftListItem'
import { useClasses, useProfileMap, useProfiles, useRosterConflicts, useShifts } from '@/hooks/use-data'
import { addDays, formatDate, formatTime, startOfWeek, todayISO, weekDays, weekdayShort, defaultWeekStart, isWeekend } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useProfile } from '@/auth/AuthProvider'
import type { ClassWithCourse, Profile, Shift } from '@/lib/types'

type View = 'trainer' | 'class'

interface Row {
  id: string
  label: string
  sublabel?: string
}

export function RosterPage() {
  const [params] = useSearchParams()
  return params.get('range') === 'month' ? <MonthRoster /> : <WeekRoster />
}

function WeekRoster() {
  const profile = useProfile()
  const isAdmin = profile.role === 'admin'
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const thisWeek = defaultWeekStart(today)
  const weekStart = startOfWeek(params.get('week') ?? thisWeek)
  const weekEnd = addDays(weekStart, 6)
  const view: View = params.get('view') === 'class' ? 'class' : 'trainer'

  const shifts = useShifts(weekStart, weekEnd)
  const conflicts = useRosterConflicts(weekStart, weekEnd)
  const classes = useClasses()
  const profilesQuery = useProfiles()
  const profiles = useProfileMap()

  const [dialog, setDialog] = useState<{ shift?: Shift; draft?: ShiftDraft } | null>(null)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  const trainers = useMemo(() => (profilesQuery.data ?? []).filter((p) => p.role === 'trainer'), [profilesQuery.data])
  const classList = useMemo(() => classes.data ?? [], [classes.data])
  const shiftList = useMemo(() => shifts.data ?? [], [shifts.data])
  const conflictIds = conflicts.data ?? new Set<string>()

  // Show weekends only when something is rostered on them.
  const days = weekDays(weekStart).filter((d, i) => i < 5 || shiftList.some((s) => s.date === d))

  const rows: Row[] = useMemo(() => {
    if (view === 'trainer') {
      if (!isAdmin) return [{ id: profile.id, label: profile.full_name }]
      return trainers.map((t) => ({ id: t.id, label: t.full_name }))
    }
    const visible = isAdmin ? classList : classList.filter((c) => shiftList.some((s) => s.class_id === c.id))
    return visible.map((c) => ({ id: c.id, label: c.name, sublabel: c.course?.code }))
  }, [view, isAdmin, profile, trainers, classList, shiftList])

  /** Shifts in a grid cell. In trainer view a covered shift shows under both trainers. */
  const cellShifts = (rowId: string, date: string) =>
    shiftList.filter((s) => {
      if (s.date !== date) return false
      if (view === 'class') return s.class_id === rowId
      return s.trainer_id === rowId || s.cover_trainer_id === rowId
    })

  const uncoveredCount = shiftList.filter(isUncovered).length
  const loading = shifts.isPending || classes.isPending || profilesQuery.isPending

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Trainer roster' : 'My roster'}
        description={isAdmin ? 'Plan shifts, arrange cover and resolve overlaps.' : 'Your shifts and the classes you are covering.'}
        actions={
          <>
            <RangeTabs range="week" />
            {isAdmin && (
              <Button onClick={() => setDialog({ draft: { date: weekStart } })}>
                <Plus className="size-4" /> New shift
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setParam('week', addDays(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-48 text-center text-sm font-medium">
            {formatDate(weekStart)} – {formatDate(weekEnd)}
          </div>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setParam('week', addDays(weekStart, 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setParam('week', thisWeek)} disabled={weekStart === thisWeek}>
            {isWeekend(today) ? 'Next week' : 'This week'}
          </Button>
        </div>
        <Tabs value={view} onValueChange={(v) => setParam('view', v)}>
          <TabsList>
            <TabsTrigger value="trainer">By trainer</TabsTrigger>
            <TabsTrigger value="class">By class</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {(uncoveredCount > 0 || conflictIds.size > 0) && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {uncoveredCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/10 px-3 py-1.5">
              <UserX className="size-4" /> {uncoveredCount} {uncoveredCount === 1 ? 'shift needs' : 'shifts need'} cover this week
            </span>
          )}
          {conflictIds.size > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-destructive">
              <AlertTriangle className="size-4" /> {conflictIds.size} overlapping shifts — open one to fix it
            </span>
          )}
        </div>
      )}

      {shifts.error ? (
        <ErrorState error={shifts.error} />
      ) : loading ? (
        <Skeleton className="h-96 w-full" />
      ) : rows.length === 0 || (shiftList.length === 0 && !isAdmin) ? (
        <EmptyState icon={CalendarDays} title="No shifts this week" description="Use the arrows to look at another week." />
      ) : (
        <>
          {/* Desktop: week grid */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-44 px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                    {view === 'trainer' ? 'Trainer' : 'Class'}
                  </th>
                  {days.map((d) => (
                    <th key={d} className={cn('px-2 py-2 text-left text-xs font-semibold', d === today ? 'text-primary' : 'text-muted-foreground')}>
                      {weekdayShort(d)} <span className="font-normal">{formatDate(d).slice(0, 5)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-2 text-left align-top">
                      <span className="block truncate text-sm font-medium">{row.label}</span>
                      {row.sublabel && <span className="block text-xs font-normal text-muted-foreground">{row.sublabel}</span>}
                    </th>
                    {days.map((d) => {
                      const items = cellShifts(row.id, d)
                      return (
                        <td key={d} className={cn('group h-20 border-l px-1.5 py-1.5 align-top', d === today && 'bg-accent/30')}>
                          <div className="space-y-1">
                            {items.map((s) => (
                              <ShiftChip
                                key={s.id}
                                shift={s}
                                view={view}
                                rowId={row.id}
                                classes={classList}
                                profiles={profiles}
                                conflict={conflictIds.has(s.id)}
                                onClick={() => setDialog({ shift: s })}
                              />
                            ))}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDialog({ draft: view === 'trainer' ? { trainer_id: row.id, date: d } : { class_id: row.id, date: d } })
                                }
                                className="flex w-full items-center justify-center rounded border border-dashed py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                aria-label={`Add shift for ${row.label} on ${formatDate(d)}`}
                              >
                                <Plus className="size-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: list grouped by day */}
          <div className="space-y-5 md:hidden">
            {days.map((d) => {
              const items = shiftList.filter((s) => s.date === d)
              return (
                <section key={d}>
                  <h2 className={cn('mb-2 text-lg font-semibold uppercase', d === today && 'text-primary')}>
                    {weekdayShort(d)} {formatDate(d)}
                  </h2>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No shifts.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((s) => (
                        <ShiftListItem
                          key={s.id}
                          shift={s}
                          cls={classList.find((c) => c.id === s.class_id)}
                          profiles={profiles}
                          showDate={false}
                          conflict={conflictIds.has(s.id)}
                          onClick={() => setDialog({ shift: s })}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Legend:</span>
            <StatusBadge status="scheduled" />
            <StatusBadge status="covered" />
            <StatusBadge status="cancelled" />
            <StatusBadge status="needs-cover" />
            <StatusBadge status="conflict" />
          </div>
        </>
      )}

      <ShiftDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        shift={dialog?.shift}
        draft={dialog?.draft}
        canEdit={isAdmin}
        currentUserId={profile.id}
        trainers={trainers}
        classes={classList}
        knownShifts={shiftList}
        profiles={profiles}
        conflict={dialog?.shift ? conflictIds.has(dialog.shift.id) : false}
      />
    </>
  )
}

function ShiftChip({
  shift,
  view,
  rowId,
  classes,
  profiles,
  conflict,
  onClick,
}: {
  shift: Shift
  view: View
  rowId: string
  classes: ClassWithCourse[]
  profiles: Map<string, Profile>
  conflict: boolean
  onClick: () => void
}) {
  const cls = classes.find((c) => c.id === shift.class_id)
  const delivering = deliveringTrainerId(shift)
  // In trainer view, the original trainer's copy of a covered shift is shown faded.
  const handedOver = view === 'trainer' && shift.cover_trainer_id !== null && rowId !== delivering
  const coveringFor = view === 'trainer' && shift.cover_trainer_id === rowId
  const uncovered = isUncovered(shift)

  const label =
    view === 'trainer'
      ? cls?.name
      : profiles.get(delivering)?.full_name

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full rounded border-l-3 bg-accent/60 px-2 py-1 text-left text-xs transition-colors hover:bg-accent',
        'border-primary',
        shift.status === 'covered' && 'border-success bg-success/10 hover:bg-success/15',
        uncovered && 'border-warning bg-warning/15 hover:bg-warning/25',
        conflict && 'border-destructive bg-destructive/10 hover:bg-destructive/15',
        (shift.status === 'cancelled' || handedOver) && 'border-muted-foreground/40 bg-muted text-muted-foreground opacity-70',
      )}
    >
      <span className={cn('block font-semibold', shift.status === 'cancelled' && 'line-through')}>
        {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
      </span>
      <span className="block truncate">{label}</span>
      {(uncovered || conflict || coveringFor || handedOver || shift.status === 'cancelled') && (
        <span className="mt-0.5 block truncate font-medium">
          {shift.status === 'cancelled'
            ? 'Cancelled'
            : conflict
              ? 'Overlap'
              : uncovered
                ? 'Needs cover'
                : coveringFor
                  ? `Covering ${profiles.get(shift.trainer_id)?.full_name.split(' ')[0] ?? ''}`
                  : `Covered by ${profiles.get(shift.cover_trainer_id!)?.full_name.split(' ')[0] ?? ''}`}
        </span>
      )}
    </button>
  )
}
