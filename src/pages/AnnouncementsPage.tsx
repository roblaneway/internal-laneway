import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Megaphone, Pencil, Pin, Plus, Trash2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { RichText, htmlToText } from '@/components/RichText'
import { AnnouncementDialog } from '@/components/announcements/AnnouncementDialog'
import { audienceLabel } from '@/components/announcements/audience'
import { keys, useAnnouncements, useClasses, useCourses, useProfileMap } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { useProfile } from '@/auth/AuthProvider'
import type { Announcement } from '@/lib/types'

function useCanManage() {
  const profile = useProfile()
  return (a: Announcement) => profile.role === 'admin' || (profile.role === 'trainer' && a.author_id === profile.id)
}

export function AnnouncementsPage() {
  const profile = useProfile()
  const announcements = useAnnouncements()
  const courses = useCourses()
  const classes = useClasses()
  const profiles = useProfileMap()
  const canManage = useCanManage()
  const [filter, setFilter] = useState<'all' | 'pinned' | 'drafts'>('all')
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const canPost = profile.role !== 'student'

  const list = (announcements.data ?? []).filter((a) =>
    filter === 'pinned' ? a.pinned && a.published_at : filter === 'drafts' ? !a.published_at : true,
  )
  const draftCount = announcements.data?.filter((a) => !a.published_at).length ?? 0

  return (
    <>
      <PageHeader
        title="Announcements"
        description={canPost ? 'Publish news to all students, a course or a class.' : 'News from Laneway and your trainers.'}
        actions={
          canPost && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> New announcement
            </Button>
          )
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pinned">Pinned</TabsTrigger>
          {canPost && <TabsTrigger value="drafts">Drafts{draftCount ? ` (${draftCount})` : ''}</TabsTrigger>}
        </TabsList>
      </Tabs>

      {announcements.error ? (
        <ErrorState error={announcements.error} />
      ) : announcements.isPending ? (
        <ListSkeleton rows={5} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={filter === 'drafts' ? 'No drafts' : 'No announcements yet'}
          description={canPost ? 'Create one to let students know what is happening.' : 'Check back soon.'}
        />
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <Card key={a.id} className="gap-0 py-0 transition-colors hover:border-primary/40">
              <CardContent className="flex gap-4 p-4">
                <Link to={`/announcements/${a.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned && <Pin className="size-4 text-primary" aria-label="Pinned" />}
                    <h2 className="font-sans text-base font-semibold tracking-normal">{a.title}</h2>
                    {!a.published_at && <Badge variant="secondary">Draft</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{htmlToText(a.body)}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" />
                      {audienceLabel(a, courses.data, classes.data)}
                    </span>
                    <span>{a.author_id ? profiles.get(a.author_id)?.full_name : 'Laneway Education'}</span>
                    <span>{a.published_at ? formatDateTime(a.published_at) : 'Not published'}</span>
                  </p>
                </Link>
                {canManage(a) && (
                  <Button variant="ghost" size="icon" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AnnouncementDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        announcement={editing === 'new' || editing === null ? undefined : editing}
      />
    </>
  )
}

export function AnnouncementDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const announcements = useAnnouncements()
  const courses = useCourses()
  const classes = useClasses()
  const profiles = useProfileMap()
  const canManage = useCanManage()
  const [editing, setEditing] = useState(false)
  const a = announcements.data?.find((x) => x.id === id)

  const remove = useMutation({
    mutationFn: () => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      toast.success('Announcement deleted')
      queryClient.invalidateQueries({ queryKey: keys.announcements })
      queryClient.invalidateQueries({ queryKey: keys.notifications })
      navigate('/announcements')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <>
      <Link to="/announcements" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All announcements
      </Link>

      {announcements.isPending ? (
        <ListSkeleton rows={3} />
      ) : !a ? (
        <EmptyState icon={Megaphone} title="Announcement not found" description="It may have been removed, or it isn't addressed to you." />
      ) : (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {a.pinned && <Pin className="size-4 text-primary" aria-label="Pinned" />}
                  {!a.published_at && <Badge variant="secondary">Draft</Badge>}
                </div>
                <h1 className="mt-1 text-3xl font-bold uppercase">{a.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {a.author_id ? profiles.get(a.author_id)?.full_name : 'Laneway Education'} ·{' '}
                  {a.published_at ? formatDateTime(a.published_at) : 'Not published'} · {audienceLabel(a, courses.data, classes.data)}
                </p>
              </div>
              {canManage(a) && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
                        <AlertDialogDescription>Students will no longer see it, and its notifications are removed.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
            <RichText html={a.body} className="text-[15px]" />
          </CardContent>
        </Card>
      )}

      <AnnouncementDialog open={editing} onOpenChange={setEditing} announcement={a} />
    </>
  )
}
