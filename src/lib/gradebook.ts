import { addDays } from '@/lib/dates'
import { evidenceFor } from '@/lib/feedback'
import type { AssessmentPlanRow, ClassRow, ClassTask, CourseUnit, TaskKind, TaskResult, TaskResultValue } from '@/lib/types'

export const RESULT_LABEL: Record<TaskResultValue, string> = {
  S: 'Satisfactory',
  NYS: 'Not yet satisfactory',
  NS: 'Not submitted',
  ABSENT: 'Absent',
  RESCHEDULED: 'Rescheduled',
}

export const RESULT_SHORT: Record<TaskResultValue, string> = { S: 'S', NYS: 'NYS', NS: 'NS', ABSENT: 'Absent', RESCHEDULED: 'Resched.' }

export const RESULT_STYLE: Record<TaskResultValue, string> = {
  S: 'bg-success/10 text-success border-success/30',
  NYS: 'bg-destructive/10 text-destructive border-destructive/30',
  NS: 'bg-muted text-muted-foreground border-border',
  ABSENT: 'bg-warning/15 text-[oklch(0.45_0.12_60)] border-warning/30',
  RESCHEDULED: 'bg-accent text-accent-foreground border-primary/20',
}

export const resultKey = (taskId: string, studentId: string) => `${taskId}:${studentId}`

/** Presenting counts whatever the result: S or NYS means the student showed their performance. */
export const hasPresented = (r: TaskResult | undefined) => r?.result === 'S' || r?.result === 'NYS'

/** An assessment that needs the student's performance (Assessment 2) and so a presentation. */
export const needsPresentation = (task: ClassTask) => task.kind === 'assessment' && evidenceFor(task.title) === 'performance'

export type PresentationState =
  | { state: 'presented'; task: ClassTask; result: TaskResult }
  | { state: 'absent' | 'rescheduled'; task: ClassTask; result: TaskResult }
  | { state: 'none'; task: ClassTask }

/**
 * Where a student is with a unit's presentation: presented in any of its presentation columns, or
 * else the latest absence or reschedule, or nothing yet. Null when the unit has no presentation.
 */
export function presentationState(
  tasks: ClassTask[],
  results: Map<string, TaskResult>,
  unitCode: string | null,
  studentId: string,
): PresentationState | null {
  if (!unitCode) return null
  const forUnit = tasks.filter((t) => t.kind === 'presentation' && t.unit_code === unitCode)
  if (!forUnit.length) return null
  let latest: { task: ClassTask; result: TaskResult } | undefined
  for (const task of forUnit) {
    const result = results.get(resultKey(task.id, studentId))
    if (!result) continue
    if (hasPresented(result)) return { state: 'presented', task, result }
    if (!latest || (result.marked_on ?? '') >= (latest.result.marked_on ?? '')) latest = { task, result }
  }
  if (latest) return { state: latest.result.result === 'ABSENT' ? 'absent' : 'rescheduled', ...latest }
  return { state: 'none', task: forUnit[0] }
}

export interface PlannedTask {
  kind: TaskKind
  title: string
  unit_code: string
  due_date: string | null
  /** Already a column in the gradebook. */
  exists: boolean
}

const PRESENTATION_TITLE = 'Assessment 2 presentation'

/**
 * Columns the term plan suggests for a class: per unit, Assessment 1 and 2 (assessments) or the
 * Assessment 2 presentation. Units are the class's course units for its term, else the plan rows
 * named like the class's course; dates come from the plan, else Assessment 2 at the unit's last week.
 */
export function plannedTasks(
  kind: TaskKind,
  cls: ClassRow & { course: { name: string; code: string } | null },
  classUnits: CourseUnit[],
  plan: AssessmentPlanRow[],
  tasks: ClassTask[],
): PlannedTask[] {
  const termPlan = plan.filter((p) => p.term === cls.term)
  const names = [cls.course?.name, cls.course?.code, cls.invoice_label].filter(Boolean).map((n) => n!.toLowerCase())
  const codes = classUnits.length
    ? classUnits.map((u) => u.code)
    : termPlan.filter((p) => names.includes(p.course.toLowerCase())).map((p) => p.unit_code)
  const activities = kind === 'presentation' ? ['Assessment 2'] : ['Assessment 1', 'Assessment 2']

  const out: PlannedTask[] = []
  for (const code of new Set(codes)) {
    const unit = classUnits.find((u) => u.code === code)
    for (const activity of activities) {
      const row = termPlan.find((p) => p.unit_code === code && p.activity === activity)
      const fallback = activity === 'Assessment 2' && unit?.end_week ? addDays(cls.start_date, unit.end_week * 7) : null
      const title = kind === 'presentation' ? PRESENTATION_TITLE : activity
      const exists = tasks.some(
        (t) => t.kind === kind && t.unit_code === code && (kind === 'presentation' || t.title.trim().toLowerCase() === title.toLowerCase()),
      )
      out.push({ kind, title, unit_code: code, due_date: row?.due_on ?? fallback, exists })
    }
  }
  // Units in date order (by their earliest date), each unit's assessments together.
  const unitDate = (code: string) => out.filter((o) => o.unit_code === code && o.due_date).map((o) => o.due_date!).sort()[0] ?? '9999'
  return out.sort(
    (a, b) => unitDate(a.unit_code).localeCompare(unitDate(b.unit_code)) || a.unit_code.localeCompare(b.unit_code) || a.title.localeCompare(b.title),
  )
}
