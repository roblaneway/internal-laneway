import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/StatusBadge'
import { keys } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { formatDayDate, formatTimeRange, timesOverlap, toTimeInput } from '@/lib/dates'
import type { ClassWithCourse, Profile, Shift, ShiftStatus } from '@/lib/types'
import { deliveringTrainerId, isUncovered } from './ShiftListItem'

const NONE = 'none'

export interface ShiftDraft {
  trainer_id?: string
  class_id?: string
  date?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing shift to edit, or a draft to prefill a new one. */
  shift?: Shift
  draft?: ShiftDraft
  canEdit: boolean
  currentUserId: string
  trainers: Profile[]
  classes: ClassWithCourse[]
  /** Shifts already loaded for the visible week, used for instant overlap feedback. */
  knownShifts: Shift[]
  profiles: Map<string, Profile>
  conflict?: boolean
}

export function ShiftDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remount the form for each shift so its state starts fresh. */}
        {props.open && <ShiftForm key={props.shift?.id ?? JSON.stringify(props.draft)} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function ShiftForm({ shift, draft, canEdit, currentUserId, trainers, classes, knownShifts, profiles, conflict, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [trainerId, setTrainerId] = useState(shift?.trainer_id ?? draft?.trainer_id ?? '')
  const [classId, setClassId] = useState(shift?.class_id ?? draft?.class_id ?? '')
  const [date, setDate] = useState(shift?.date ?? draft?.date ?? '')
  const [start, setStart] = useState(shift ? toTimeInput(shift.start_time) : '09:00')
  const [end, setEnd] = useState(shift ? toTimeInput(shift.end_time) : '13:00')
  const [cancelled, setCancelled] = useState(shift?.status === 'cancelled')
  const [needsCover, setNeedsCover] = useState(shift?.needs_cover ?? false)
  const [coverId, setCoverId] = useState(shift?.cover_trainer_id ?? NONE)
  const [notes, setNotes] = useState(shift?.notes ?? '')
  const [serverError, setServerError] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.allShifts })
    queryClient.invalidateQueries({ queryKey: ['conflicts'] })
  }

  const cover = coverId === NONE ? null : coverId
  const person = cover ?? trainerId

  /** Other live shifts for `who` on this date that overlap the edited times. */
  const clashesFor = (who: string) =>
    knownShifts.filter(
      (s) =>
        s.id !== shift?.id &&
        s.status !== 'cancelled' &&
        s.date === date &&
        deliveringTrainerId(s) === who &&
        timesOverlap(s.start_time, s.end_time, start, end),
    )

  const clashes = !cancelled && person && date && start && end ? clashesFor(person) : []
  const timeInvalid = Boolean(start && end && end <= start)

  const save = useMutation({
    mutationFn: async () => {
      const status: ShiftStatus = cancelled ? 'cancelled' : 'scheduled' // trigger sets 'covered'
      const row = {
        trainer_id: trainerId,
        class_id: classId,
        date,
        start_time: start,
        end_time: end,
        status,
        needs_cover: cancelled ? false : needsCover || Boolean(cover),
        cover_trainer_id: cancelled ? null : cover,
        notes: notes.trim() || null,
      }
      if (shift) await api.patch(`/shifts/${shift.id}`, row)
      else await api.post('/shifts', row)
    },
    onSuccess: () => {
      toast.success(shift ? 'Shift updated' : 'Shift created')
      invalidate()
      onOpenChange(false)
    },
    onError: (err) => setServerError(err.message),
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/shifts/${shift!.id}`),
    onSuccess: () => {
      toast.success('Shift deleted')
      invalidate()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const requestCover = useMutation({
    mutationFn: (value: boolean) => api.post(`/shifts/${shift!.id}/request-cover`, { needs_cover: value }),
    onSuccess: (_d, value) => {
      toast.success(value ? 'Cover requested — an administrator will assign a trainer' : 'Cover request withdrawn')
      invalidate()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (clashes.length || timeInvalid) return
    save.mutate()
  }

  // Read-only view (trainers): details plus the cover request toggle.
  if (!canEdit && shift) {
    const cls = classes.find((c) => c.id === shift.class_id)
    const isOwn = shift.trainer_id === currentUserId
    return (
      <>
        <DialogHeader>
          <DialogTitle>{cls?.name ?? 'Shift'}</DialogTitle>
          <DialogDescription>
            {formatDayDate(shift.date)} · {formatTimeRange(shift.start_time, shift.end_time)}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex flex-wrap gap-1.5">
            <StatusBadge status={shift.status} />
            {isUncovered(shift) && <StatusBadge status="needs-cover" />}
            {conflict && <StatusBadge status="conflict" />}
          </dd>
          <dt className="text-muted-foreground">Room</dt>
          <dd>{cls?.room ?? '—'}</dd>
          <dt className="text-muted-foreground">Trainer</dt>
          <dd>{profiles.get(shift.trainer_id)?.full_name}</dd>
          {shift.cover_trainer_id && (
            <>
              <dt className="text-muted-foreground">Covered by</dt>
              <dd>{profiles.get(shift.cover_trainer_id)?.full_name}</dd>
            </>
          )}
          {shift.notes && (
            <>
              <dt className="text-muted-foreground">Notes</dt>
              <dd>{shift.notes}</dd>
            </>
          )}
        </dl>
        {conflict && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            This shift overlaps another of your shifts. An administrator has been alerted on their dashboard.
          </p>
        )}
        <DialogFooter>
          {isOwn && shift.status === 'scheduled' && (
            <Button
              variant={shift.needs_cover ? 'outline' : 'default'}
              disabled={requestCover.isPending}
              onClick={() => requestCover.mutate(!shift.needs_cover)}
            >
              {requestCover.isPending && <Loader2 className="size-4 animate-spin" />}
              {shift.needs_cover ? 'Withdraw cover request' : 'Request cover'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>{shift ? 'Edit shift' : 'New shift'}</DialogTitle>
        <DialogDescription>Overlapping shifts for the same trainer are blocked.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Trainer</Label>
            <Select value={trainerId} onValueChange={setTrainerId} required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select trainer" />
              </SelectTrigger>
              <SelectContent>
                {trainers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId} required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="shift-date">Date</Label>
            <Input id="shift-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-start">Start</Label>
            <Input id="shift-start" type="time" required step={900} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shift-end">End</Label>
            <Input id="shift-end" type="time" required step={900} value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={timeInvalid} />
          </div>
        </div>
        {timeInvalid && <p className="-mt-2 text-sm text-destructive">End time must be after the start time.</p>}

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="needs-cover" className="flex-col items-start gap-0.5">
              <span>Needs cover</span>
              <span className="text-xs font-normal text-muted-foreground">Flag when the rostered trainer can't take this shift.</span>
            </Label>
            <Switch id="needs-cover" checked={needsCover || Boolean(cover)} disabled={cancelled} onCheckedChange={(v) => {
              setNeedsCover(v)
              if (!v) setCoverId(NONE)
            }} />
          </div>
          {(needsCover || cover) && !cancelled && (
            <div className="mt-3 space-y-1.5">
              <Label>Cover trainer</Label>
              <Select value={coverId} onValueChange={setCoverId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not yet assigned</SelectItem>
                  {trainers
                    .filter((t) => t.id !== trainerId)
                    .map((t) => {
                      const busy = date && start && end ? clashesFor(t.id).length > 0 : false
                      return (
                        <SelectItem key={t.id} value={t.id} disabled={busy}>
                          {t.full_name}
                          {busy && <span className="text-xs text-muted-foreground"> · busy at this time</span>}
                        </SelectItem>
                      )
                    })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <Label htmlFor="cancelled" className="flex-col items-start gap-0.5">
            <span>Cancelled</span>
            <span className="text-xs font-normal text-muted-foreground">Keeps the shift on the roster, struck through.</span>
          </Label>
          <Switch id="cancelled" checked={cancelled} onCheckedChange={setCancelled} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="shift-notes">Notes</Label>
          <Textarea id="shift-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {clashes.length > 0 && (
          <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {profiles.get(person)?.full_name ?? 'This trainer'} is already rostered{' '}
              {clashes
                .map((c) => `${classes.find((x) => x.id === c.class_id)?.name} (${formatTimeRange(c.start_time, c.end_time)})`)
                .join(', ')}
              . Change the time or choose another trainer.
            </span>
          </div>
        )}
        {serverError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        {shift ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes it from the roster entirely. To keep a record, mark it as cancelled instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep shift</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Delete shift</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !trainerId || !classId || clashes.length > 0 || timeInvalid}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {shift ? 'Save changes' : 'Create shift'}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}
