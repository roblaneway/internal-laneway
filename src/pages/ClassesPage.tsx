import { Link } from 'react-router-dom'
import { BookOpen, MapPin, Monitor } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { useAllContentPlans, useClasses, useMyClasses, useProfileMap } from '@/hooks/use-data'
import { inTerm, TERM_WEEKS, termWeek, todayISO } from '@/lib/dates'
import { useProfile } from '@/auth/AuthProvider'
import type { ClassWithCourse, ContentPlan } from '@/lib/types'

export function ClassesPage() {
  const profile = useProfile()
  const isStaff = profile.role !== 'student'
  const mine = useMyClasses()
  const all = useClasses()
  const plans = useAllContentPlans(isStaff)
  const profiles = useProfileMap()

  const myIds = new Set(mine.data?.map((c) => c.id))
  // Trainers see their own classes first, then everyone else's (to compare plans).
  const sections: { title: string; classes: ClassWithCourse[] }[] =
    profile.role === 'trainer'
      ? [
          { title: 'My classes', classes: mine.data ?? [] },
          { title: 'Other classes', classes: (all.data ?? []).filter((c) => !myIds.has(c.id)) },
        ]
      : [{ title: '', classes: all.data ?? [] }]

  const title = profile.role === 'admin' ? 'Content plans' : 'My classes'
  const description =
    profile.role === 'student'
      ? 'Your classes and what is coming up each week.'
      : 'Week-by-week plans for every class. Open a class to edit or compare its plan.'

  return (
    <>
      <PageHeader title={title} description={description} />
      {all.error ? (
        <ErrorState error={all.error} />
      ) : all.isPending || mine.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : !all.data?.length ? (
        <EmptyState icon={BookOpen} title="No classes yet" description={isStaff ? 'Classes are set up by an administrator.' : "You aren't enrolled in a class yet."} />
      ) : (
        <div className="space-y-8">
          {sections
            .filter((s) => s.classes.length > 0)
            .map((section) => (
              <section key={section.title}>
                {section.title && <h2 className="mb-3 text-xl font-semibold uppercase">{section.title}</h2>}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {section.classes.map((c) => (
                    <ClassCard
                      key={c.id}
                      cls={c}
                      plans={plans.data?.filter((p) => p.class_id === c.id)}
                      trainerName={c.trainer_id ? profiles.get(c.trainer_id)?.full_name : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </>
  )
}

function ClassCard({ cls, plans, trainerName }: { cls: ClassWithCourse; plans?: ContentPlan[]; trainerName?: string }) {
  const week = termWeek(cls.start_date, todayISO())
  const ready = plans?.filter((p) => p.status !== 'draft').length ?? 0

  return (
    <Link to={`/classes/${cls.id}`}>
      <Card className="h-full gap-0 py-0 transition-colors hover:border-primary/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{cls.name}</p>
              <p className="text-xs text-muted-foreground">{cls.course?.name}</p>
            </div>
            <Badge variant="outline" className="shrink-0 capitalize">
              {cls.delivery_mode}
            </Badge>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="inline-flex items-center gap-1">
              {cls.delivery_mode === 'online' ? <Monitor className="size-3" /> : <MapPin className="size-3" />}
              {cls.room}
            </p>
            <p>
              {cls.term}
              {inTerm(week) && ` · Week ${week}`}
              {trainerName && ` · ${trainerName}`}
            </p>
          </div>
          {plans && (
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Weeks planned</span>
                <span className="font-medium">{ready} / {TERM_WEEKS} ready</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(ready / TERM_WEEKS) * 100}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
