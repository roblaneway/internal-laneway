import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Loader2, NotebookTabs, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { deliveringTrainerId } from '@/components/roster/ShiftListItem'
import { useProfile } from '@/auth/AuthProvider'
import { keys, useClasses, useClassPreparation, useShifts, useTrainerBilling, useTrainers } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { addDays, formatDate, inTerm, startOfWeek, TERM_WEEKS, termWeek, todayISO } from '@/lib/dates'
import { formatHours, formatMoney, formatRate } from '@/lib/invoice'
import { cn } from '@/lib/utils'
import type { ClassPreparation, ClassWithCourse } from '@/lib/types'

const WEEKS = Array.from({ length: TERM_WEEKS }, (_, i) => i + 1)

/** Prep hours per class per term week, paid at the hourly rate on each fortnight's invoice. */
export function PreparationPage() {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const classes = useClasses()
  const trainers = useTrainers()
  const trainerId = isAdmin ? (params.get('trainer') ?? trainers.data?.[0]?.id ?? '') : me.id
  const preparation = useClassPreparation(trainerId)
  const billing = useTrainerBilling(trainerId || undefined)
  const [editing, setEditing] = useState<{ cls: ClassWithCourse; week: number; entry?: ClassPreparation } | null>(null)

  const terms = useMemo(() => [...new Set((classes.data ?? []).map((c) => c.term))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })), [classes.data])
  const currentTerm = classes.data?.find((c) => inTerm(termWeek(c.start_date, today)))?.term
  const term = terms.includes(params.get('term') ?? '') ? params.get('term')! : (currentTerm ?? terms[0])
  const termClasses = useMemo(() => (classes.data ?? []).filter((c) => c.term === term), [classes.data, term])

  // The term's shifts tell us which classes the trainer teaches (lead trainer or rostered).
  const termStart = termClasses.reduce((min, c) => (c.start_date < min ? c.start_date : min), termClasses[0]?.start_date ?? today)
  const termEnd = addDays(termClasses.reduce((max, c) => (c.start_date > max ? c.start_date : max), termStart), TERM_WEEKS * 7 - 1)
  const shifts = useShifts(termStart, termEnd, termClasses.length > 0)

  const rows = useMemo(() => {
    const taught = new Set(
      (shifts.data ?? []).filter((s) => s.status !== 'cancelled' && deliveringTrainerId(s) === trainerId).map((s) => s.class_id),
    )
    const withPrep = new Set(preparation.data?.map((p) => p.class_id))
    return termClasses.filter((c) => c.trainer_id === trainerId || taught.has(c.id) || withPrep.has(c.id))
  }, [termClasses, shifts.data, preparation.data, trainerId])

  const entries = useMemo(() => new Map((preparation.data ?? []).map((p) => [`${p.class_id}:${p.week_number}`, p])), [preparation.data])
  const hoursFor = (classId: string, week: number) => Number(entries.get(`${classId}:${week}`)?.hours ?? 0)
  const rateCents = billing.data?.hourly_rate != null ? Math.round(Number(billing.data.hourly_rate) * 100) : null
  const totalHours = rows.reduce((sum, c) => sum + WEEKS.reduce((s, w) => s + hoursFor(c.id, w), 0), 0)
  const invoiceLink = trainerId && `/roster/invoice?${new URLSearchParams({ from: startOfWeek(addDays(today, -14)), ...(isAdmin && { trainer: trainerId }) })}`

  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(key, value)
      return next
    })

  const error = classes.error ?? preparation.error ?? shifts.error ?? trainers.error
  if (error) return <ErrorState error={error} />

  return (
    <>
      <PageHeader
        title="Class preparation"
        description="Hours spent preparing each class, per term week. They're paid at the hourly rate on the invoice for the fortnight the week starts in."
        actions={
          invoiceLink && (
            <Button asChild variant="outline">
              <Link to={invoiceLink}>
                <FileText className="size-4" /> Open invoice
              </Link>
            </Button>
          )
        }
      />

      {classes.isPending || trainers.isPending || (Boolean(trainerId) && preparation.isPending) || (termClasses.length > 0 && shifts.isPending) ? (
        <ListSkeleton rows={5} />
      ) : !terms.length ? (
        <EmptyState icon={NotebookTabs} title="No classes yet" description="Classes are set up by an administrator." />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={term} onValueChange={(v) => setParam('term', v)}>
              <SelectTrigger className="w-full sm:w-60" aria-label="Term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                    {t === currentTerm && ' (current)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={trainerId} onValueChange={(v) => setParam('trainer', v)}>
                <SelectTrigger className="w-full sm:w-60" aria-label="Trainer">
                  <SelectValue placeholder="Choose a trainer" />
                </SelectTrigger>
                <SelectContent>
                  {trainers.data?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-sm text-muted-foreground sm:ml-auto">
              {formatHours(totalHours)} this term
              {rateCents !== null && totalHours > 0 && ` · ${formatMoney(Math.round(totalHours * rateCents))} at ${formatRate(rateCents)}/hr`}
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={NotebookTabs}
              title="No classes this term"
              description={isAdmin ? 'This trainer has no classes in this term.' : "Classes you lead or are rostered on this term appear here."}
            />
          ) : (
            <Card className="gap-0 overflow-x-auto py-0">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Class</th>
                    {WEEKS.map((w) => (
                      <th key={w} className={cn('px-1 py-3 text-center font-medium', isCurrentWeek(rows, w, today) && 'text-primary')}>
                        W{w}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((c) => {
                    const week = termWeek(c.start_date, today)
                    const rowHours = WEEKS.reduce((s, w) => s + hoursFor(c.id, w), 0)
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-2">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.course?.name}</p>
                        </td>
                        {WEEKS.map((w) => {
                          const entry = entries.get(`${c.id}:${w}`)
                          return (
                            <td key={w} className={cn('px-1 py-2 text-center', w === week && 'bg-accent/60')}>
                              <button
                                type="button"
                                onClick={() => setEditing({ cls: c, week: w, entry })}
                                title={entry?.notes ?? `Week ${w} starting ${formatDate(addDays(c.start_date, (w - 1) * 7))}`}
                                aria-label={`${c.name} week ${w}: ${entry ? `${Number(entry.hours)} hours` : 'add prep'}`}
                                className={cn(
                                  'inline-flex h-8 w-11 items-center justify-center rounded-md border text-xs transition-colors',
                                  entry
                                    ? 'border-primary/30 bg-primary/10 font-semibold text-primary hover:bg-primary/15'
                                    : 'border-dashed text-muted-foreground/60 hover:border-primary/40 hover:text-primary',
                                )}
                              >
                                {entry ? Number(entry.hours) : <Plus className="size-3.5" />}
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{rowHours ? formatHours(rowHours) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <PrepForm key={`${editing.cls.id}:${editing.week}`} {...editing} trainerId={trainerId} isAdmin={isAdmin} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Whether week `w` is the current term week for the classes shown. */
const isCurrentWeek = (rows: ClassWithCourse[], w: number, today: string) => rows.some((c) => termWeek(c.start_date, today) === w)

function PrepForm({
  cls,
  week,
  entry,
  trainerId,
  isAdmin,
  onDone,
}: {
  cls: ClassWithCourse
  week: number
  entry?: ClassPreparation
  trainerId: string
  isAdmin: boolean
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [hours, setHours] = useState(entry ? String(Number(entry.hours)) : '')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const done = () => {
    queryClient.invalidateQueries({ queryKey: keys.allPreparation })
    onDone()
  }

  const save = useMutation({
    mutationFn: () =>
      api.put('/class-preparation', {
        ...(isAdmin && { trainer_id: trainerId }),
        class_id: cls.id,
        week_number: week,
        hours: Number(hours),
        notes,
      }),
    onSuccess: () => {
      toast.success(`Week ${week} prep saved`)
      done()
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/class-preparation/${entry!.id}`),
    onSuccess: () => {
      toast.success(`Week ${week} prep removed`)
      done()
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>
          {cls.name} · Week {week}
        </DialogTitle>
        <DialogDescription>Week starting {formatDate(addDays(cls.start_date, (week - 1) * 7))}. Paid at the hourly rate.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="prep-hours">Preparation hours</Label>
          <Input
            id="prep-hours"
            type="number"
            inputMode="decimal"
            min="0.25"
            max="24"
            step="0.25"
            required
            autoFocus
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="1.5"
            className="w-32"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prep-notes">Notes</Label>
          <Textarea id="prep-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you prepared (optional)" />
        </div>
      </div>
      <DialogFooter className="sm:justify-between">
        {entry ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={!hours || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
