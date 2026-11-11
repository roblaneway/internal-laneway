import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GraduationCap, Loader2, MessageSquare, Pencil, Plus, Presentation, Trash2, UserPlus, Users } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { UnitCodeInput } from '@/components/UnitCodeInput'
import { keys, useClassUnits, useGradebook, useMyClasses } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { formatDate, inTerm, termWeek, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { ClassStudent, ClassTask, Gradebook, TaskKind, TaskResult, TaskResultValue } from '@/lib/types'

type Tab = 'assessment' | 'presentation' | 'students'
const TABS: Tab[] = ['assessment', 'presentation', 'students']

const RESULTS: Record<TaskKind, TaskResultValue[]> = {
  assessment: ['S', 'NYS', 'NS'],
  presentation: ['S', 'NYS', 'ABSENT', 'RESCHEDULED'],
}

const RESULT_LABEL: Record<TaskResultValue, string> = {
  S: 'Satisfactory',
  NYS: 'Not yet satisfactory',
  NS: 'Not submitted',
  ABSENT: 'Absent',
  RESCHEDULED: 'Rescheduled',
}

const RESULT_SHORT: Record<TaskResultValue, string> = { S: 'S', NYS: 'NYS', NS: 'NS', ABSENT: 'Absent', RESCHEDULED: 'Resched.' }

const RESULT_STYLE: Record<TaskResultValue, string> = {
  S: 'bg-success/10 text-success border-success/30',
  NYS: 'bg-destructive/10 text-destructive border-destructive/30',
  NS: 'bg-muted text-muted-foreground border-border',
  ABSENT: 'bg-warning/15 text-[oklch(0.45_0.12_60)] border-warning/30',
  RESCHEDULED: 'bg-accent text-accent-foreground border-primary/20',
}

const KIND_LABEL: Record<TaskKind, { one: string; many: string }> = {
  assessment: { one: 'assessment', many: 'Assessments' },
  presentation: { one: 'presentation', many: 'Presentations' },
}

const resultKey = (taskId: string, studentId: string) => `${taskId}:${studentId}`
const attemptLabel = (attempt: number) => (attempt === 1 ? '1st attempt' : attempt === 2 ? 'Reassessment' : '2nd reassessment')

/** A trainer's results for their students' assessments and presentations, per class. */
export function GradebookPage() {
  const myClasses = useMyClasses()
  const [params, setParams] = useSearchParams()
  const today = todayISO()

  // This term's classes first; classes from other terms stay reachable below them.
  const classes = useMemo(() => {
    const list = [...(myClasses.data ?? [])]
    const current = (c: { start_date: string }) => inTerm(termWeek(c.start_date, today))
    return list.sort((a, b) => Number(current(b)) - Number(current(a)) || a.name.localeCompare(b.name))
  }, [myClasses.data, today])

  const classId = classes.some((c) => c.id === params.get('class')) ? params.get('class')! : classes[0]?.id
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'assessment'
  const cls = classes.find((c) => c.id === classId)
  const gradebook = useGradebook(classId)

  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set(key, value)
      return next
    })

  if (myClasses.error) return <ErrorState error={myClasses.error} />
  if (myClasses.isPending) return <ListSkeleton rows={6} />
  if (!classes.length)
    return <EmptyState icon={GraduationCap} title="No classes yet" description="Classes you teach this term will appear here." />

  const week = cls ? termWeek(cls.start_date, today) : 0

  return (
    <>
      <PageHeader
        title="Gradebook"
        description="Your students' results for this term's assessments and presentations. Only you, the class's other trainers and admins can see them."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={classId} onValueChange={(v) => setParam('class', v)}>
          <SelectTrigger className="w-full sm:w-80" aria-label="Class">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} · {c.term}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cls && (
          <p className="text-sm text-muted-foreground">
            {cls.course?.code} · {cls.term}
            {inTerm(week) && <Badge className="ml-2 align-middle">Week {week}</Badge>}
          </p>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam('tab', v)} className="mb-4">
        <TabsList>
          <TabsTrigger value="assessment">Assessments</TabsTrigger>
          <TabsTrigger value="presentation">Presentations</TabsTrigger>
          <TabsTrigger value="students">
            Students{gradebook.data && ` (${gradebook.data.students.filter((s) => !s.withdrawn).length})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {gradebook.error ? (
        <ErrorState error={gradebook.error} />
      ) : gradebook.isPending || !classId ? (
        <ListSkeleton rows={6} />
      ) : tab === 'students' ? (
        <StudentsPanel classId={classId} gradebook={gradebook.data} />
      ) : (
        <ResultsGrid key={`${classId}-${tab}`} classId={classId} kind={tab} gradebook={gradebook.data} onAddStudents={() => setParam('tab', 'students')} />
      )}
    </>
  )
}

// --- Results grid ------------------------------------------------------------

function ResultsGrid({
  classId,
  kind,
  gradebook,
  onAddStudents,
}: {
  classId: string
  kind: TaskKind
  gradebook: Gradebook
  onAddStudents: () => void
}) {
  const [editingTask, setEditingTask] = useState<ClassTask | 'new' | null>(null)
  const [marking, setMarking] = useState<{ taskId: string; studentId: string } | null>(null)

  const tasks = gradebook.tasks.filter((t) => t.kind === kind)
  const students = gradebook.students
  const active = students.filter((s) => !s.withdrawn)
  const results = useMemo(() => new Map(gradebook.results.map((r) => [resultKey(r.task_id, r.student_id), r])), [gradebook.results])
  const label = KIND_LABEL[kind]
  const Icon = kind === 'presentation' ? Presentation : GraduationCap

  const addButton = (
    <Button onClick={() => setEditingTask('new')}>
      <Plus className="size-4" /> Add {label.one}
    </Button>
  )

  let body
  if (!students.length) {
    body = (
      <EmptyState
        icon={Users}
        title="No students on this class yet"
        description="Add your students first, then record their results here."
        action={
          <Button onClick={onAddStudents}>
            <UserPlus className="size-4" /> Add students
          </Button>
        }
      />
    )
  } else if (!tasks.length) {
    body = (
      <EmptyState
        icon={Icon}
        title={`No ${label.many.toLowerCase()} yet`}
        description={`Add this term's ${label.many.toLowerCase()} to start recording results.`}
        action={addButton}
      />
    )
  } else {
    const outstanding = tasks.reduce(
      (sum, t) => sum + active.filter((s) => results.get(resultKey(t.id, s.id))?.result !== 'S').length,
      0,
    )
    body = (
      <>
        <p className="mb-2 text-sm text-muted-foreground">
          Select a cell to record a result.{' '}
          {outstanding ? `${outstanding} still to be satisfactory.` : `Every active student is satisfactory in all ${label.many.toLowerCase()}.`}
        </p>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-44 bg-muted px-3 py-2">Student</th>
                {tasks.map((t) => (
                  <th key={t.id} className="min-w-32 px-2 py-2 align-bottom">
                    <button
                      type="button"
                      className="group flex w-full flex-col items-start rounded px-1 text-left hover:bg-background"
                      onClick={() => setEditingTask(t)}
                      aria-label={`Edit ${t.title}`}
                    >
                      <span className="flex items-center gap-1 text-foreground">
                        {t.title} <Pencil className="size-3 opacity-0 group-hover:opacity-60" />
                      </span>
                      <span className="font-mono font-normal">{t.unit_code}</span>
                      {t.due_date && <span className="font-normal">Due {formatDate(t.due_date)}</span>}
                    </button>
                  </th>
                ))}
                <th className="min-w-20 px-3 py-2 text-right">Satisfactory</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const done = tasks.filter((t) => results.get(resultKey(t.id, s.id))?.result === 'S').length
                return (
                  <tr key={s.id} className={cn('border-b last:border-0', s.withdrawn && 'text-muted-foreground')}>
                    <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                      <span className={cn(s.withdrawn && 'line-through')}>{s.full_name}</span>
                      {s.student_number && <span className="block text-xs font-normal text-muted-foreground">{s.student_number}</span>}
                      {s.withdrawn && <span className="block text-xs font-normal">Withdrawn</span>}
                    </th>
                    {tasks.map((t) => {
                      const r = results.get(resultKey(t.id, s.id))
                      return (
                        <td key={t.id} className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => setMarking({ taskId: t.id, studentId: s.id })}
                            aria-label={`${s.full_name}, ${t.title}: ${r ? RESULT_LABEL[r.result] : 'no result'}`}
                            className={cn(
                              'flex h-9 w-full items-center justify-center gap-1 rounded-md border text-xs font-semibold transition-colors',
                              r ? RESULT_STYLE[r.result] : 'border-dashed text-muted-foreground hover:bg-muted',
                            )}
                          >
                            {r ? RESULT_SHORT[r.result] : '—'}
                            {r && r.attempt > 1 && <span className="font-normal">· R{r.attempt - 1}</span>}
                            {r?.feedback && <MessageSquare className="size-3" aria-hidden />}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.withdrawn ? '—' : `${done}/${tasks.length}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 text-xs text-muted-foreground">
                <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-semibold">
                  Satisfactory
                </th>
                {tasks.map((t) => {
                  const done = active.filter((s) => results.get(resultKey(t.id, s.id))?.result === 'S').length
                  return (
                    <td key={t.id} className="px-3 py-2 tabular-nums">
                      {done}/{active.length}
                    </td>
                  )
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </>
    )
  }

  const markingTask = marking && tasks.find((t) => t.id === marking.taskId)
  const markingStudent = marking && students.find((s) => s.id === marking.studentId)

  return (
    <>
      {students.length > 0 && tasks.length > 0 && <div className="mb-3 flex justify-end">{addButton}</div>}
      {body}

      <Dialog open={editingTask !== null} onOpenChange={(o) => !o && setEditingTask(null)}>
        <DialogContent className="sm:max-w-md">
          {editingTask !== null && (
            <TaskForm
              key={editingTask === 'new' ? 'new' : editingTask.id}
              classId={classId}
              kind={kind}
              task={editingTask === 'new' ? undefined : editingTask}
              onDone={() => setEditingTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(markingTask && markingStudent)} onOpenChange={(o) => !o && setMarking(null)}>
        <DialogContent className="sm:max-w-md">
          {markingTask && markingStudent && (
            <ResultForm
              key={resultKey(markingTask.id, markingStudent.id)}
              classId={classId}
              task={markingTask}
              student={markingStudent}
              result={results.get(resultKey(markingTask.id, markingStudent.id))}
              hasNext={active.findIndex((s) => s.id === markingStudent.id) < active.length - 1}
              onNext={() => {
                const i = active.findIndex((s) => s.id === markingStudent.id)
                setMarking(active[i + 1] ? { taskId: markingTask.id, studentId: active[i + 1].id } : null)
              }}
              onDone={() => setMarking(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ResultForm({
  classId,
  task,
  student,
  result,
  hasNext,
  onNext,
  onDone,
}: {
  classId: string
  task: ClassTask
  student: ClassStudent
  result?: TaskResult
  hasNext: boolean
  onNext: () => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState<TaskResultValue | ''>(result?.result ?? '')
  const [attempt, setAttempt] = useState(String(result?.attempt ?? 1))
  const [markedOn, setMarkedOn] = useState(result?.marked_on ?? todayISO())
  const [feedback, setFeedback] = useState(result?.feedback ?? '')
  const isPresentation = task.kind === 'presentation'
  const path = `/task-results/${task.id}/${student.id}`

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      await api.put(path, { result: value, attempt: Number(attempt), marked_on: markedOn || null, feedback })
      return next
    },
    onSuccess: async (next) => {
      await queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
      if (next) onNext()
      else onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const clear = useMutation({
    mutationFn: () => api.delete(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate(false)
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>{student.full_name}</DialogTitle>
        <DialogDescription>
          {task.title}
          {task.unit_code && ` · ${task.unit_code}`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">Result</legend>
          <div className="grid grid-cols-2 gap-2">
            {RESULTS[task.kind].map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={value === r}
                onClick={() => setValue(r)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  value === r ? cn(RESULT_STYLE[r], 'ring-2 ring-current/40') : 'hover:bg-muted',
                )}
              >
                <span className="block font-semibold">{RESULT_SHORT[r]}</span>
                <span className="block text-xs opacity-80">{RESULT_LABEL[r]}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Attempt</Label>
            <Select value={attempt} onValueChange={setAttempt}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {attemptLabel(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-date">{isPresentation ? 'Date presented' : 'Date marked'}</Label>
            <Input id="r-date" type="date" value={markedOn} onChange={(e) => setMarkedOn(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r-feedback">Feedback</Label>
          <Textarea
            id="r-feedback"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={isPresentation ? 'How the presentation went, what to improve' : 'What to fix for the reassessment'}
          />
        </div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {result ? (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={clear.isPending} onClick={() => clear.mutate()}>
            <Trash2 className="size-4" /> Clear result
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {hasNext && (
            <Button type="button" variant="outline" disabled={!value || save.isPending} onClick={() => save.mutate(true)}>
              Save &amp; next student
            </Button>
          )}
          <Button type="submit" disabled={!value || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

function TaskForm({ classId, kind, task, onDone }: { classId: string; kind: TaskKind; task?: ClassTask; onDone: () => void }) {
  const queryClient = useQueryClient()
  const label = KIND_LABEL[kind].one
  const [title, setTitle] = useState(task?.title ?? '')
  const units = useClassUnits(useMyClasses().data?.find((c) => c.id === classId))
  const [unitCode, setUnitCode] = useState(task?.unit_code ?? '')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const done = () => {
    queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
    onDone()
  }

  const save = useMutation({
    mutationFn: async () => {
      const row = { kind, title: title.trim(), unit_code: unitCode.trim().toUpperCase() || null, due_date: dueDate || null }
      if (task) await api.patch(`/class-tasks/${task.id}`, row)
      else await api.post(`/classes/${classId}/tasks`, row)
    },
    onSuccess: () => {
      toast.success(task ? 'Saved' : `${title.trim()} added`)
      done()
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/class-tasks/${task!.id}`),
    onSuccess: () => {
      toast.success(`${task!.title} deleted`)
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
        <DialogTitle>{task ? `Edit ${label}` : `Add ${label}`}</DialogTitle>
        <DialogDescription>It appears as a column in the gradebook.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="t-title">Name</Label>
          <Input
            id="t-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'presentation' ? 'Final presentation' : 'Assessment 1'}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-unit">Unit code</Label>
            <UnitCodeInput id="t-unit" value={unitCode} onChange={setUnitCode} units={units} placeholder="ICTWEB519" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-due">{kind === 'presentation' ? 'Presentation date' : 'Due date'}</Label>
            <Input id="t-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {task ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {task.title}?</AlertDialogTitle>
                <AlertDialogDescription>Every student's result for it is deleted too.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

// --- Students ----------------------------------------------------------------

function StudentsPanel({ classId, gradebook }: { classId: string; gradebook: Gradebook }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ClassStudent | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })

  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<ClassStudent> & { id: string }) => api.patch(`/class-students/${id}`, data),
    onSuccess: refresh,
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (s: ClassStudent) => api.delete(`/class-students/${s.id}`),
    onSuccess: (_, s) => {
      toast.success(`${s.full_name} removed`)
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const resultCount = (id: string) => gradebook.results.filter((r) => r.student_id === id).length

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Mark a student as withdrawn to keep their results but leave them out of the totals.
        </p>
        <Button onClick={() => setAdding(true)}>
          <UserPlus className="size-4" /> Add students
        </Button>
      </div>

      {!gradebook.students.length ? (
        <EmptyState icon={Users} title="No students yet" description="Paste your class list to add everyone at once." />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {gradebook.students.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', s.withdrawn && 'text-muted-foreground line-through')}>{s.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.student_number ?? 'No student ID'} · {resultCount(s.id)} results
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={s.withdrawn}
                  disabled={update.isPending}
                  onCheckedChange={(withdrawn) => update.mutate({ id: s.id, withdrawn })}
                  aria-label={`${s.full_name} withdrawn`}
                />
                Withdrawn
              </label>
              <Button variant="ghost" size="icon" aria-label={`Edit ${s.full_name}`} onClick={() => setEditing(s)}>
                <Pencil className="size-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${s.full_name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {s.full_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {resultCount(s.id)
                        ? `Their ${resultCount(s.id)} results are deleted too. To keep them, mark the student as withdrawn instead.`
                        : 'They have no results yet.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(s)}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-lg">{adding && <AddStudentsForm classId={classId} onDone={() => setAdding(false)} />}</DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && <EditStudentForm key={editing.id} classId={classId} student={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** "Name" or "Name, student ID" (comma or tab, so a column pasted from a spreadsheet works) per line. */
function parseStudents(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,/).map((part) => part.trim()))
    .filter(([name]) => name)
    .map(([full_name, student_number]) => ({ full_name, student_number: student_number || null }))
}

function AddStudentsForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const students = parseStudents(text)

  const add = useMutation({
    mutationFn: () => api.post<{ added: number; skipped: number }>(`/classes/${classId}/students`, { students }),
    onSuccess: ({ added, skipped }) => {
      toast.success(`${added} ${added === 1 ? 'student' : 'students'} added${skipped ? ` · ${skipped} already on the list` : ''}`)
      queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    add.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>Add students</DialogTitle>
        <DialogDescription>
          One student per line. Add their student ID after a comma if you like, or paste two columns from a spreadsheet.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="s-list">Students</Label>
        <Textarea
          id="s-list"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Jane Citizen, S12345\nJohn Smith'}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {students.length} {students.length === 1 ? 'student' : 'students'} · names already on the list are skipped
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!students.length || add.isPending}>
          {add.isPending && <Loader2 className="size-4 animate-spin" />} Add {students.length || ''}
        </Button>
      </DialogFooter>
    </form>
  )
}

function EditStudentForm({ classId, student, onDone }: { classId: string; student: ClassStudent; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(student.full_name)
  const [number, setNumber] = useState(student.student_number ?? '')

  const save = useMutation({
    mutationFn: () => api.patch(`/class-students/${student.id}`, { full_name: name.trim(), student_number: number.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.gradebook(classId) })
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
        <DialogTitle>Edit student</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="e-name">Name</Label>
          <Input id="e-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-number">Student ID</Label>
          <Input id="e-number" value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}
