import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GraduationCap, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { keys, useClasses, useCourses } from '@/hooks/use-data'
import { api } from '@/lib/api'
import type { Course } from '@/lib/types'

export function CoursesPage() {
  const courses = useCourses()
  const classes = useClasses()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Course | 'new' | null>(null)

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${id}`),
    onSuccess: () => {
      toast.success('Course deleted')
      queryClient.invalidateQueries({ queryKey: keys.courses })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <>
      <PageHeader
        title="Courses"
        description="Qualifications delivered at Laneway."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add course
          </Button>
        }
      />
      {courses.error ? (
        <ErrorState error={courses.error} />
      ) : courses.isPending ? (
        <ListSkeleton rows={3} />
      ) : !courses.data.length ? (
        <EmptyState icon={GraduationCap} title="No courses yet" />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {courses.data.map((c) => {
            const classCount = classes.data?.filter((x) => x.course_id === c.id).length ?? 0
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{c.code}</span> · {classCount} {classCount === 1 ? 'class' : 'classes'}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${c.name}`}
                  disabled={classCount > 0}
                  title={classCount > 0 ? 'Remove its classes first' : undefined}
                  onClick={() => remove.mutate(c.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </Card>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing !== null && (
            <CourseForm key={editing === 'new' ? 'new' : editing.id} course={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function CourseForm({ course, onDone }: { course?: Course; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState(course?.code ?? '')
  const [name, setName] = useState(course?.name ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const row = { code: code.trim(), name: name.trim() }
      if (course) await api.patch(`/courses/${course.id}`, row)
      else await api.post('/courses', row)
    },
    onSuccess: () => {
      toast.success('Course saved')
      queryClient.invalidateQueries({ queryKey: keys.courses })
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
        <DialogTitle>{course ? 'Edit course' : 'Add course'}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-code">Code</Label>
          <Input id="c-code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ICT50220-COD" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} />
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
