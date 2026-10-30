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
