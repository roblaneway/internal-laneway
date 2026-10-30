import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, School, Search, Trash2, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { keys, useClasses, useCourses, useProfileMap, useProfiles } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import type { ClassWithCourse, DeliveryMode, Enrolment } from '@/lib/types'

const NONE = 'none'

function useEnrolments() {
  return useQuery({
    queryKey: keys.enrolments,
    queryFn: () => api.get<Enrolment[]>('/enrolments'),
  })
}

export function AdminClassesPage() {
  const classes = useClasses()
  const enrolments = useEnrolments()
  const profiles = useProfileMap()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ClassWithCourse | 'new' | null>(null)
  const [enrolling, setEnrolling] = useState<ClassWithCourse | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/classes/${id}`),
    onSuccess: () => {
      toast.success('Class deleted')
      queryClient.invalidateQueries({ queryKey: keys.classes })
    },
    onError: (err) => toast.error(err.message),
  })

  const countFor = (id: string) => enrolments.data?.filter((e) => e.class_id === id).length ?? 0

  return (
    <>
      <PageHeader
        title="Classes & enrolments"
        description="Set up classes, assign a lead trainer and enrol students."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add class
          </Button>
        }
      />
      {classes.error ? (
        <ErrorState error={classes.error} />
      ) : classes.isPending ? (
        <ListSkeleton rows={6} />
      ) : !classes.data.length ? (
        <EmptyState icon={School} title="No classes yet" description="Add a class to start rostering and planning content." />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {classes.data.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {c.name}
                  <Badge variant="outline" className="capitalize">
                    {c.delivery_mode}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.course?.code} · {c.room} · {c.term} from {formatDate(c.start_date)} ·{' '}
                  {c.trainer_id ? profiles.get(c.trainer_id)?.full_name : 'No lead trainer'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEnrolling(c)}>
                <UserPlus className="size-4" /> {countFor(c.id)} students
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil className="size-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${c.name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                    <AlertDialogDescription>Its enrolments, roster shifts and content plan are deleted too.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(c.id)}>Delete class</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <ClassForm key={editing === 'new' ? 'new' : editing.id} cls={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={enrolling !== null} onOpenChange={(o) => !o && setEnrolling(null)}>
        <DialogContent className="sm:max-w-lg">
          {enrolling && (
            <EnrolmentForm
              key={enrolling.id}
              cls={enrolling}
              current={enrolments.data?.filter((e) => e.class_id === enrolling.id).map((e) => e.student_id) ?? []}
              onDone={() => setEnrolling(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ClassForm({ cls, onDone }: { cls?: ClassWithCourse; onDone: () => void }) {
  const queryClient = useQueryClient()
  const courses = useCourses()
  const profiles = useProfiles()
  const trainers = profiles.data?.filter((p) => p.role === 'trainer') ?? []
  const [name, setName] = useState(cls?.name ?? '')
  const [courseId, setCourseId] = useState(cls?.course_id ?? '')
  const [room, setRoom] = useState(cls?.room ?? '')
  const [mode, setMode] = useState<DeliveryMode>(cls?.delivery_mode ?? 'on-campus')
  const [term, setTerm] = useState(cls?.term ?? '')
  const [startDate, setStartDate] = useState(cls?.start_date ?? '')
  const [trainerId, setTrainerId] = useState(cls?.trainer_id ?? NONE)

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        name: name.trim(),
        course_id: courseId,
        room: room.trim() || null,
        delivery_mode: mode,
        term: term.trim(),
        start_date: startDate,
        trainer_id: trainerId === NONE ? null : trainerId,
      }
      if (cls) await api.patch(`/classes/${cls.id}`, row)
      else await api.post('/classes', row)
    },
    onSuccess: () => {
      toast.success('Class saved')
      queryClient.invalidateQueries({ queryKey: keys.classes })
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
        <DialogTitle>{cls ? 'Edit class' : 'Add class'}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cl-name">Name</Label>
          <Input id="cl-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="DIT Coding — Group B" />
        </div>
        <div className="space-y-1.5">
          <Label>Course</Label>
          <Select value={courseId} onValueChange={setCourseId} required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select course" />
            </SelectTrigger>
            <SelectContent>
              {courses.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Delivery</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as DeliveryMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on-campus">On-campus</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-room">{mode === 'online' ? 'Platform' : 'Room'}</Label>
            <Input id="cl-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={mode === 'online' ? 'Online · Zoom' : 'Melbourne CBD · Room 4.02'} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-term">Term</Label>
            <Input id="cl-term" required value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term 4 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-start">Week 1 starts</Label>
            <Input id="cl-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Lead trainer</Label>
          <Select value={trainerId} onValueChange={setTrainerId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No lead trainer</SelectItem>
              {trainers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !courseId}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}

function EnrolmentForm({ cls, current, onDone }: { cls: ClassWithCourse; current: string[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const profiles = useProfiles()
  const [selected, setSelected] = useState(() => new Set(current))
  const [search, setSearch] = useState('')

  const students = useMemo(() => profiles.data?.filter((p) => p.role === 'student') ?? [], [profiles.data])
  const q = search.trim().toLowerCase()
  const visible = students.filter((s) => !q || s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))

  const save = useMutation({
    mutationFn: async () => {
      const before = new Set(current)
      const add = [...selected].filter((id) => !before.has(id))
      const drop = current.filter((id) => !selected.has(id))
      return api.post<{ added: number; removed: number }>(`/classes/${cls.id}/enrolments`, { add, remove: drop })
    },
    onSuccess: ({ added, removed }) => {
      toast.success(`Enrolments updated (+${added} / −${removed})`)
      queryClient.invalidateQueries({ queryKey: keys.enrolments })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Enrolments · {cls.name}</DialogTitle>
        <DialogDescription>{selected.size} students selected</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search students" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
        {visible.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
            <Checkbox checked={selected.has(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{s.full_name}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.email}</span>
            </span>
          </label>
        ))}
        {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No students match.</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save enrolments
        </Button>
      </DialogFooter>
    </>
  )
}
