import { Hono, type Context } from 'hono'
import type { AuthEnv } from './auth.ts'
import { deleteRow, insertRow, pick, updateRow, withUser, type Row, type Sql } from './db.ts'
import { randomInt } from 'node:crypto'
import { HttpError, notFound } from './errors.ts'
import { inviteMail, sendMail } from './mail.ts'
import { notificationStream } from './realtime.ts'

// Every route runs inside withUser(), so row-level security in the database is
// what actually enforces access; these handlers only shape the queries.

type Ctx = Context<AuthEnv>

export const api = new Hono<AuthEnv>()

const run = <T>(c: Ctx, fn: (sql: Sql) => Promise<T>) => withUser(c.get('userId'), fn)
const body = (c: Ctx) => c.req.json<Row>().catch(() => ({}) as Row)
const found = <T>(row: T | undefined): T => {
  if (!row) throw notFound()
  return row
}

function requiredQuery(c: Ctx, ...names: string[]): string[] {
  return names.map((name) => {
    const value = c.req.query(name)
    if (!value) throw new HttpError(400, `Query parameter "${name}" is required`)
    return value
  })
}

/** Standard create / update / delete routes for a table with an `id` column. */
function crud(path: string, table: string, columns: readonly string[]) {
  api.post(path, async (c) => {
    const data = pick(await body(c), columns)
    return c.json(await run(c, (sql) => insertRow(sql, table, data)), 201)
  })
  api.patch(`${path}/:id`, async (c) => {
    const data = pick(await body(c), columns)
    return c.json(found(await run(c, (sql) => updateRow(sql, table, c.req.param('id'), data))))
  })
  api.delete(`${path}/:id`, async (c) => {
    if (!(await run(c, (sql) => deleteRow(sql, table, c.req.param('id'))))) throw notFound()
    return c.body(null, 204)
  })
}

// --- Profiles and users -----------------------------------------------------

api.get('/profiles', async (c) => c.json(await run(c, (sql) => sql('select * from public.profiles order by full_name'))))

api.patch('/profiles/:id', async (c) => {
  const data = pick(await body(c), ['full_name', 'role', 'avatar_url'])
  return c.json(found(await run(c, (sql) => updateRow(sql, 'profiles', c.req.param('id'), data))))
})

// app.create_user() checks the caller is an admin and hashes the password.
api.post('/profiles', async (c) => {
  const { email, password, full_name, role } = await body(c)
  if (!email || !password || !full_name || !role) throw new HttpError(400, 'Name, email, role and password are required')
  const profile = await run(c, async (sql) => {
    const [{ id }] = await sql('select app.create_user($1, $2, $3, $4) as id', [email, password, full_name, role])
    return (await sql('select * from public.profiles where id = $1', [id]))[0]
  })
  return c.json(profile, 201)
})

// --- Email invites -----------------------------------------------------------

// No 0/O or 1/l/I, so the password is easy to read from an email.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const temporaryPassword = () =>
  Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('')).join('-')

/**
 * Invite a new user, or re-invite an existing one, by email with a temporary password.
 * app.invite_user() checks the caller is an admin. The email is sent before the
 * transaction commits, so a failed send leaves the account unchanged.
 */
api.post('/invites', async (c) => {
  const { email, full_name, role } = await body(c)
  if (!email) throw new HttpError(400, 'Email is required')
  const password = temporaryPassword()
  const loginUrl = `${process.env.APP_URL || c.req.header('origin') || new URL(c.req.url).origin}/login`
  const result = await run(c, async (sql) => {
    const [invite] = await sql<{ user_id: string; created: boolean }>('select * from app.invite_user($1, $2, $3, $4)', [
      email,
      full_name ?? null,
      role ?? null,
      password,
    ])
    const [profile] = await sql('select * from public.profiles where id = $1', [invite.user_id])
    const [{ expires_at }] = await sql<{ expires_at: Date }>('select expires_at from app.pending_invites() where user_id = $1', [invite.user_id])
    await sendMail(inviteMail({ to: profile.email, name: profile.full_name, role: profile.role, password, loginUrl, expiresAt: expires_at }))
    return { profile, created: invite.created, expires_at }
  })
  return c.json(result, result.created ? 201 : 200)
})

/** Users who haven't replaced their temporary password yet (admins only). */
api.get('/invites/pending', async (c) => c.json(await run(c, (sql) => sql('select * from app.pending_invites()'))))

api.delete('/profiles/:id', async (c) => {
  if (c.req.param('id') === c.get('userId')) throw new HttpError(400, "You can't delete your own account")
  if (!(await run(c, (sql) => deleteRow(sql, 'profiles', c.req.param('id'))))) throw notFound()
  return c.body(null, 204)
})

// --- Courses, classes and enrolments -----------------------------------------

api.get('/courses', async (c) => c.json(await run(c, (sql) => sql('select * from public.courses order by code'))))
crud('/courses', 'courses', ['code', 'name'])

api.get('/classes', async (c) =>
  c.json(
    await run(c, (sql) =>
      sql(`
        select cl.*, to_jsonb(co) as course
        from public.classes cl
        left join public.courses co on co.id = cl.course_id
        order by cl.name`),
    ),
  ),
)
crud('/classes', 'classes', [
  'course_id',
  'name',
  'room',
  'delivery_mode',
  'term',
  'start_date',
  'trainer_id',
  'invoice_label',
  'paid_hours',
])

api.get('/enrolments', async (c) => {
  const classId = c.req.query('class_id')
  return c.json(
    await run(c, (sql) =>
      classId
        ? sql('select class_id, student_id from public.class_enrolments where class_id = $1', [classId])
        : sql('select class_id, student_id from public.class_enrolments'),
    ),
  )
})

/** Add and remove students in one transaction. */
api.post('/classes/:id/enrolments', async (c) => {
  const { add = [], remove = [] } = (await body(c)) as { add?: string[]; remove?: string[] }
  const classId = c.req.param('id')
  const result = await run(c, async (sql) => {
    const added = add.length
      ? await sql(
          `insert into public.class_enrolments (class_id, student_id)
           select $1, unnest($2::uuid[]) on conflict do nothing returning student_id`,
          [classId, add],
        )
      : []
    const removed = remove.length
      ? await sql(
          'delete from public.class_enrolments where class_id = $1 and student_id = any($2::uuid[]) returning student_id',
          [classId, remove],
        )
      : []
    return { added: added.length, removed: removed.length }
  })
  return c.json(result)
})

// --- Roster ----------------------------------------------------------------

api.get('/shifts', async (c) => {
  const [from, to] = requiredQuery(c, 'from', 'to')
  return c.json(
    await run(c, (sql) =>
      sql('select * from public.roster_shifts where date between $1 and $2 order by date, start_time', [from, to]),
    ),
  )
})

/** Classes the signed-in trainer holds a live shift for. */
api.get('/shifts/my-class-ids', async (c) => {
  const rows = await run(c, (sql) =>
    sql(`
      select distinct class_id from public.roster_shifts
      where status <> 'cancelled' and app.user_id() in (trainer_id, cover_trainer_id)`),
  )
  return c.json(rows.map((r) => r.class_id))
})

crud('/shifts', 'roster_shifts', [
  'trainer_id',
  'class_id',
  'date',
  'start_time',
  'end_time',
  'status',
  'needs_cover',
  'cover_trainer_id',
  'notes',
])

api.post('/shifts/:id/request-cover', async (c) => {
  const { needs_cover = true } = await body(c)
  await run(c, (sql) => sql('select public.request_cover($1, $2)', [c.req.param('id'), needs_cover]))
  return c.json({ ok: true })
})

api.get('/roster-conflicts', async (c) => {
  const [from, to] = requiredQuery(c, 'from', 'to')
  return c.json(await run(c, (sql) => sql('select * from public.roster_conflicts($1, $2)', [from, to])))
})

// --- Announcements and notifications ------------------------------------------

api.get('/announcements', async (c) =>
  c.json(
    await run(c, (sql) =>
      sql('select * from public.announcements order by pinned desc, published_at desc nulls first'),
    ),
  ),
)
// author_id defaults to the signed-in user; RLS stops trainers posting outside their classes.
crud('/announcements', 'announcements', ['title', 'body', 'audience', 'target_id', 'pinned', 'published_at'])

api.get('/notifications', async (c) =>
  c.json(
    await run(c, (sql) =>
      sql('select * from public.notifications where user_id = app.user_id() order by created_at desc limit 100'),
    ),
  ),
)

api.get('/notifications/stream', (c) => notificationStream(c, c.get('userId')))

api.post('/notifications/read-all', async (c) => {
  await run(c, (sql) => sql('select public.mark_all_notifications_read()'))
  return c.json({ ok: true })
})

api.post('/notifications/:id/read', async (c) => {
  const [row] = await run(c, (sql) =>
    sql('update public.notifications set read_at = coalesce(read_at, now()) where id = $1 returning *', [c.req.param('id')]),
  )
  return c.json(found(row))
})

// --- Content plans -----------------------------------------------------------

const PLAN_COLUMNS = ['unit_code', 'topic', 'learning_outcomes', 'resources_url', 'assessment_due', 'status'] as const

api.get('/content-plans', async (c) => {
  const classId = c.req.query('class_id')
  return c.json(
    await run(c, (sql) =>
      classId
        ? sql('select * from public.content_plans where class_id = $1 order by week_number', [classId])
        : sql('select * from public.content_plans order by class_id, week_number'),
    ),
  )
})

/** Create or replace one week of a class's plan. */
api.put('/content-plans/:classId/weeks/:week', async (c) => {
  const data = pick(await body(c), PLAN_COLUMNS)
  const cols = Object.keys(data)
  const values = [c.req.param('classId'), Number(c.req.param('week')), ...Object.values(data)]
  const insertCols = ['class_id', 'week_number', ...cols].join(', ')
  const params = values.map((_, i) => `$${i + 1}`).join(', ')
  const updates = cols.length ? cols.map((col) => `${col} = excluded.${col}`).join(', ') : 'week_number = excluded.week_number'
  const [row] = await run(c, (sql) =>
    sql(
      `insert into public.content_plans (${insertCols}) values (${params})
       on conflict (class_id, week_number) do update set ${updates} returning *`,
      values,
    ),
  )
  return c.json(row)
})

api.patch('/content-plans/:id', async (c) => {
  const data = pick(await body(c), PLAN_COLUMNS)
  return c.json(found(await run(c, (sql) => updateRow(sql, 'content_plans', c.req.param('id'), data))))
})

api.post('/content-plans/duplicate', async (c) => {
  const { source_class_id, target_class_id } = await body(c)
  if (!source_class_id || !target_class_id) throw new HttpError(400, 'Choose a class to copy from')
  const [{ count }] = await run(c, (sql) =>
    sql('select public.duplicate_content_plan($1, $2) as count', [source_class_id, target_class_id]),
  )
  return c.json({ count })
})

// --- Trainer invoice details -------------------------------------------------

const BILLING_COLUMNS = [
  'hourly_rate',
  'business_name',
  'abn',
  'gst_registered',
  'address',
  'phone',
  'bank_name',
  'bank_account_name',
  'bank_bsb',
  'bank_account_number',
  'assessment_rate',
] as const

/** A trainer's invoice details, or null if none are saved yet (or RLS hides them). */
api.get('/trainer-billing/:trainerId', async (c) => {
  const [row] = await run(c, (sql) => sql('select * from public.trainer_billing where trainer_id = $1', [c.req.param('trainerId')]))
  return c.json(row ?? null)
})

/** Create or update a trainer's invoice details. Only admins may change the rates (trigger). */
api.put('/trainer-billing/:trainerId', async (c) => {
  const data = pick(await body(c), BILLING_COLUMNS)
  const cols = Object.keys(data)
  const values = [c.req.param('trainerId'), ...Object.values(data)]
  const insertCols = ['trainer_id', ...cols].join(', ')
  const params = values.map((_, i) => `$${i + 1}`).join(', ')
  const updates = cols.length ? cols.map((col) => `${col} = excluded.${col}`).join(', ') : 'trainer_id = excluded.trainer_id'
  const [row] = await run(c, (sql) =>
    sql(
      `insert into public.trainer_billing (${insertCols}) values (${params})
       on conflict (trainer_id) do update set ${updates} returning *`,
      values,
    ),
  )
  return c.json(found(row))
})

// --- Marked assessments ------------------------------------------------------

/** Assessments marked between two dates; RLS limits trainers to their own. */
api.get('/marked-assessments', async (c) => {
  const [from, to] = requiredQuery(c, 'from', 'to')
  const trainerId = c.req.query('trainer_id')
  return c.json(
    await run(c, (sql) =>
      trainerId
        ? sql(
            `select * from public.marked_assessments where marked_on between $1 and $2 and trainer_id = $3
             order by marked_on, created_at`,
            [from, to, trainerId],
          )
        : sql('select * from public.marked_assessments where marked_on between $1 and $2 order by marked_on, created_at', [from, to]),
    ),
  )
})
// trainer_id defaults to the signed-in user; only admins can record marking for someone else (RLS).
crud('/marked-assessments', 'marked_assessments', ['trainer_id', 'marked_on', 'activity', 'unit_code', 'term', 'course', 'kind', 'quantity'])
