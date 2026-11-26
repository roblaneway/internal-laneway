import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarPlus, ClipboardCheck, Loader2, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProfile } from '@/auth/AuthProvider'
import { keys, useAssessmentPlan, useClassUnits } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { formatDate, formatDayDate, todayISO } from '@/lib/dates'
import { RESULT_LABEL, RESULT_SHORT, RESULT_STYLE, hasPresented, plannedTasks, resultKey } from '@/lib/gradebook'
import { cn } from '@/lib/utils'
import type { ClassStudent, ClassTask, ClassWithCourse, Gradebook, TaskKind, TaskResult, TaskResultValue } from '@/lib/types'

// --- Add columns from the term plan -----------------------------------------------

/** The term plan's units for this class as gradebook columns; choose which to add. */
export function AddFromPlanForm({
  cls,
  kind,
  tasks,
  onDone,
}: {
  cls: ClassWithCourse
  kind: TaskKind
  tasks: ClassTask[]
  onDone: () => void
}) {
  const me = useProfile()
  const queryClient = useQueryClient()
  const units = useClassUnits(cls)
  const trainerId = me.role === 'admin' ? (cls.trainer_id ?? me.id) : me.id
  const plan = useAssessmentPlan(cls.term, trainerId)
  const options = useMemo(() => plannedTasks(kind, cls, units, plan.data ?? [], tasks), [kind, cls, units, plan.data, tasks])
  const optionKey = (o: (typeof options)[number]) => `${o.unit_code}:${o.title}`
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const chosen = options.filter((o) => !o.exists && !skipped.has(optionKey(o)))

  const add = useMutation({
    mutationFn: () =>
      Promise.all(
        chosen.map((o) => api.post(`/classes/${cls.id}/tasks`, { kind, title: o.title, unit_code: o.unit_code, due_date: o.due_date })),
      ),
    onSuccess: (rows) => {
      toast.success(`${rows.length} ${kind === 'presentation' ? (rows.length === 1 ? 'presentation' : 'presentations') : rows.length === 1 ? 'assessment' : 'assessments'} added`)
      queryClient.invalidateQueries({ queryKey: keys.gradebook(cls.id) })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const toggle = (key: string, on: boolean) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (on) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="contents">
      <DialogHeader>
        <DialogTitle>{kind === 'presentation' ? 'Presentations from the term plan' : 'Assessments from the term plan'}</DialogTitle>
        <DialogDescription>
          {kind === 'presentation'
            ? `Assessment 2 is the performance evidence, so each unit's students present it. Dates come from your ${cls.term} plan on My assessments.`
            : `Each unit's Assessment 1 and 2 for ${cls.term}, dated from your plan on My assessments.`}
        </DialogDescription>
      </DialogHeader>
      {plan.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your term plan…
        </p>
      ) : !options.length ? (
        <p className="text-sm text-muted-foreground">
          No units for {cls.course?.name ?? 'this class'} in {cls.term}. Add them under Units, or add the assessments to your{' '}
          <Link className="text-primary underline-offset-2 hover:underline" to={`/assessments?view=plan&term=${encodeURIComponent(cls.term)}`}>
            term plan
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {options.map((o) => {
            const key = optionKey(o)
            return (
              <li key={key}>
                <label className={cn('flex items-center gap-3 px-3 py-2 text-sm', o.exists ? 'text-muted-foreground' : 'cursor-pointer hover:bg-muted/40')}>
                  <Checkbox checked={o.exists || !skipped.has(key)} disabled={o.exists} onCheckedChange={(v) => toggle(key, v === true)} />
                  <span className="font-mono">{o.unit_code}</span>
                  <span className="flex-1">{o.title}</span>
                  <span className="text-xs tabular-nums">{o.exists ? 'Already added' : o.due_date ? formatDate(o.due_date) : 'No date'}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" disabled={!chosen.length || add.isPending} onClick={() => add.mutate()}>
          {add.isPending && <Loader2 className="size-4 animate-spin" />} Add {chosen.length || ''}
        </Button>
      </DialogFooter>
    </div>
  )
}

// --- Who has presented -----------------------------------------------------------

const BAR: Partial<Record<TaskResultValue, string>> = { S: 'bg-success', NYS: 'bg-destructive/70', RESCHEDULED: 'bg-primary/50', ABSENT: 'bg-warning' }

/** Per presentation: how many presented, and who still has to (absent, rescheduled or not yet). */
export function PresentationTracker({
  tasks,
  students,
  results,
  onRollCall,
  onMark,
}: {
  tasks: ClassTask[]
  students: ClassStudent[]
  results: Map<string, TaskResult>
  onRollCall: (task: ClassTask) => void
  onMark: (task: ClassTask, student: ClassStudent) => void
}) {
  const today = todayISO()
  const sorted = [...tasks].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-2">
      {sorted.map((task) => {
        const rows = students.map((s) => ({ s, r: results.get(resultKey(task.id, s.id)) }))
        const presented = rows.filter(({ r }) => hasPresented(r))
        const waiting = rows.filter(({ r }) => !hasPresented(r))
        const past = task.due_date !== null && task.due_date <= today
        return (
          <section key={task.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-sans text-sm font-semibold tracking-normal">
                  <span className="font-mono">{task.unit_code ?? '—'}</span> · {task.title}
                </h3>
                <p className="text-xs text-muted-foreground">{task.due_date ? formatDayDate(task.due_date) : 'No date set'}</p>
              </div>
              <Button size="sm" variant={past && waiting.length ? 'default' : 'outline'} onClick={() => onRollCall(task)}>
                <ClipboardCheck className="size-3.5" /> Roll call
              </Button>
            </div>

            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              {(['S', 'NYS', 'RESCHEDULED', 'ABSENT'] as const).map((v) => {
                const n = rows.filter(({ r }) => r?.result === v).length
                return n ? <span key={v} className={cn('h-full', BAR[v])} style={{ width: `${(n / rows.length) * 100}%` }} /> : null
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">
                {presented.length}/{rows.length} presented
              </span>
              {(['ABSENT', 'RESCHEDULED'] as const).map((v) => {
                const n = rows.filter(({ r }) => r?.result === v).length
                return n ? ` · ${n} ${RESULT_LABEL[v].toLowerCase()}` : ''
              })}
              {waiting.filter(({ r }) => !r).length > 0 && ` · ${waiting.filter(({ r }) => !r).length} not recorded`}
            </p>

            {waiting.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium">{past ? 'Still to present' : 'To present'}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {waiting.map(({ s, r }) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onMark(task, s)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          r ? RESULT_STYLE[r.result] : 'border-dashed text-muted-foreground hover:bg-muted',
                        )}
                        title={r ? `${RESULT_LABEL[r.result]}${r.marked_on ? ` · ${formatDate(r.marked_on)}` : ''}` : 'Not recorded yet'}
                      >
                        {s.full_name}
                        {r?.result === 'RESCHEDULED' && r.marked_on && ` → ${formatDate(r.marked_on).slice(0, 5)}`}
                        {r?.result === 'ABSENT' && ' · absent'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-xs text-success">Everyone has presented.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}

// --- Roll call --------------------------------------------------------------------

const ROLL_RESULTS: TaskResultValue[] = ['S', 'NYS', 'ABSENT', 'RESCHEDULED']

/**
 * Record a presentation for the whole class in one go: one click per student saves their result,
 * keeping any feedback and attempt already recorded. Rescheduled takes the new date.
 */
export function RollCall({ classId, task, gradebook, onDone }: { classId: string; task: ClassTask; gradebook: Gradebook; onDone: () => void }) {
  const queryClient = useQueryClient()
  const active = gradebook.students.filter((s) => !s.withdrawn)
  const results = useMemo(
    () => new Map(gradebook.results.filter((r) => r.task_id === task.id).map((r) => [r.student_id, r])),
    [gradebook.results, task.id],
  )
  const [pending, setPending] = useState<Set<string>>(new Set())
  const day = task.due_date && task.due_date <= todayISO() ? task.due_date : todayISO()

  const save = async (student: ClassStudent, result: TaskResultValue, markedOn: string | null) => {
    const current = results.get(student.id)
    setPending((p) => new Set(p).add(student.id))
    try {
      await api.put(`/task-results/${task.id}/${student.id}`, {
        result,
        attempt: current?.attempt ?? 1,
        marked_on: markedOn,
        feedback: current?.feedback ?? null,
      })
      await queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(student.id)
        return next
      })
    }
  }

  const rest = active.filter((s) => !results.has(s.id))
  const markRestAbsent = useMutation({
    mutationFn: () =>
      Promise.all(rest.map((s) => api.put(`/task-results/${task.id}/${s.id}`, { result: 'ABSENT', attempt: 1, marked_on: day, feedback: null }))),
    onSuccess: () => {
      toast.success(`${rest.length} marked absent`)
      queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
    },
    onError: (err) => toast.error(err.message),
  })

  const presented = active.filter((s) => hasPresented(results.get(s.id))).length

  return (
    <div className="contents">
      <DialogHeader>
        <DialogTitle>Roll call · {task.unit_code ?? task.title}</DialogTitle>
        <DialogDescription>
          {task.title}
          {task.due_date && ` · ${formatDayDate(task.due_date)}`}. Each click saves. {presented}/{active.length} presented.
        </DialogDescription>
      </DialogHeader>
      <ul className="-mx-1 max-h-[60vh] divide-y overflow-y-auto">
        {active.map((s) => {
          const r = results.get(s.id)
          const busy = pending.has(s.id)
          return (
            <li key={s.id} className="flex flex-col gap-2 px-1 py-2 sm:flex-row sm:items-center">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <span className="truncate">{s.full_name}</span>
                {busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {ROLL_RESULTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={busy}
                    aria-pressed={r?.result === v}
                    aria-label={`${s.full_name}: ${RESULT_LABEL[v]}`}
                    title={RESULT_LABEL[v]}
                    onClick={() => save(s, v, v === 'RESCHEDULED' ? (r?.result === 'RESCHEDULED' ? r.marked_on : null) : day)}
                    className={cn(
                      'h-8 min-w-12 rounded-md border px-2 text-xs font-semibold transition-colors disabled:opacity-50',
                      r?.result === v ? cn(RESULT_STYLE[v], 'ring-2 ring-current/30') : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {RESULT_SHORT[v]}
                  </button>
                ))}
                {r?.result === 'RESCHEDULED' && (
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarPlus className="size-3.5" aria-hidden />
                    <span className="sr-only">New date for {s.full_name}</span>
                    <Input
                      type="date"
                      className="h-8 w-36 text-xs"
                      defaultValue={r.marked_on ?? ''}
                      key={r.marked_on ?? ''}
                      onBlur={(e) => e.target.value !== (r.marked_on ?? '') && save(s, 'RESCHEDULED', e.target.value || null)}
                    />
                  </label>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" disabled={!rest.length || markRestAbsent.isPending} onClick={() => markRestAbsent.mutate()}>
          <UserX className="size-4" /> Mark the {rest.length || ''} not recorded absent
        </Button>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}
