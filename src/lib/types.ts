// Row types returned by the API. They mirror the tables in db/migrations.
// Dates are 'YYYY-MM-DD', times 'HH:MM:SS' and timestamps ISO 8601 strings.

export type Role = 'admin' | 'trainer' | 'student'
export type ShiftStatus = 'scheduled' | 'covered' | 'cancelled'
export type PlanStatus = 'draft' | 'ready' | 'delivered'
export type Audience = 'all' | 'course' | 'class'
export type DeliveryMode = 'on-campus' | 'online'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  avatar_url: string | null
  created_at: string
}

export interface Course {
  id: string
  code: string
  name: string
  created_at: string
}

export interface ClassRow {
  id: string
  course_id: string
  name: string
  room: string | null
  delivery_mode: DeliveryMode
  term: string
  start_date: string
  trainer_id: string | null
  /** How the class appears on invoices, e.g. "DIPLOMA IT FOUNDATION". */
  invoice_label: string | null
  /** Hours paid per session (numeric, as a string), when not the rostered time. */
  paid_hours: string | null
  created_at: string
}

export interface Enrolment {
  class_id: string
  student_id: string
}

export interface Shift {
  id: string
  trainer_id: string
  class_id: string
  date: string
  start_time: string
  end_time: string
  status: ShiftStatus
  needs_cover: boolean
  cover_trainer_id: string | null
  notes: string | null
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  audience: Audience
  target_id: string | null
  author_id: string | null
  pinned: boolean
  published_at: string | null
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface ContentPlan {
  id: string
  class_id: string
  week_number: number
  unit_code: string | null
  topic: string
  learning_outcomes: string | null
  resources_url: string | null
  assessment_due: boolean
  status: PlanStatus
  updated_at: string
}

/** A trainer's invoice details. Money comes back from Postgres numeric as a string. */
export interface TrainerBilling {
  trainer_id: string
  hourly_rate: string | null
  business_name: string | null
  abn: string | null
  gst_registered: boolean
  address: string | null
  phone: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_bsb: string | null
  bank_account_number: string | null
  assessment_rate: string | null
  updated_at: string
}

export type AssessmentKind = 'Assessment' | 'Reassessment'

/** 'marked': done but not invoiced yet; 'ready': on the invoice for the fortnight of `ready_on`. */
export type MarkingStatus = 'marked' | 'ready'

/** Assessments a trainer marked, billed once ready on the invoice for the fortnight of `ready_on`. */
export interface MarkedAssessment {
  id: string
  trainer_id: string
  marked_on: string
  activity: string
  unit_code: string
  term: string | null
  course: string
  kind: AssessmentKind
  quantity: number
  status: MarkingStatus
  ready_on: string | null
  /** Set when recorded from the trainer's term assessment plan. */
  plan_id: string | null
  created_at: string
  updated_at: string
}

/** A unit's assessment in a trainer's term plan, with its marking (at most one per kind). */
export interface AssessmentPlanRow {
  id: string
  trainer_id: string
  term: string
  course: string
  unit_code: string
  activity: string
  due_on: string | null
  review_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
  markings: MarkedAssessment[]
}

/** Hours a trainer spent preparing a class in a term week, paid at their hourly rate. */
export interface ClassPreparation {
  id: string
  trainer_id: string
  class_id: string
  week_number: number
  /** numeric, as a string */
  hours: string
  notes: string | null
  created_at: string
  updated_at: string
}

/** A student on a trainer's list for a class (not necessarily a portal user). */
export interface ClassStudent {
  id: string
  class_id: string
  full_name: string
  student_number: string | null
  withdrawn: boolean
  created_at: string
}

export type TaskKind = 'assessment' | 'presentation'

/** An assessment or presentation in a class's gradebook. */
export interface ClassTask {
  id: string
  class_id: string
  kind: TaskKind
  title: string
  unit_code: string | null
  due_date: string | null
  created_at: string
}

/** S / NYS / NS (not submitted) for assessments; presentations can also be ABSENT or RESCHEDULED. */
export type TaskResultValue = 'S' | 'NYS' | 'NS' | 'ABSENT' | 'RESCHEDULED'

export interface TaskResult {
  task_id: string
  student_id: string
  class_id: string
  result: TaskResultValue
  attempt: number
  marked_on: string | null
  feedback: string | null
  updated_at: string
}

export interface CourseUnit {
  id: string
  course_id: string
  term: string
  code: string
  title: string | null
  start_week: number | null
  end_week: number | null
  notes: string | null
  resources_url: string | null
  created_at: string
}

export interface Gradebook {
  students: ClassStudent[]
  tasks: ClassTask[]
  results: TaskResult[]
}

export interface RosterConflict {
  shift_id: string
  other_shift_id: string
  trainer_id: string
  date: string
}

export type ClassWithCourse = ClassRow & { course: Course | null }

/** Which result a feedback template is suggested for. */
export type FeedbackOutcome = 'satisfactory' | 'reassessment' | 'not_satisfactory_final' | 'not_submitted' | 'not_presented' | 'other'

/** A feedback template; no owner means shared (managed by admins). */
export interface FeedbackTemplate {
  id: string
  owner_id: string | null
  name: string
  outcome: FeedbackOutcome
  body: string
  created_at: string
  updated_at: string
}

export interface EvidenceItem {
  text: string
  items?: string[]
}

/** A unit's evidence lists from training.gov.au (cached by the API). */
export interface UnitEvidence {
  code: string
  title: string
  release: string
  knowledge: EvidenceItem[]
  performance: EvidenceItem[]
  fetched_at: string
}
