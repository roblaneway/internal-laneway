import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, ClipboardCheck, FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { keys, useClasses, useMarkedAssessments, useProfileMap, useTrainers } from '@/hooks/use-data'
import { addDays, formatDate, formatDayDate, startOfWeek, todayISO } from '@/lib/dates'
import { INVOICE_DAYS, invoiceDescription, invoiceEnd } from '@/lib/invoice'
import { api } from '@/lib/api'
import { useProfile } from '@/auth/AuthProvider'
import type { AssessmentKind, MarkedAssessment } from '@/lib/types'

const ALL = 'all'
const KINDS: AssessmentKind[] = ['Reassessment', 'Assessment']

/** Assessments trainers marked. Each fortnight's entries go on that fortnight's invoice. */
export function AssessmentsPage() {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const fromParam = params.get('from') ?? ''
  // Same fortnight as the invoice: last week and this week, unless one is chosen.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? startOfWeek(fromParam) : startOfWeek(addDays(today, -7))
  const to = invoiceEnd(from)
  const trainerFilter = isAdmin ? (params.get('trainer') ?? ALL) : me.id

  const assessments = useMarkedAssessments(from, to, trainerFilter === ALL ? '' : trainerFilter)
  const trainers = useTrainers()
  const profiles = useProfileMap()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<MarkedAssessment | 'new' | null>(null)

  const setParam = (changes: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      return next
    })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/marked-assessments/${id}`),
    onSuccess: () => {
      toast.success('Assessment removed')
      queryClient.invalidateQueries({ queryKey: keys.allAssessments })
    },
    onError: (err) => toast.error(err.message),
  })

  const rows = assessments.data ?? []
  const total = rows.reduce((sum, a) => sum + a.quantity, 0)
  const invoiceTrainer = isAdmin ? (trainerFilter === ALL ? null : trainerFilter) : me.id
  const invoiceLink = invoiceTrainer && `/roster/invoice?${new URLSearchParams({ from, ...(isAdmin && { trainer: invoiceTrainer }) })}`

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Assessments and reassessments marked. Each one is paid on the invoice for the fortnight it was marked in."
        actions={
          <>
            {invoiceLink && (
              <Button asChild variant="outline">
                <Link to={invoiceLink}>
                  <FileText className="size-4" /> Open invoice
                </Link>
              </Button>
            )}
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Add marked assessment
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous fortnight" onClick={() => setParam({ from: addDays(from, -INVOICE_DAYS) })}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next fortnight" onClick={() => setParam({ from: addDays(from, INVOICE_DAYS) })}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="text-sm font-medium">
          {formatDate(from)} – {formatDate(to)}
        </p>
        {isAdmin && (
          <Select value={trainerFilter} onValueChange={(v) => setParam({ trainer: v === ALL ? null : v })}>
            <SelectTrigger className="ml-auto w-full sm:w-56" aria-label="Trainer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All trainers</SelectItem>
              {trainers.data?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {assessments.error ? (
        <ErrorState error={assessments.error} />
      ) : assessments.isPending ? (
        <ListSkeleton rows={4} />
      ) : !rows.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing marked in this fortnight"
          description="Add the assessments you mark and they'll appear on your invoice."
        />
      ) : (
        <>
          <Card className="gap-0 divide-y py-0">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold" title="Quantity">
                  ×{a.quantity}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {a.activity} · <span className="font-mono">{a.unit_code}</span>{' '}
                    <Badge variant={a.kind === 'Reassessment' ? 'secondary' : 'outline'} className="ml-1 align-middle">
                      {a.kind}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.course}
                    {a.term && ` · ${a.term}`} · marked {formatDayDate(a.marked_on)}
                    {isAdmin && trainerFilter === ALL && ` · ${profiles.get(a.trainer_id)?.full_name ?? 'Unknown trainer'}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${a.activity} ${a.unit_code}`} onClick={() => setEditing(a)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${a.activity} ${a.unit_code}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(a.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </Card>
          <p className="mt-3 text-right text-sm text-muted-foreground">
            {total} {total === 1 ? 'assessment' : 'assessments'} in this fortnight
          </p>
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <AssessmentForm
              key={editing === 'new' ? 'new' : editing.id}
              assessment={editing === 'new' ? undefined : editing}
              defaultDate={today >= from && today <= to ? today : to}
              defaultTrainer={trainerFilter === ALL ? '' : trainerFilter}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AssessmentForm({
  assessment,
  defaultDate,
  defaultTrainer,
  onDone,
}: {
  assessment?: MarkedAssessment
  defaultDate: string
  defaultTrainer: string
  onDone: () => void
}) {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const queryClient = useQueryClient()
  const trainers = useTrainers()
  const classes = useClasses()
  const [trainerId, setTrainerId] = useState(assessment?.trainer_id ?? defaultTrainer)
  const [markedOn, setMarkedOn] = useState(assessment?.marked_on ?? defaultDate)
  const [activity, setActivity] = useState(assessment?.activity ?? '')
  const [unitCode, setUnitCode] = useState(assessment?.unit_code ?? '')
  const [term, setTerm] = useState(assessment?.term ?? '')
  const [course, setCourse] = useState(assessment?.course ?? '')
  const [kind, setKind] = useState<AssessmentKind>(assessment?.kind ?? 'Reassessment')
  const [quantity, setQuantity] = useState(String(assessment?.quantity ?? 1))

  // Suggest the names classes use on invoices, so both read the same.
  const courseOptions = useMemo(
    () => [...new Set((classes.data ?? []).map((c) => invoiceDescription(c)))].sort(),
    [classes.data],
  )

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        ...(isAdmin && { trainer_id: trainerId }),
        marked_on: markedOn,
        activity: activity.trim(),
        unit_code: unitCode.trim().toUpperCase(),
        term: term.trim() || null,
        course: course.trim(),
        kind,
        quantity: Number(quantity),
      }
      if (assessment) await api.patch(`/marked-assessments/${assessment.id}`, row)
      else await api.post('/marked-assessments', row)
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
        <DialogTitle>{assessment ? 'Edit marked assessment' : 'Add marked assessment'}</DialogTitle>
        <DialogDescription>It's paid on the invoice for the fortnight of the date marked.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        {isAdmin && (
          <div className="space-y-1.5">
            <Label>Trainer</Label>
            <Select value={trainerId} onValueChange={setTrainerId} required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select trainer" />
              </SelectTrigger>
              <SelectContent>
                {trainers.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a-activity">Activity</Label>
            <Input id="a-activity" required value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Assessment 2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-unit">Unit code</Label>
            <Input id="a-unit" required value={unitCode} onChange={(e) => setUnitCode(e.target.value.toUpperCase())} placeholder="ICTPRG553" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-course">Course</Label>
          <Input id="a-course" required list="a-course-options" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="DIPLOMA IT" />
          <datalist id="a-course-options">
            {courseOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a-term">Term the student studied it</Label>
            <Input id="a-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term 1 - 2025" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AssessmentKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a-qty">How many marked</Label>
            <Input id="a-qty" type="number" min="1" max="500" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-date">Date marked</Label>
            <Input id="a-date" type="date" required value={markedOn} onChange={(e) => setMarkedOn(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || (isAdmin && !trainerId)}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}
