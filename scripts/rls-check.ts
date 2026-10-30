// Signs in as each demo role and checks that row-level security behaves, through
// the real API (in-process, no server needed) plus a few direct SQL checks.
// Usage: npm run test:rls   (expects freshly seeded data: npm run db:reset)
import { app } from '../server/app.ts'
import { pool, withUser } from '../server/db.ts'

const PASSWORD = 'LanewayDemo2026!'
const CLASS = (n: number) => `e0000000-0000-4000-8000-00000000000${n}`
const ALL_TIME = { from: '2000-01-01', to: '2100-01-01' }
let failures = 0

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

type Res = { status: number; data: any }

function client(cookie = '') {
  const call = async (method: string, path: string, body?: unknown): Promise<Res> => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, data: res.status === 204 ? null : await res.json() }
  }
  return {
    get: (path: string, query?: Record<string, string>) => call('GET', query ? `${path}?${new URLSearchParams(query)}` : path),
    post: (path: string, body: unknown = {}) => call('POST', path, body),
    patch: (path: string, body: unknown) => call('PATCH', path, body),
    del: (path: string) => call('DELETE', path),
  }
}

async function as(email: string, password = PASSWORD) {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status !== 200) throw new Error(`${email}: login failed (${res.status})`)
  const cookie = res.headers.get('set-cookie')!.split(';')[0]
  const { profile } = (await res.json()) as { profile: { id: string } }
  return { ...client(cookie), id: profile.id as string }
}

// Anonymous
{
  const anon = client()
  const res = await anon.get('/profiles')
  check('anon API request is rejected', res.status === 401, `status ${res.status}`)
  const bad = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-password' }),
  })
  check('wrong password is rejected', bad.status === 401, `status ${bad.status}`)
  const rows = await withUser(null, (sql) => sql('select id from public.profiles'))
  check('database role without a user reads no profiles', rows.length === 0, `saw ${rows.length}`)
}

// Student
{
  const s = await as('student@example.com')
  const classes = await s.get('/classes')
  check('student sees only enrolled classes', classes.data.length === 1, `saw ${classes.data.length}`)
  const profiles = await s.get('/profiles')
  const students = profiles.data.filter((p: any) => p.role === 'student')
  check('student sees only own student profile', students.length === 1, `saw ${students.length}`)
  const notifs = await s.get('/notifications')
  check('student sees only own notifications', notifs.data.length > 0 && notifs.data.every((n: any) => n.user_id === s.id))
  const plans = await s.get('/content-plans')
  const drafts = plans.data.filter((p: any) => p.status === 'draft').length
  check('student cannot see draft content', drafts === 0, `saw ${drafts}`)
  const promote = await s.patch(`/profiles/${s.id}`, { role: 'admin' })
  check('student cannot promote self', promote.status === 403, promote.data?.error)
  const post = await s.post('/announcements', { title: 'x', body: 'x', audience: 'all' })
  check('student cannot post announcements', post.status === 403, post.data?.error)
  const ann = await s.get('/announcements')
  check('student sees only targeted announcements', ann.data.every((a: any) => a.audience !== 'class' || a.target_id === CLASS(1)), `${ann.data.length} visible`)
  const edit = await withUser(s.id, (sql) => sql("update public.notifications set title = 'hacked' where user_id = app.user_id()")).catch((e: Error) => e)
  check('student cannot edit notification text (SQL)', edit instanceof Error, edit instanceof Error ? edit.message : '')
  const shifts = await s.get('/shifts', ALL_TIME)
  check('student sees only own class sessions', shifts.data.length > 0 && shifts.data.every((x: any) => x.class_id === CLASS(1)), `${shifts.data.length} sessions`)
}

// Trainer (Marcus: lead for classes 1 and 4, plus the imported class 3 shift)
{
  const t = await as('trainer@example.com')
  const shifts = await t.get('/shifts', ALL_TIME)
  check('trainer sees only own shifts', shifts.data.every((x: any) => x.trainer_id === t.id || x.cover_trainer_id === t.id), `${shifts.data.length} shifts`)
  const own = await t.post('/announcements', { title: 'RLS test', body: '<p>t</p>', audience: 'class', target_id: CLASS(1) })
  check('trainer can post to own class', own.status === 201, own.data?.error)
  const other = await t.post('/announcements', { title: 'RLS test', body: 't', audience: 'class', target_id: CLASS(6) })
  check('trainer cannot post to another class', other.status === 403, other.data?.error)
  const all = await t.post('/announcements', { title: 'RLS test', body: 't', audience: 'all' })
  check('trainer cannot post to all students', all.status === 403, all.data?.error)
  const otherPlan = (await t.get('/content-plans', { class_id: CLASS(5) })).data[0]
  const planOther = await t.patch(`/content-plans/${otherPlan.id}`, { topic: 'hijack' })
  check('trainer cannot edit another class plan', planOther.status === 404, `status ${planOther.status}`)
  const week8 = (await t.get('/content-plans', { class_id: CLASS(1) })).data.find((p: any) => p.week_number === 8)
  const planOwn = await t.patch(`/content-plans/${week8.id}`, { status: 'ready' })
  check('trainer can edit own class plan', planOwn.status === 200, planOwn.data?.error)
  await t.patch(`/content-plans/${week8.id}`, { status: week8.status })
  const ownShift = shifts.data.find((x: any) => x.trainer_id === t.id)
  const shiftEdit = await t.patch(`/shifts/${ownShift.id}`, { start_time: '08:00' })
  check('trainer cannot edit shifts directly', shiftEdit.status === 404, `status ${shiftEdit.status}`)
  if (own.status === 201) {
    const link = `/announcements/${own.data.id}`
    const student = await as('student@example.com')
    const got = (await student.get('/notifications')).data.filter((n: any) => n.link === link).length
    check('class announcement notified an enrolled student', got === 1, `${got} notifications`)
    const outsider = await as('felipe.duarte@example.com')
    const none = (await outsider.get('/notifications')).data.filter((n: any) => n.link === link).length
    check('students outside the class were not notified', none === 0, `${none} notifications`)
    await t.del(`/announcements/${own.data.id}`)
  }
}

// Admin
{
  const a = await as('admin@example.com')
  const shifts = (await a.get('/shifts', ALL_TIME)).data
  check('admin sees all shifts', shifts.length === 25, `saw ${shifts.length}`)
  const day = shifts.find((x: any) => x.class_id === CLASS(1))
  const overlap = await a.post('/shifts', { trainer_id: day.trainer_id, class_id: CLASS(6), date: day.date, start_time: '10:00', end_time: '12:00' })
  check('overlapping shift is blocked', overlap.status === 409 && overlap.data.code === '23P01', overlap.data?.error)
  const ok = await a.post('/shifts', { trainer_id: day.trainer_id, class_id: CLASS(6), date: day.date, start_time: '15:00', end_time: '16:00' })
  check('back-to-back shift (starts as another ends) is allowed', ok.status === 201, ok.data?.error)
  if (ok.status === 201) await a.del(`/shifts/${ok.data.id}`)

  const created = await a.post('/profiles', { email: 'rls.test@example.com', full_name: 'RLS Test', role: 'trainer', password: 'TestPass123!' })
  check('admin can create a user', created.status === 201, created.data?.error)
  if (created.status === 201) {
    const login = await as('rls.test@example.com', 'TestPass123!').then(() => true, () => false)
    check('new user can sign in', login)
    const removed = await a.del(`/profiles/${created.data.id}`)
    check('admin can delete a user', removed.status === 204, `status ${removed.status}`)
  }
  const self = await a.del(`/profiles/${a.id}`)
  check("admin can't delete own account", self.status === 400, self.data?.error)
}

await pool.end()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll RLS checks passed')
process.exit(failures ? 1 : 0)
