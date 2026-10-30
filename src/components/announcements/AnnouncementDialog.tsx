import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { keys, useCourses, useMyClasses } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { useProfile } from '@/auth/AuthProvider'
import type { Announcement, Audience } from '@/lib/types'
import { RichTextEditor } from './RichTextEditor'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement?: Announcement
}

export function AnnouncementDialog({ open, onOpenChange, announcement }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {open && <AnnouncementForm key={announcement?.id ?? 'new'} announcement={announcement} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AnnouncementForm({ announcement, onDone }: { announcement?: Announcement; onDone: () => void }) {
  const profile = useProfile()
  const isAdmin = profile.role === 'admin'
  const queryClient = useQueryClient()
  const courses = useCourses()
  const myClasses = useMyClasses()

  // RLS only lets trainers post to classes they teach.
  const [audience, setAudience] = useState<Audience>(announcement?.audience ?? (isAdmin ? 'all' : 'class'))
  const [targetId, setTargetId] = useState(announcement?.target_id ?? '')
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')
  const [pinned, setPinned] = useState(announcement?.pinned ?? false)
  const [error, setError] = useState<string | null>(null)
  const wasPublished = Boolean(announcement?.published_at)

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const row = {
        title: title.trim(),
        body,
        audience,
        target_id: audience === 'all' ? null : targetId,
        pinned,
        // Setting published_at fires the trigger that notifies targeted students.
        published_at: wasPublished ? announcement!.published_at : publish ? new Date().toISOString() : null,
      }
      // The server sets the author to the signed-in user.
      if (announcement) await api.patch(`/announcements/${announcement.id}`, row)
      else await api.post('/announcements', row)
      return publish
    },
    onSuccess: (publish) => {
      toast.success(
        publish && !wasPublished ? 'Announcement published — targeted students have been notified' : 'Announcement saved',
      )
      queryClient.invalidateQueries({ queryKey: keys.announcements })
      onDone()
    },
    onError: (err) => setError(err.message),
  })

  const submit = (publish: boolean) => (e?: FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Add a title.')
    if (!body) return setError('Write the announcement body.')
    if (audience !== 'all' && !targetId) return setError(`Choose a ${audience}.`)
    save.mutate(publish)
  }

  const targets =
    audience === 'course'
      ? (courses.data ?? []).map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))
      : (myClasses.data ?? []).map((c) => ({ id: c.id, label: c.name }))

  return (
    <form onSubmit={submit(true)} className="contents">
      <DialogHeader>
        <DialogTitle>{announcement ? 'Edit announcement' : 'New announcement'}</DialogTitle>
        <DialogDescription>
          {wasPublished
            ? 'Changes are visible straight away. Students are not notified again.'
            : 'Publishing sends a notification to every targeted student.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ann-title">Title</Label>
          <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select
              value={audience}
              onValueChange={(v) => {
                setAudience(v as Audience)
                setTargetId('')
              }}
              disabled={!isAdmin}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isAdmin && <SelectItem value="all">All students</SelectItem>}
                {isAdmin && <SelectItem value="course">A course</SelectItem>}
                <SelectItem value="class">A class</SelectItem>
              </SelectContent>
            </Select>
            {!isAdmin && <p className="text-xs text-muted-foreground">Trainers post to their own classes.</p>}
          </div>
          {audience !== 'all' && (
            <div className="space-y-1.5">
              <Label>{audience === 'course' ? 'Course' : 'Class'}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Select a ${audience}`} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Message</Label>
          <RichTextEditor value={body} onChange={setBody} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <Label htmlFor="ann-pinned" className="flex-col items-start gap-0.5">
            <span>Pin to top</span>
            <span className="text-xs font-normal text-muted-foreground">Pinned announcements appear first and on student dashboards.</span>
          </Label>
          <Switch id="ann-pinned" checked={pinned} onCheckedChange={setPinned} />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        {!wasPublished && (
          <Button type="button" variant="secondary" disabled={save.isPending} onClick={() => submit(false)()}>
            Save draft
          </Button>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {wasPublished ? 'Save changes' : 'Publish'}
        </Button>
      </DialogFooter>
    </form>
  )
}
