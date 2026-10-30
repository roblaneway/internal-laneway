import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { ShiftDialog, type ShiftDraft } from '@/components/roster/ShiftDialog'
import { deliveringTrainerId, isUncovered } from '@/components/roster/ShiftListItem'
import { useClasses, useProfileMap, useProfiles, useRosterConflicts, useShifts } from '@/hooks/use-data'
import { addDays, addMonths, diffDays, formatDate, formatMonth, formatTime, startOfWeek, todayISO, weekDays } from '@/lib/dates'
import { formatHours, invoiceEnd, shiftHours } from '@/lib/invoice'
import { cn } from '@/lib/utils'
import { useProfile } from '@/auth/AuthProvider'
import type { Shift } from '@/lib/types'

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_CHIPS = 3

/** Week / month switch shown in the roster header. Keeps the period in view when switching. */
export function RangeTabs({ range }: { range: 'week' | 'month' }) {
  const [params, setParams] = useSearchParams()
  const onChange = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('range', value)
    const thisMonth = todayISO().slice(0, 7)
    if (value === 'month') {
      const week = params.get('week')
      if (week) next.set('month', week.slice(0, 7))
    } else {
      const month = params.get('month')
      if (month && month !== thisMonth) next.set('week', startOfWeek(`${month}-01`))
      else next.delete('week')
    }
    setParams(next, { replace: true })
  }
  return (
    <Tabs value={range} onValueChange={onChange}>
      <TabsList>
        <TabsTrigger value="week">Week</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

/** Picking weeks for an invoice: up to two consecutive weeks. */
function toggleWeek(selected: string[], week: string): string[] {
  if (selected.includes(week)) return selected.filter((w) => w !== week)
  if (selected.length === 1 && Math.abs(diffDays(week, selected[0])) === 7) return [selected[0], week].sort()
  return [week]
}

export function MonthRoster() {
  const profile = useProfile()
  const isAdmin = profile.role === 'admin'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const thisMonth = today.slice(0, 7)
  const monthParam = params.get('month') ?? ''
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : thisMonth

  const first = `${month}-01`
  const last = addDays(`${addMonths(month, 1)}-01`, -1)
  const gridStart = startOfWeek(first)
  const gridEnd = addDays(startOfWeek(last), 6)
  const weeks = useMemo(() => {
    const list: string[] = []
    for (let w = gridStart; w <= gridEnd; w = addDays(w, 7)) list.push(w)
    return list
  }, [gridStart, gridEnd])

  // Admins look at everyone or one trainer; trainers only ever see themselves.
  const trainerParam = params.get('trainer') ?? 'all'
  const trainerId = isAdmin ? trainerParam : profile.id

  const shifts = useShifts(gridStart, gridEnd)
  const conflicts = useRosterConflicts(gridStart, gridEnd)
  const classes = useClasses()
  const profilesQuery = useProfiles()
  const profiles = useProfileMap()

  const [selected, setSelected] = useState<string[]>([])
  const [dialog, setDialog] = useState<{ shift?: Shift; draft?: ShiftDraft } | null>(null)

  const trainers = useMemo(() => (profilesQuery.data ?? []).filter((p) => p.role === 'trainer'), [profilesQuery.data])
  const classList = useMemo(() => classes.data ?? [], [classes.data])
  const shiftList = useMemo(() => shifts.data ?? [], [shifts.data])
  const conflictIds = conflicts.data ?? new Set<string>()

  const visible = useMemo(
    () => (trainerId === 'all' ? shiftList : shiftList.filter((s) => s.trainer_id === trainerId || s.cover_trainer_id === trainerId)),
    [shiftList, trainerId],
  )

  /** Hours actually delivered: not cancelled, and by the chosen trainer when there is one. */
  const deliveredHours = (list: Shift[]) =>
    list
      .filter((s) => s.status !== 'cancelled' && (trainerId === 'all' || deliveringTrainerId(s) === trainerId))
      .reduce((sum, s) => sum + shiftHours(s), 0)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { replace: true })
  }

  // The fortnight being invoiced, which may reach outside the month on screen.
  const invoiceFrom = selected.length === 2 ? selected[0] : null
  const invoiceShifts = useShifts(invoiceFrom ?? '', invoiceFrom ? invoiceEnd(invoiceFrom) : '', invoiceFrom !== null)
  const invoiceTrainerId = trainerId === 'all' ? null : trainerId
  const fortnightHours = invoiceFrom && invoiceShifts.data ? deliveredHours(invoiceShifts.data) : null

  const generate = () => {
    if (!invoiceFrom || !invoiceTrainerId) return
    navigate(`/roster/invoice?${new URLSearchParams({ trainer: invoiceTrainerId, from: invoiceFrom })}`)
  }

  const loading = shifts.isPending || classes.isPending || profilesQuery.isPending

  const weekSelector = (week: string, className?: string) => {
    const isSelected = selected.includes(week)
    const weekShifts = visible.filter((s) => s.date >= week && s.date <= addDays(week, 6))
    return (
      <button
        type="button"
        onClick={() => setSelected((s) => toggleWeek(s, week))}
        aria-pressed={isSelected}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} week of ${formatDate(week)}`}
        className={cn(
          'flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
          isSelected && 'bg-primary/10 text-primary hover:bg-primary/15',
          className,
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
            isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-card',
          )}
        >
          {isSelected && <Check className="size-3" />}
        </span>
        <span>
          <span className="block font-semibold">Week of {formatDate(week).slice(0, 5)}</span>
          <span className="block text-muted-foreground">{formatHours(deliveredHours(weekShifts))}</span>
        </span>
      </button>
    )
  }

  const chip = (s: Shift) => {
    const cls = classList.find((c) => c.id === s.class_id)
    const uncovered = isUncovered(s)
    const conflict = conflictIds.has(s.id)
    const who = profiles.get(deliveringTrainerId(s))?.full_name.split(' ')[0]
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => setDialog({ shift: s })}
        className={cn(
          'block w-full truncate rounded border-l-3 border-primary bg-accent/60 px-1.5 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-accent',
          s.status === 'covered' && 'border-success bg-success/10',
          uncovered && 'border-warning bg-warning/15',
          conflict && 'border-destructive bg-destructive/10',
          s.status === 'cancelled' && 'border-muted-foreground/40 bg-muted text-muted-foreground line-through opacity-70',
        )}
        title={`${formatTime(s.start_time)}–${formatTime(s.end_time)} · ${cls?.name ?? ''}${who ? ` · ${who}` : ''}`}
      >
        <span className="font-semibold">{formatTime(s.start_time).replace(':00', '')}</span> {cls?.name}
        {trainerId === 'all' && who && <span className="text-muted-foreground"> · {who}</span>}
      </button>
    )
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Trainer roster' : 'My roster'}
        description="Select two weeks to generate an invoice for that fortnight."
        actions={
          <>
            <RangeTabs range="month" />
            {isAdmin && (
              <Button onClick={() => setDialog({ draft: { date: first, ...(trainerId !== 'all' && { trainer_id: trainerId }) } })}>
                <Plus className="size-4" /> New shift
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setParam('month', addMonths(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-40 text-center text-sm font-medium">{formatMonth(month)}</div>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setParam('month', addMonths(month, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setParam('month', thisMonth)} disabled={month === thisMonth}>
            This month
          </Button>
        </div>
        {isAdmin && (
          <Select value={trainerParam} onValueChange={(v) => setParam('trainer', v)}>
            <SelectTrigger className="md:w-56" aria-label="Trainer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trainers</SelectItem>
              {trainers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card className="mb-4 flex-row flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm">
          {selected.length === 2 ? (
            <>
              <span className="font-medium">
                {formatDate(selected[0])} – {formatDate(invoiceEnd(selected[0]))}
              </span>
              {invoiceTrainerId && (
                <span className="text-muted-foreground">
                  {' '}
                  · {profiles.get(invoiceTrainerId)?.full_name} · {fortnightHours === null ? '…' : formatHours(fortnightHours)}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {selected.length === 1 ? 'Now select the week before or after it.' : 'Select two consecutive weeks to invoice.'}
            </span>
          )}
          {selected.length === 2 && !invoiceTrainerId && <span className="block text-xs text-muted-foreground">Choose a trainer above to invoice for.</span>}
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          )}
          <Button onClick={generate} disabled={!invoiceFrom || !invoiceTrainerId}>
            <FileText className="size-4" /> Generate invoice
          </Button>
        </div>
      </Card>

      {shifts.error ? (
        <ErrorState error={shifts.error} />
      ) : loading ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : (
        <>
          {/* Desktop: calendar grid, one row per week */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-32 px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Week</th>
                  {WEEKDAY_HEADERS.map((d, i) => (
                    <th key={d} className={cn('px-2 py-2 text-left text-xs font-semibold text-muted-foreground', i >= 5 && 'w-20')}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week} className={cn('border-b last:border-0', selected.includes(week) && 'bg-primary/5')}>
                    <th scope="row" className="px-1 py-1.5 align-top font-normal">
                      {weekSelector(week, 'w-full')}
                    </th>
                    {weekDays(week).map((d) => {
                      const items = visible.filter((s) => s.date === d)
                      const inMonth = d.slice(0, 7) === month
                      return (
                        <td key={d} className={cn('h-28 border-l px-1 py-1 align-top', !inMonth && 'bg-muted/40', d === today && 'bg-accent/30')}>
                          <span
                            className={cn(
                              'mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs',
                              !inMonth && 'text-muted-foreground/60',
                              d === today && 'bg-primary font-semibold text-primary-foreground',
                            )}
                          >
                            {Number(d.slice(8))}
                          </span>
                          <div className="space-y-0.5">
                            {items.slice(0, MAX_CHIPS).map(chip)}
                            {items.length > MAX_CHIPS && (
                              <button
                                type="button"
                                className="px-1 text-[11px] font-medium text-primary hover:underline"
                                onClick={() => {
                                  const next = new URLSearchParams(params)
                                  next.set('range', 'week')
                                  next.set('week', week)
                                  setParams(next)
                                }}
                              >
                                +{items.length - MAX_CHIPS} more
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

          {/* Mobile: weeks stacked, each listing its sessions */}
          <div className="space-y-3 md:hidden">
            {weeks.map((week) => {
              const items = visible.filter((s) => s.date >= week && s.date <= addDays(week, 6))
              return (
                <Card key={week} className={cn('gap-2 px-3 py-3', selected.includes(week) && 'border-primary')}>
                  {weekSelector(week)}
                  {items.length === 0 ? (
                    <p className="px-2 text-xs text-muted-foreground">No sessions.</p>
                  ) : (
                    <div className="space-y-1">
                      {items.map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">{formatDate(s.date).slice(0, 5)}</span>
                          <div className="min-w-0 flex-1">{chip(s)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
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
