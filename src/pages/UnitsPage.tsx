import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, ExternalLink, Library, Loader2, Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
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
import { unitWeeks } from '@/components/UnitCodeInput'
import { useProfile } from '@/auth/AuthProvider'
import { keys, useClasses, useCourses, useCourseUnits, useMyClasses } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { inTerm, TERM_WEEKS, termWeek, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { Course, CourseUnit } from '@/lib/types'

const WEEKS = Array.from({ length: TERM_WEEKS }, (_, i) => i + 1)

/** The units each course delivers in a term. Admins edit; trainers read. */
export function UnitsPage() {
  const profile = useProfile()
  const isAdmin = profile.role === 'admin'
  const courses = useCourses()
  const classes = useClasses()
  const myClasses = useMyClasses()
  const units = useCourseUnits()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<{ unit?: CourseUnit; courseId?: string } | null>(null)
  const [copying, setCopying] = useState(false)
  const queryClient = useQueryClient()
  const today = todayISO()

  // Terms that have classes or units; the term running today comes first by default.
  const terms = useMemo(() => {
    const all = new Set([...(classes.data ?? []).map((c) => c.term), ...(units.data ?? []).map((u) => u.term)])
    return [...all].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  }, [classes.data, units.data])
  const currentTerm = classes.data?.find((c) => inTerm(termWeek(c.start_date, today)))?.term
  const term = terms.includes(params.get('term') ?? '') ? params.get('term')! : (currentTerm ?? terms[0])

  // Courses in the order their classes run that term (Tue class before Wed), then the rest by code.
  // Trainers see the courses they teach first.
  const orderedCourses = useMemo(() => {
    const termClasses = (classes.data ?? []).filter((c) => c.term === term)
    const rank = (course: Course) => {
      const i = termClasses.findIndex((c) => c.course_id === course.id)
      return i === -1 ? Infinity : i
    }
    const mine = new Set(myClasses.data?.filter((c) => c.term === term).map((c) => c.course_id))
    const teaches = (course: Course) => (profile.role === 'trainer' && mine.has(course.id) ? 0 : 1)
    return [...(courses.data ?? [])].sort(
      (a, b) => teaches(a) - teaches(b) || rank(a) - rank(b) || a.code.localeCompare(b.code),
    )
  }, [courses.data, classes.data, myClasses.data, term, profile.role])

  const fillFromPlans = useMutation({
    mutationFn: () => api.post<{ added: number }>('/course-units/from-plans', { term }),
    onSuccess: ({ added }) => {
      toast.success(added ? `Added ${added} ${added === 1 ? 'unit' : 'units'} from the content plans` : 'No new units found in the content plans')
      queryClient.invalidateQueries({ queryKey: keys.courseUnits })
    },
    onError: (err) => toast.error(err.message),
  })

  const error = courses.error ?? classes.error ?? units.error
  if (error) return <ErrorState error={error} />

  const termUnits = (units.data ?? []).filter((u) => u.term === term)

  return (
    <>
      <PageHeader
        title="Units"
        description={
          isAdmin
            ? 'The units each course delivers per term, and the weeks they run. Trainers see them here and as suggestions in content plans and the gradebook.'
            : 'The units each course delivers this term, and the weeks they run.'
        }
        actions={
          isAdmin &&
          term && (
            <>
              <Button variant="outline" onClick={() => fillFromPlans.mutate()} disabled={fillFromPlans.isPending}>
                {fillFromPlans.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Fill from content plans
              </Button>
              <Button variant="outline" onClick={() => setCopying(true)} disabled={terms.length < 2}>
                <Copy className="size-4" /> Copy from term
              </Button>
              <Button onClick={() => setEditing({})}>
                <Plus className="size-4" /> Add unit
              </Button>
            </>
          )
        }
      />

      {courses.isPending || classes.isPending || units.isPending ? (
        <ListSkeleton rows={6} />
      ) : !terms.length || !courses.data?.length ? (
        <EmptyState icon={Library} title="No terms yet" description="Units are listed per term once a course has classes." />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={term}
              onValueChange={(v) =>
                setParams((prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('term', v)
                  return next
                })
              }
            >
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
            <p className="text-sm text-muted-foreground">
              {termUnits.length} {termUnits.length === 1 ? 'unit' : 'units'} across {new Set(termUnits.map((u) => u.course_id)).size} courses
            </p>
          </div>

          <div className="space-y-4">
            {orderedCourses.map((course) => (
              <CourseUnits
                key={course.id}
                course={course}
                units={termUnits
                  .filter((u) => u.course_id === course.id)
                  .sort((a, b) => (a.start_week ?? 99) - (b.start_week ?? 99) || a.code.localeCompare(b.code))}
                classNames={(classes.data ?? []).filter((c) => c.course_id === course.id && c.term === term).map((c) => c.name)}
                isAdmin={isAdmin}
                onAdd={() => setEditing({ courseId: course.id })}
                onEdit={(unit) => setEditing({ unit })}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing && term && (
            <UnitForm
              key={editing.unit?.id ?? `new-${editing.courseId}`}
              unit={editing.unit}
              courseId={editing.courseId}
              term={term}
              terms={terms}
              courses={orderedCourses}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={copying} onOpenChange={setCopying}>
        <DialogContent className="sm:max-w-md">
          {copying && term && <CopyTermForm to={term} terms={terms.filter((t) => t !== term)} onDone={() => setCopying(false)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CourseUnits({
  course,
  units,
  classNames,
  isAdmin,
  onAdd,
  onEdit,
}: {
  course: Course
  units: CourseUnit[]
  classNames: string[]
  isAdmin: boolean
  onAdd: () => void
  onEdit: (unit: CourseUnit) => void
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{course.name}</h2>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{course.code}</span>
            {classNames.length > 0 ? ` · ${classNames.join(', ')}` : ' · No classes this term'}
          </p>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={onAdd} aria-label={`Add unit to ${course.name}`}>
            <Plus className="size-4" /> Unit
          </Button>
        )}
      </div>
      {units.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No units for this term yet.</p>
      ) : (
        <ul className="divide-y">
          {units.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-mono font-medium">{u.code}</span>
                  {u.title && <span className="ml-2">{u.title}</span>}
                  {u.resources_url && (
                    <a
                      href={u.resources_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center text-primary hover:underline"
                      aria-label={`${u.code} resources`}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </p>
                {u.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{u.notes}</p>}
              </div>
              <WeekStrip unit={u} />
              {isAdmin && (
                <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${u.code}`} onClick={() => onEdit(u)}>
                    <Pencil className="size-4" />
                  </Button>
                  <DeleteUnit unit={u} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Ten small cells for the term's weeks, filled where the unit runs. */
function WeekStrip({ unit }: { unit: CourseUnit }) {
  const label = unitWeeks(unit)
  const end = unit.end_week ?? unit.start_week
  return (
    <div className="flex shrink-0 items-center gap-2" title={label ?? 'Weeks not set'}>
      <div className="flex gap-0.5" aria-hidden>
        {WEEKS.map((w) => (
          <span
            key={w}
            className={cn(
              'h-3 w-2.5 rounded-[2px]',
              unit.start_week && end && w >= unit.start_week && w <= end ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <span className="w-20 text-xs text-muted-foreground">{label ?? 'No weeks'}</span>
    </div>
  )
}

function DeleteUnit({ unit }: { unit: CourseUnit }) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api.delete(`/course-units/${unit.id}`),
    onSuccess: () => {
      toast.success(`${unit.code} removed`)
      queryClient.invalidateQueries({ queryKey: keys.courseUnits })
    },
    onError: (err) => toast.error(err.message),
  })
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Remove ${unit.code}`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {unit.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            It's removed from {unit.term} for this course. Content plans and gradebook entries that use the code keep it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => remove.mutate()}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function UnitForm({
  unit,
  courseId: initialCourse,
  term: initialTerm,
  terms,
  courses,
  onDone,
}: {
  unit?: CourseUnit
  courseId?: string
  term: string
  terms: string[]
  courses: Course[]
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [courseId, setCourseId] = useState(unit?.course_id ?? initialCourse ?? courses[0]?.id ?? '')
  const [term, setTerm] = useState(unit?.term ?? initialTerm)
  const [code, setCode] = useState(unit?.code ?? '')
  const [title, setTitle] = useState(unit?.title ?? '')
  const [startWeek, setStartWeek] = useState(unit?.start_week ? String(unit.start_week) : '')
  const [endWeek, setEndWeek] = useState(unit?.end_week ? String(unit.end_week) : '')
  const [notes, setNotes] = useState(unit?.notes ?? '')
  const [url, setUrl] = useState(unit?.resources_url ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        course_id: courseId,
        term: term.trim(),
        code: code.trim().toUpperCase(),
        title: title.trim() || null,
        start_week: startWeek ? Number(startWeek) : null,
        end_week: endWeek ? Number(endWeek) : startWeek ? Number(startWeek) : null,
        notes: notes.trim() || null,
        resources_url: url.trim() || null,
      }
      if (unit) await api.patch(`/course-units/${unit.id}`, row)
      else await api.post('/course-units', row)
    },
    onSuccess: () => {
      toast.success(unit ? 'Unit saved' : `${code.trim().toUpperCase()} added`)
      queryClient.invalidateQueries({ queryKey: keys.courseUnits })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  const weekSelect = (id: string, label: string, value: string, onChange: (v: string) => void, min = 1) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? '' : v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not set</SelectItem>
          {WEEKS.filter((w) => w >= min).map((w) => (
            <SelectItem key={w} value={String(w)}>
              Week {w}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>{unit ? `Edit ${unit.code}` : 'Add unit'}</DialogTitle>
        <DialogDescription>A unit of competency the course delivers in the term.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
          <div className="space-y-1.5">
            <Label htmlFor="u-course">Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger id="u-course" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-term">Term</Label>
            <Input id="u-term" required list="u-term-options" value={term} onChange={(e) => setTerm(e.target.value)} />
            <datalist id="u-term-options">
              {terms.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="u-code">Unit code</Label>
            <Input id="u-code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ICTWEB519" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-title">Title</Label>
            <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Develop complex web page layouts" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {weekSelect('u-start', 'First week', startWeek, (v) => {
            setStartWeek(v)
            if (v && endWeek && Number(endWeek) < Number(v)) setEndWeek(v)
          })}
          {weekSelect('u-end', 'Last week', endWeek, setEndWeek, startWeek ? Number(startWeek) : 1)}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-url">Unit outline or resources link</Label>
          <Input id="u-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-notes">Notes</Label>
          <Textarea id="u-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Assessments, delivery notes…" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!courseId || save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}

function CopyTermForm({ to, terms, onDone }: { to: string; terms: string[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [from, setFrom] = useState(terms[0] ?? '')
  const copy = useMutation({
    mutationFn: () => api.post<{ added: number }>('/course-units/copy', { from, to }),
    onSuccess: ({ added }) => {
      toast.success(added ? `Copied ${added} ${added === 1 ? 'unit' : 'units'} into ${to}` : `${to} already has all of ${from}'s units`)
      queryClient.invalidateQueries({ queryKey: keys.courseUnits })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    copy.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>Copy units into {to}</DialogTitle>
        <DialogDescription>Every course's units from the term you choose, with their weeks and notes. Units already in {to} are kept.</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="copy-from">Copy from</Label>
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger id="copy-from" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {terms.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!from || copy.isPending}>
          {copy.isPending && <Loader2 className="size-4 animate-spin" />} Copy units
        </Button>
      </DialogFooter>
    </form>
  )
}
