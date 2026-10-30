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

/** Assessments a trainer marked, billed on the invoice for the fortnight of `marked_on`. */
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
  created_at: string
  updated_at: string
}

export interface RosterConflict {
  shift_id: string
  other_shift_id: string
  trainer_id: string
  date: string
}

export type ClassWithCourse = ClassRow & { course: Course | null }
