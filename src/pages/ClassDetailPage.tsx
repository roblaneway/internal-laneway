import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, BookOpen, ExternalLink, MapPin, Monitor, Pencil, Plus, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { DuplicatePlanDialog } from '@/components/content/DuplicatePlanDialog'
import { PlanWeekDialog } from '@/components/content/PlanWeekDialog'
import { keys, useClasses, useContentPlans, useMyClasses, useProfileMap } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { addDays, formatDate, inTerm, TERM_WEEKS, termWeek, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useProfile } from '@/auth/AuthProvider'
import type { ContentPlan, Enrolment, PlanStatus } from '@/lib/types'

const WEEKS = Array.from({ length: TERM_WEEKS }, (_, i) => i + 1)

export function ClassDetailPage() {
  const { id } = useParams()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const classes = useClasses()
  const myClasses = useMyClasses()
  const plans = useContentPlans(id)
  const profiles = useProfileMap()
  const [editingWeek, setEditingWeek] = useState<number | null>(null)

  const cls = classes.data?.find((c) => c.id === id)
  // Mirrors the "plans: write" RLS policy.
  const canEdit = profile.role === 'admin' || (profile.role === 'trainer' && Boolean(myClasses.data?.some((c) => c.id === id)))
  const isStudent = profile.role === 'student'

  const enrolled = useQuery({
    queryKey: [...keys.enrolments, id, 'count'],
    enabled: Boolean(id) && !isStudent,
    queryFn: async () => (await api.get<Enrolment[]>('/enrolments', { class_id: id })).length,
  })

  const setStatus = useMutation({
    mutationFn: ({ plan, status }: { plan: ContentPlan; status: PlanStatus }) =>
      api.patch(`/content-plans/${plan.id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.allPlans }),
    onError: (err) => toast.error(err.message),
  })

  if (classes.isPending) return <Skeleton className="h-96 w-full" />
  if (classes.error) return <ErrorState error={classes.error} />
  if (!cls) return <EmptyState icon={BookOpen} title="Class not found" description="It may not exist, or you aren't enrolled in it." />

  const currentWeek = termWeek(cls.start_date, todayISO())
  const byWeek = new Map((plans.data ?? []).map((p) => [p.week_number, p]))
  const editingPlan = editingWeek ? byWeek.get(editingWeek) : undefined

  return (
    <>
      <Link to="/classes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {profile.role === 'admin' ? 'All content plans' : 'My classes'}
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">{cls.course?.code} · {cls.course?.name}</p>
          <h1 className="mt-1 text-3xl font-bold uppercase">{cls.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {cls.delivery_mode === 'online' ? <Monitor className="size-4" /> : <MapPin className="size-4" />}
              {cls.room}
            </span>
            <span>{cls.term} · started {formatDate(cls.start_date)}</span>
            {cls.trainer_id && <span>Trainer: {profiles.get(cls.trainer_id)?.full_name}</span>}
            {!isStudent && enrolled.data !== undefined && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-4" /> {enrolled.data} students
              </span>
            )}
          </div>
        </div>
        {canEdit && <DuplicatePlanDialog targetClassId={cls.id} hasExisting={(plans.data?.length ?? 0) > 0} />}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold uppercase">Content plan</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {inTerm(currentWeek) && <Badge>Week {currentWeek} now</Badge>}
          <span className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm border border-warning/60 bg-warning/20" /> Assessment week
          </span>
          {isStudent && <span>Weeks still in draft aren't shown.</span>}
        </div>
      </div>

      {plans.error ? (
        <ErrorState error={plans.error} />
      ) : plans.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="w-24 px-3 py-2">Week</th>
                  <th className="w-28 px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Topic</th>
                  <th className="px-3 py-2">Learning outcomes</th>
                  <th className="w-24 px-3 py-2">Resources</th>
                  <th className="w-36 px-3 py-2">Status</th>
                  {canEdit && <th className="w-12 px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {WEEKS.map((week) => {
                  const plan = byWeek.get(week)
                  return (
                    <tr
                      key={week}
                      className={cn(
                        'border-b align-top last:border-0',
                        plan?.assessment_due && 'bg-warning/10',
                        week === currentWeek && 'outline-2 -outline-offset-2 outline-primary/50',
                      )}
                    >
                      <td className="px-3 py-3">
                        <span className="block font-semibold">Week {week}</span>
                        <span className="block text-xs text-muted-foreground">{formatDate(addDays(cls.start_date, (week - 1) * 7)).slice(0, 5)}</span>
                      </td>
                      {plan ? (
                        <>
                          <td className="px-3 py-3 font-mono text-xs">{plan.unit_code ?? '—'}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium">{plan.topic}</span>
                            {plan.assessment_due && <StatusBadge status="assessment" className="ml-2" />}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{plan.learning_outcomes ?? '—'}</td>
                          <td className="px-3 py-3">
                            {plan.resources_url ? (
                              <a href={plan.resources_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                Open <ExternalLink className="size-3" />
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {canEdit ? (
                              <Select value={plan.status} onValueChange={(v) => setStatus.mutate({ plan, status: v as PlanStatus })}>
                                <SelectTrigger size="sm" className="w-28" aria-label={`Week ${week} status`}>
                                  <SelectValue>
                                    <StatusBadge status={plan.status} />
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="draft">Draft</SelectItem>
                                  <SelectItem value="ready">Ready</SelectItem>
                                  <SelectItem value="delivered">Delivered</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <StatusBadge status={plan.status} />
                            )}
                          </td>
                          {canEdit && (
                            <td className="px-2 py-2">
                              <Button variant="ghost" size="icon" aria-label={`Edit week ${week}`} onClick={() => setEditingWeek(week)}>
                                <Pencil className="size-4" />
                              </Button>
                            </td>
                          )}
                        </>
                      ) : (
                        <td colSpan={canEdit ? 6 : 5} className="px-3 py-3 text-muted-foreground">
                          {canEdit ? (
                            <Button variant="ghost" size="sm" onClick={() => setEditingWeek(week)}>
                              <Plus className="size-4" /> Plan this week
                            </Button>
                          ) : (
                            <span className="italic">Not published yet</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {WEEKS.map((week) => {
              const plan = byWeek.get(week)
              return (
                <Card
                  key={week}
                  className={cn('gap-0 py-0', plan?.assessment_due && 'border-warning/50 bg-warning/10', week === currentWeek && 'ring-2 ring-primary/40')}
                >
                  <CardContent className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        Week {week}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDate(addDays(cls.start_date, (week - 1) * 7))}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        {plan?.assessment_due && <StatusBadge status="assessment" />}
                        {plan && <StatusBadge status={plan.status} />}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="size-7" aria-label={`Edit week ${week}`} onClick={() => setEditingWeek(week)}>
                            {plan ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                          </Button>
                        )}
                      </span>
                    </div>
                    {plan ? (
                      <>
                        <p className="text-sm font-medium">
                          {plan.unit_code && <span className="mr-2 font-mono text-xs text-muted-foreground">{plan.unit_code}</span>}
                          {plan.topic}
                        </p>
                        {plan.learning_outcomes && <p className="text-sm text-muted-foreground">{plan.learning_outcomes}</p>}
                        {plan.resources_url && (
                          <a href={plan.resources_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                            Resources <ExternalLink className="size-3" />
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">{canEdit ? 'Not planned yet' : 'Not published yet'}</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {canEdit && (
        <PlanWeekDialog
          open={editingWeek !== null}
          onOpenChange={(open) => !open && setEditingWeek(null)}
          classId={cls.id}
          classStart={cls.start_date}
          week={editingWeek ?? 1}
          plan={editingPlan}
        />
      )}
    </>
  )
}
