import { Fragment, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock, CopyPlus, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { useProfile } from '@/auth/AuthProvider'
import { keys, useAssessmentPlan, useClasses, useCourseUnits, useTrainers } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { addDays, formatDate, inTerm, termWeek, todayISO } from '@/lib/dates'
import { invoiceDescription } from '@/lib/invoice'
import { cn } from '@/lib/utils'
import type { AssessmentKind, AssessmentPlanRow, MarkedAssessment, MarkingStatus } from '@/lib/types'

/** Days after the due date to finish marking, when no review date is set. */
const REVIEW_DAYS = 7

const STATUS_LABELS: Record<MarkingStatus, string> = { marked: 'Marked', ready: 'Ready' }

const nextActivity = (activity: string) => {
  const match = activity.match(/^(.*?)(\d+)\s*$/)
  return match ? `${match[1]}${Number(match[2]) + 1}` : `${activity} 2`
}

const reviewBy = (row: Pick<AssessmentPlanRow, 'due_on' | 'review_by'>) =>
  row.review_by ?? (row.due_on ? addDays(row.due_on, REVIEW_DAYS) : null)

type Draft = Partial<AssessmentPlanRow> & { course: string; unit_code: string; activity: string }

/**
 * A trainer's assessments for a term, grouped by course: each unit's due and review dates, how
 * many submissions and resubmissions they marked, and whether that's ready for the next invoice.
 */
export function AssessmentPlan() {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const [params, setParams] = useSearchParams()
  const trainers = useTrainers()
  // Admins see one trainer's plan at a time (the first trainer until one is chosen).
  const trainerId = isAdmin ? params.get('trainer') || trainers.data?.[0]?.id || '' : me.id
  const term = params.get('term')
  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(key, value)
      return next
    })
  const classes = useClasses()
  const today = todayISO()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Draft | null>(null)

  const terms = useMemo(
    () => [...new Set((classes.data ?? []).map((c) => c.term))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    [classes.data],
  )
  const currentTerm = classes.data?.find((c) => inTerm(termWeek(c.start_date, today)))?.term
  const selectedTerm = term && terms.includes(term) ? term : (currentTerm ?? terms[0])
  const plan = useAssessmentPlan(selectedTerm, trainerId)

  const fill = useMutation({
    mutationFn: () => api.post<{ added: number }>('/assessment-plan/from-units', { term: selectedTerm, ...(isAdmin && { trainer_id: trainerId }) }),
    onSuccess: ({ added }) => {
      toast.success(added ? `Added ${added} ${added === 1 ? 'unit' : 'units'} from the course units` : 'Every unit is already in the plan')
      queryClient.invalidateQueries({ queryKey: keys.allAssessments })
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/assessment-plan/${id}`),
    onSuccess: () => {
      toast.success('Removed from the plan')
      queryClient.invalidateQueries({ queryKey: keys.allAssessments })
    },
    onError: (err) => toast.error(err.message),
  })

  const rows = useMemo(() => plan.data ?? [], [plan.data])
  const groups = useMemo(() => {
    const byCourse = new Map<string, AssessmentPlanRow[]>()
    for (const row of rows) byCourse.set(row.course, [...(byCourse.get(row.course) ?? []), row])
    return [...byCourse]
  }, [rows])

  const totals = useMemo(() => {
    const sum = (status: MarkingStatus) =>
      rows.flatMap((r) => r.markings).reduce((n, m) => n + (m.status === status ? m.quantity : 0), 0)
    return { marked: sum('marked'), ready: sum('ready') }
  }, [rows])

  const error = classes.error ?? trainers.error ?? plan.error
  if (error) return <ErrorState error={error} />
  if (classes.isPending || trainers.isPending) return <ListSkeleton rows={5} />
  if (!terms.length || !selectedTerm) {
    return <EmptyState icon={CalendarClock} title="No terms yet" description="Terms come from the classes an administrator sets up." />
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={selectedTerm} onValueChange={(v) => setParam('term', v)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Term">
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
            <SelectTrigger className="w-full sm:w-52" aria-label="Trainer">
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
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" disabled={fill.isPending || !trainerId} onClick={() => fill.mutate()}>
            {fill.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Fill from units
          </Button>
          <Button className="flex-1 sm:flex-none" disabled={!trainerId} onClick={() => setEditing({ course: '', unit_code: '', activity: 'Assessment 1' })}>
            <Plus className="size-4" /> Add assessment
          </Button>
        </div>
      </div>

      {plan.isPending ? (
        <ListSkeleton rows={6} />
      ) : !rows.length ? (
        <EmptyState
          icon={CalendarClock}
          title={`No assessments planned for ${selectedTerm}`}
          description="Fill the plan from the units of the courses you teach this term, or add assessments one by one."
        />
      ) : (
        <>
          <Card className="gap-0 overflow-x-auto py-0">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Assessment</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Review by</th>
                  <th className="px-3 py-2 font-medium">Marked</th>
                  <th className="px-3 py-2 font-medium">Reassessments</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map(([course, courseRows]) => (
                  <Fragment key={course}>
                    <tr className="border-b bg-muted/60">
                      <th colSpan={8} scope="colgroup" className="px-3 py-1.5 text-left text-xs font-semibold tracking-wide uppercase">
                        {course}
                      </th>
                    </tr>
                    {courseRows.map((row) => (
                      <PlanRow
                        key={row.id}
                        row={row}
                        today={today}
                        onEdit={() => setEditing(row)}
                        onNext={() =>
                          setEditing({ course: row.course, unit_code: row.unit_code, activity: nextActivity(row.activity), trainer_id: row.trainer_id })
                        }
                        onRemove={() => remove.mutate(row.id)}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-right text-sm text-muted-foreground">
            {totals.marked} marked, not invoiced yet · {totals.ready} ready or invoiced this term
          </p>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <PlanForm
              key={editing.id ?? 'new'}
              draft={editing}
              term={selectedTerm}
              trainerId={trainerId}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function PlanRow({
  row,
  today,
  onEdit,
  onNext,
  onRemove,
}: {
  row: AssessmentPlanRow
  today: string
  onEdit: () => void
  onNext: () => void
  onRemove: () => void
}) {
  const review = reviewBy(row)
  const assessment = row.markings.find((m) => m.kind === 'Assessment')
  const reassessment = row.markings.find((m) => m.kind === 'Reassessment')
  const overdue = !assessment && review !== null && review < today
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-2 font-mono whitespace-nowrap">{row.unit_code}</td>
      <td className="px-3 py-2 whitespace-nowrap">{row.activity}</td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.due_on ? formatDate(row.due_on) : '—'}</td>
      <td className={cn('px-3 py-2 whitespace-nowrap tabular-nums', overdue && 'font-medium text-destructive')}>
        {review ? formatDate(review) : '—'}
        {overdue && <span className="sr-only"> (overdue)</span>}
      </td>
      <td className="px-3 py-1.5">
        <MarkingCell
          key={`a:${assessment?.quantity}`}
          planId={row.id}
          kind="Assessment"
          marking={assessment}
          label={`${row.unit_code} ${row.activity}`}
        />
      </td>
      <td className="px-3 py-1.5">
        <MarkingCell
          key={`r:${reassessment?.quantity}`}
          planId={row.id}
          kind="Reassessment"
          marking={reassessment}
          label={`${row.unit_code} ${row.activity} reassessments`}
        />
      </td>
      <td className="max-w-56 px-3 py-2">
        <p className="truncate text-muted-foreground" title={row.notes ?? undefined}>
          {row.notes}
        </p>
      </td>
      <td className="px-2 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${row.unit_code} ${row.activity}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onNext}>
              <CopyPlus className="size-4" /> Add {nextActivity(row.activity)}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 className="size-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}

/** How many were marked, and whether they're only marked or ready for the next invoice. */
function MarkingCell({
  planId,
  kind,
  marking,
  label,
}: {
  planId: string
  kind: AssessmentKind
  marking: MarkedAssessment | undefined
  label: string
}) {
  const queryClient = useQueryClient()
  const saved = marking ? String(marking.quantity) : ''
  // Remounted (by key) when the saved quantity changes, so this starts from it.
  const [quantity, setQuantity] = useState(saved)

  const save = useMutation({
    mutationFn: (change: { quantity: number; status?: MarkingStatus }) => api.put(`/assessment-plan/${planId}/marking`, { kind, ...change }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.allAssessments }),
    onError: (err) => {
      toast.error(err.message)
      setQuantity(saved)
    },
  })

  const commit = () => {
    if (quantity.trim() === saved) return
    const qty = Number(quantity)
    if (quantity.trim() !== '' && (!Number.isInteger(qty) || qty < 0 || qty > 500)) {
      toast.error('Enter a whole number from 0 to 500')
      setQuantity(saved)
      return
    }
    save.mutate({ quantity: qty })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setQuantity(saved)
      e.currentTarget.blur()
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        min="0"
        max="500"
        step="1"
        value={quantity}
        placeholder="0"
        aria-label={`How many ${label} marked`}
        className="h-8 w-16 tabular-nums"
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <Select
        value={marking?.status ?? ''}
        disabled={!marking || save.isPending}
        onValueChange={(status) => marking && save.mutate({ quantity: marking.quantity, status: status as MarkingStatus })}
      >
        <SelectTrigger
          size="sm"
          aria-label={`Status of ${label}`}
          className={cn(
            'w-28',
            marking?.status === 'ready' && 'border-success/30 bg-success/10 text-success',
            marking?.status === 'marked' && 'border-warning/40 bg-warning/15 text-[oklch(0.45_0.12_60)]',
          )}
          title={
            marking?.status === 'ready' && marking.ready_on
              ? `On the invoice for the fortnight of ${formatDate(marking.ready_on)}`
              : marking?.status === 'marked'
                ? 'Not on an invoice yet'
                : undefined
          }
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="marked">{STATUS_LABELS.marked} · not invoiced</SelectItem>
          <SelectItem value="ready">{STATUS_LABELS.ready} · next invoice</SelectItem>
        </SelectContent>
      </Select>
      {save.isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  )
}

function PlanForm({ draft, term, trainerId, onDone }: { draft: Draft; term: string; trainerId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const classes = useClasses()
  const units = useCourseUnits()
  const [course, setCourse] = useState(draft.course)
  const [unitCode, setUnitCode] = useState(draft.unit_code)
  const [activity, setActivity] = useState(draft.activity)
  const [dueOn, setDueOn] = useState(draft.due_on ?? '')
  const [reviewOn, setReviewOn] = useState(draft.review_by ?? '')
  const [notes, setNotes] = useState(draft.notes ?? '')

  // Suggest the names classes use on invoices, and the term's unit codes.
  const courseOptions = useMemo(
    () => [...new Set((classes.data ?? []).filter((c) => c.term === term).map((c) => invoiceDescription(c)))].sort(),
    [classes.data, term],
  )
  const unitOptions = useMemo(() => {
    const courseIds = new Set((classes.data ?? []).filter((c) => c.term === term && invoiceDescription(c) === course).map((c) => c.course_id))
    const termUnits = (units.data ?? []).filter((u) => u.term === term)
    const matching = termUnits.filter((u) => courseIds.has(u.course_id))
    return [...new Map((matching.length ? matching : termUnits).map((u) => [u.code, u])).values()]
  }, [classes.data, units.data, term, course])

  const changeDue = (value: string) => {
    // Keep the review date a week after the due date, unless it was set to something else.
    if (!reviewOn || (dueOn && reviewOn === addDays(dueOn, REVIEW_DAYS))) setReviewOn(value ? addDays(value, REVIEW_DAYS) : '')
    setDueOn(value)
  }

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        course: course.trim(),
        unit_code: unitCode.trim().toUpperCase(),
        activity: activity.trim(),
        due_on: dueOn || null,
        review_by: reviewOn || null,
        notes: notes.trim() || null,
      }
      if (draft.id) await api.patch(`/assessment-plan/${draft.id}`, row)
      else await api.post('/assessment-plan', { ...row, term, trainer_id: draft.trainer_id ?? trainerId })
    },
    onSuccess: () => {
      toast.success('Assessment saved')
      queryClient.invalidateQueries({ queryKey: keys.allAssessments })
      onDone()
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
        <DialogTitle>{draft.id ? 'Edit assessment' : 'Add assessment'}</DialogTitle>
        <DialogDescription>{term}. Record how many you marked from the plan's table.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-course">Course</Label>
          <Input id="p-course" required list="p-course-options" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="DIPLOMA IT" />
          <datalist id="p-course-options">
            {courseOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-unit">Unit code</Label>
            <Input
              id="p-unit"
              required
              list="p-unit-options"
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value.toUpperCase())}
              placeholder="ICTWEB519"
            />
            <datalist id="p-unit-options">
              {unitOptions.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.title ?? undefined}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-activity">Assessment</Label>
            <Input id="p-activity" required value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Assessment 1" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-due">Due date</Label>
            <Input id="p-due" type="date" value={dueOn} onChange={(e) => changeDue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-review">Review by</Label>
            <Input id="p-review" type="date" min={dueOn || undefined} value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-notes">Notes</Label>
          <Textarea id="p-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Extensions, late submissions…" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !trainerId}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}
