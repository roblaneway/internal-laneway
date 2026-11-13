import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class HttpError extends Error {
  status: ContentfulStatusCode
  code?: string

  constructor(status: ContentfulStatusCode, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFound = () => new HttpError(404, 'Not found, or you do not have access to it')

// Postgres error codes → HTTP status. The database raises the domain errors
// (RLS, overlap check, validation), so their messages are shown to the user.
const STATUS_BY_SQLSTATE: Record<string, ContentfulStatusCode> = {
  '42501': 403, // insufficient privilege / RLS violation
  '23P01': 409, // overlapping shift
  '23505': 409, // unique violation
  '23503': 409, // foreign key violation
  '23502': 400, // not null violation
  '23514': 400, // check violation
  '22P02': 400, // invalid text representation (e.g. a bad uuid)
  '22007': 400, // invalid datetime format
  '22008': 400, // datetime field overflow
  '22023': 400, // invalid parameter value
  '22001': 400, // value too long
  P0001: 400, // raise exception
}

const MESSAGE_BY_CONSTRAINT: Record<string, string> = {
  profiles_email_key: 'A user with that email already exists',
  courses_code_key: 'A course with that code already exists',
  classes_course_id_fkey: 'This course still has classes. Delete or move them first.',
  roster_shifts_time_order: 'The end time must be after the start time',
  roster_shifts_cover_differs: 'The cover trainer must be different from the rostered trainer',
  announcements_target: 'Choose who the announcement is for',
  trainer_billing_rate_check: "The hourly rate can't be negative",
  trainer_billing_abn_check: 'An ABN has 11 digits',
  trainer_billing_bsb_check: 'A BSB has 6 digits',
  trainer_billing_account_check: 'An account number has 4 to 10 digits',
  trainer_billing_trainer_id_fkey: 'That trainer no longer exists',
  trainer_billing_assessment_rate_check: "The assessment rate can't be negative",
  classes_paid_hours_check: 'Paid hours must be more than 0 and at most 24',
  marked_assessments_activity_check: 'Say which assessment was marked',
  marked_assessments_unit_check: 'Add the unit code',
  marked_assessments_course_check: 'Add the course',
  marked_assessments_kind_check: 'Choose assessment or reassessment',
  marked_assessments_quantity_check: 'The quantity must be between 1 and 500',
  marked_assessments_trainer_id_fkey: 'That trainer no longer exists',
  class_students_name_check: "Add the student's name",
  class_students_class_id_fkey: 'That class no longer exists',
  class_tasks_kind_check: 'Choose assessment or presentation',
  class_tasks_title_check: 'Give it a name, like "Assessment 1"',
  class_tasks_class_id_fkey: 'That class no longer exists',
  task_results_result_check: 'Choose a result',
  task_results_attempt_check: 'The attempt must be 1, 2 or 3',
  course_units_term_check: 'Choose the term',
  course_units_code_check: 'Add the unit code',
  course_units_start_week_check: 'The first week must be between 1 and 10',
  course_units_end_week_check: 'The last week must be between 1 and 10',
  course_units_weeks_check: "The last week can't be before the first week",
  course_units_unique: 'That unit is already listed for this course and term',
  course_units_course_id_fkey: 'That course no longer exists',
  class_preparation_week_check: 'The week must be between 1 and 10',
  class_preparation_hours_check: 'Prep hours must be more than 0 and at most 24',
  class_preparation_class_id_fkey: 'That class no longer exists',
  class_preparation_trainer_id_fkey: 'That trainer no longer exists',
  task_results_task_fkey: "That student isn't on this class's list",
  task_results_student_fkey: "That student isn't on this class's list",
}

interface PgError {
  code?: string
  constraint?: string
  message: string
}

export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) return c.json({ error: err.message, code: err.code }, err.status)

  const pgErr = err as PgError
  const status = pgErr.code ? STATUS_BY_SQLSTATE[pgErr.code] : undefined
  if (status) {
    const message =
      (pgErr.constraint && MESSAGE_BY_CONSTRAINT[pgErr.constraint]) ||
      (pgErr.message.startsWith('new row violates row-level security') ? "You don't have permission to do that" : pgErr.message)
    return c.json({ error: message, code: pgErr.code }, status)
  }

  console.error(err)
  return c.json({ error: 'Something went wrong on the server' }, 500)
}
