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
    put: (path: string, body: unknown) => call('PUT', path, body),
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

// Trainer (Marcus: lead trainer for class 1 only)
{
  const t = await as('trainer@example.com')
  const shifts = await t.get('/shifts', ALL_TIME)
  check('trainer sees only own shifts', shifts.data.every((x: any) => x.trainer_id === t.id || x.cover_trainer_id === t.id), `${shifts.data.length} shifts`)
  const own = await t.post('/announcements', { title: 'RLS test', body: '<p>t</p>', audience: 'class', target_id: CLASS(1) })
  check('trainer can post to own class', own.status === 201, own.data?.error)
  const other = await t.post('/announcements', { title: 'RLS test', body: 't', audience: 'class', target_id: CLASS(4) })
  check('trainer cannot post to another class', other.status === 403, other.data?.error)
  const all = await t.post('/announcements', { title: 'RLS test', body: 't', audience: 'all' })
  check('trainer cannot post to all students', all.status === 403, all.data?.error)
  const otherPlan = (await t.get('/content-plans', { class_id: CLASS(3) })).data[0]
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

// Trainer invoice details (rates and bank details are private to the trainer and admins)
{
  const marcus = await as('trainer@example.com')
  const aiko = await as('aiko.tanaka@example.com')
  const student = await as('student@example.com')
  const admin = await as('admin@example.com')
  const own = await marcus.get(`/trainer-billing/${marcus.id}`)
  check('trainer reads own invoice details', own.status === 200 && own.data?.hourly_rate === '65.00', `rate ${own.data?.hourly_rate}`)
  const peek = await aiko.get(`/trainer-billing/${marcus.id}`)
  check("trainer cannot read another trainer's details", peek.status === 200 && peek.data === null)
  const studentPeek = await student.get(`/trainer-billing/${marcus.id}`)
  check("student cannot read a trainer's details", studentPeek.status === 200 && studentPeek.data === null)
  const save = await aiko.put(`/trainer-billing/${aiko.id}`, { abn: '98765432109', gst_registered: true })
  check('trainer can save own details', save.status === 200, save.data?.error)
  const rate = await aiko.put(`/trainer-billing/${aiko.id}`, { hourly_rate: 200 })
  check('trainer cannot set own hourly rate', rate.status === 403, rate.data?.error)
  const other = await aiko.put(`/trainer-billing/${marcus.id}`, { phone: '0411 111 111' })
  check("trainer cannot edit another trainer's details", other.status === 403, other.data?.error)
  const badAbn = await aiko.put(`/trainer-billing/${aiko.id}`, { abn: '123' })
  check('invalid ABN is rejected', badAbn.status === 400, badAbn.data?.error)
  const adminRate = await admin.put(`/trainer-billing/${aiko.id}`, { hourly_rate: 70 })
  check('admin can set a hourly rate', adminRate.status === 200 && adminRate.data?.hourly_rate === '70.00', adminRate.data?.error)
  const assessmentRate = await aiko.put(`/trainer-billing/${aiko.id}`, { assessment_rate: 50 })
  check('trainer cannot set own assessment rate', assessmentRate.status === 403, assessmentRate.data?.error)
  await pool.query('delete from public.trainer_billing where trainer_id = $1', [aiko.id])
}

// Marked assessments (paid on invoices, so private to the trainer and admins)
{
  const marcus = await as('trainer@example.com')
  const aiko = await as('aiko.tanaka@example.com')
  const student = await as('student@example.com')
  const admin = await as('admin@example.com')
  const own = await marcus.get('/marked-assessments', ALL_TIME)
  check('trainer reads own marked assessments', own.status === 200 && own.data.length === 2, `saw ${own.data?.length}`)
  const peek = await aiko.get('/marked-assessments', { ...ALL_TIME, trainer_id: marcus.id })
  check("trainer cannot read another trainer's marked assessments", peek.status === 200 && peek.data.length === 0, `saw ${peek.data?.length}`)
  const studentPeek = await student.get('/marked-assessments', ALL_TIME)
  check('student cannot read marked assessments', studentPeek.status === 200 && studentPeek.data.length === 0, `saw ${studentPeek.data?.length}`)
  const entry = { activity: 'Assessment 1', unit_code: 'ICTWEB522', course: 'DIPLOMA IT', quantity: 3 }
  const created = await aiko.post('/marked-assessments', entry)
  check('trainer records own marked assessment', created.status === 201 && created.data?.trainer_id === aiko.id, created.data?.error)
  const forged = await aiko.post('/marked-assessments', { ...entry, trainer_id: marcus.id })
  check('trainer cannot record marking for another trainer', forged.status === 403, forged.data?.error)
  const hijack = await aiko.patch(`/marked-assessments/${own.data[0].id}`, { quantity: 99 })
  check("trainer cannot edit another trainer's entry", hijack.status === 404, `status ${hijack.status}`)
  const badQty = await aiko.post('/marked-assessments', { ...entry, quantity: 0 })
  check('a quantity of 0 is rejected', badQty.status === 400, badQty.data?.error)
  const all = await admin.get('/marked-assessments', ALL_TIME)
  check('admin reads everyone’s marked assessments', all.status === 200 && all.data.length === 3, `saw ${all.data?.length}`)
  if (created.status === 201) {
    const removed = await aiko.del(`/marked-assessments/${created.data.id}`)
    check('trainer deletes own entry', removed.status === 204, `status ${removed.status}`)
  }
}

// Gradebook (the trainer's own student list and results, per class)
{
  const marcus = await as('trainer@example.com') // leads class 1
  const aiko = await as('aiko.tanaka@example.com') // leads class 3, not class 1
  const student = await as('student@example.com')
  const admin = await as('admin@example.com')
  const own = await marcus.get(`/classes/${CLASS(1)}/gradebook`)
  check(
    'trainer reads own class gradebook',
    own.status === 200 && own.data.students.length === 10 && own.data.tasks.length === 5 && own.data.results.length > 0,
    `saw ${own.data?.students?.length} students, ${own.data?.tasks?.length} tasks`,
  )
  const peek = await aiko.get(`/classes/${CLASS(1)}/gradebook`)
  check(
    "trainer cannot read another class's gradebook",
    peek.status === 200 && peek.data.students.length + peek.data.tasks.length + peek.data.results.length === 0,
    `saw ${peek.data?.students?.length} students`,
  )
  const studentPeek = await student.get(`/classes/${CLASS(1)}/gradebook`)
  check('student cannot read the gradebook', studentPeek.status === 200 && studentPeek.data.students.length === 0 && studentPeek.data.results.length === 0)
  const addElsewhere = await aiko.post(`/classes/${CLASS(1)}/students`, { students: [{ full_name: 'Sneaky Add' }] })
  check("trainer cannot add students to another class", addElsewhere.status === 403, addElsewhere.data?.error)
  const added = await marcus.post(`/classes/${CLASS(1)}/students`, { students: [{ full_name: 'Test Student' }, { full_name: own.data.students[0].full_name }] })
  check('trainer adds students, skipping names already listed', added.status === 201 && added.data.added === 1 && added.data.skipped === 1, added.data?.error)
  const task = own.data.tasks[0]
  const target = own.data.students[0]
  const hijack = await aiko.put(`/task-results/${task.id}/${target.id}`, { result: 'NYS' })
  check("trainer cannot change another class's results", hijack.status === 404, `status ${hijack.status}`)
  const aikoClass = (await aiko.get(`/classes/${CLASS(3)}/gradebook`)).data
  const crossClass = await aiko.put(`/task-results/${aikoClass.tasks[0].id}/${target.id}`, { result: 'S' })
  check("a result can't pair a task with another class's student", crossClass.status === 409, crossClass.data?.error)
  const marked = await marcus.put(`/task-results/${task.id}/${target.id}`, { result: 'NYS', attempt: 2, feedback: 'Fix the layout' })
  check('trainer records a result', marked.status === 200 && marked.data.result === 'NYS' && marked.data.attempt === 2, marked.data?.error)
  const badResult = await marcus.put(`/task-results/${task.id}/${target.id}`, { result: 'A+' })
  check('an unknown result is rejected', badResult.status === 400, badResult.data?.error)
  const all = await admin.get(`/classes/${CLASS(1)}/gradebook`)
  check('admin reads any class gradebook', all.status === 200 && all.data.students.length === 11, `saw ${all.data?.students?.length}`)
  await pool.query("delete from public.class_students where full_name = 'Test Student'")
  await pool.query("update public.task_results set result = 'S', attempt = 1, feedback = null where task_id = $1 and student_id = $2", [task.id, target.id])
}

// Course units: staff read, admins write
{
  const admin = await as('admin@example.com')
  const marcus = await as('trainer@example.com')
  const student = await as('student@example.com')
  const seen = await marcus.get('/course-units')
  check('trainer reads every course unit', seen.status === 200 && seen.data.length === 10, `saw ${seen.data?.length}`)
  const studentSeen = await student.get('/course-units')
  check('student cannot read course units', studentSeen.status === 200 && studentSeen.data.length === 0, `saw ${studentSeen.data?.length}`)
  const unit = { course_id: seen.data[0].course_id, term: 'Term 1 2027', code: 'ICTTEST401', start_week: 2, end_week: 4 }
  const byTrainer = await marcus.post('/course-units', unit)
  check('trainer cannot add a unit', byTrainer.status === 403, byTrainer.data?.error)
  const edit = await marcus.patch(`/course-units/${seen.data[0].id}`, { title: 'Hijacked' })
  check('trainer cannot edit a unit', edit.status === 404, `status ${edit.status}`)
  const created = await admin.post('/course-units', unit)
  check('admin adds a unit', created.status === 201, created.data?.error)
  const duplicate = await admin.post('/course-units', unit)
  check('a unit is listed once per course and term', duplicate.status === 409, duplicate.data?.error)
  const backwards = await admin.patch(`/course-units/${created.data.id}`, { start_week: 5, end_week: 3 })
  check("a unit's last week can't be before its first", backwards.status === 400, backwards.data?.error)
  const fromPlans = await admin.post('/course-units/from-plans', { term: 'Term 4 2026' })
  check('filling from content plans skips units already listed', fromPlans.status === 200 && fromPlans.data.added === 0, fromPlans.data?.error)
  const copied = await admin.post('/course-units/copy', { from: 'Term 4 2026', to: 'Term 1 2027' })
  check('admin copies a term into another', copied.status === 200 && copied.data.added === 10, copied.data?.error ?? `added ${copied.data?.added}`)
  const trainerCopy = await marcus.post('/course-units/copy', { from: 'Term 4 2026', to: 'Term 2 2027' })
  check('trainer cannot copy a term', trainerCopy.status === 403, trainerCopy.data?.error)
  await pool.query("delete from public.course_units where term <> 'Term 4 2026'")
}

// Email invites: temporary passwords expire and must be replaced before using the API
{
  const admin = await as('admin@example.com')
  const marcus = await as('trainer@example.com')
  const email = 'invite.test@example.com'
  const byTrainer = await marcus.post('/invites', { email, full_name: 'Invite Test', role: 'trainer' })
  check('trainer cannot send invites', byTrainer.status === 403, byTrainer.data?.error)
  const invited = await admin.post('/invites', { email, full_name: 'Invite Test', role: 'trainer' })
  check('admin invites a new user', invited.status === 201 && invited.data?.created === true, invited.data?.error)
  const pendingList = await admin.get('/invites/pending')
  check('invite shows as pending', pendingList.data?.some((r: any) => r.user_id === invited.data?.profile?.id))
  const trainerPeek = await marcus.get('/invites/pending')
  check('trainer cannot list pending invites', trainerPeek.status === 403, `status ${trainerPeek.status}`)
  const tempByTrainer = await marcus.post(`/profiles/${invited.data?.profile?.id}/temporary-password`)
  check('trainer cannot set temporary passwords', tempByTrainer.status === 403, tempByTrainer.data?.error)
  const temp1 = await admin.post(`/profiles/${invited.data?.profile?.id}/temporary-password`)
  check('admin sets a temporary password', temp1.status === 200 && /^[\w]{4}-[\w]{4}-[\w]{4}$/.test(temp1.data?.password ?? ''), temp1.data?.error)
  const tempLogin = await as(email, temp1.data?.password).then(() => true, () => false)
  check('temporary password signs in', tempLogin)
  const self = await admin.post('/invites', { email: 'admin@example.com' })
  check("admin can't re-invite themselves", self.status === 400, self.data?.error)

  // The emailed password is random, so give the invitee a known temporary one the same way.
  const temp = 'Temp-Pass-1234'
  await withUser(admin.id, (sql) => sql('select * from app.invite_user($1, null, null, $2)', [email, temp]))
  const login = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: temp }),
  })
  const loginBody = (await login.json()) as { mustChangePassword?: boolean }
  check('temporary password signs in and asks for a new one', login.status === 200 && loginBody.mustChangePassword === true)
  const tempClient = client(login.headers.get('set-cookie')!.split(';')[0])
  const blocked = await tempClient.get('/profiles')
  check('API is blocked until the password is changed', blocked.status === 403 && blocked.data?.code === 'PASSWORD_CHANGE_REQUIRED', blocked.data?.error)
  const changeWith = (current: string, next: string) =>
    app.request('/api/auth/change-password', {
      method: 'POST',
      headers: { cookie: login.headers.get('set-cookie')!.split(';')[0], 'content-type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: next }),
    })
  const wrong = await changeWith('not-the-password', 'NewPass-5678')
  check('changing password needs the current one', wrong.status === 400)
  const changed = await changeWith(temp, 'NewPass-5678')
  check('temporary password can be replaced', changed.status === 200)
  const after = await client(changed.headers.get('set-cookie')!.split(';')[0]).get('/profiles')
  check('API works after the password change', after.status === 200, `status ${after.status}`)
  const signIn = await as(email, 'NewPass-5678').then(() => true, () => false)
  check('new password signs in', signIn)

  await withUser(admin.id, (sql) => sql('select * from app.invite_user($1, null, null, $2)', [email, temp]))
  await pool.query(`update app.credentials set expires_at = now() - interval '1 minute' where user_id = $1`, [invited.data.profile.id])
  const expired = await as(email, temp).then(() => true, () => false)
  check('expired temporary password is rejected', !expired)
  await pool.query('delete from public.profiles where id = $1', [invited.data.profile.id])
}

// Admin
{
  const a = await as('admin@example.com')
  const shifts = (await a.get('/shifts', ALL_TIME)).data
  check('admin sees all shifts', shifts.length === 40, `saw ${shifts.length}`)
  const day = shifts.find((x: any) => x.class_id === CLASS(1) && x.status !== 'cancelled')
  const overlap = await a.post('/shifts', { trainer_id: day.trainer_id, class_id: CLASS(4), date: day.date, start_time: '10:00', end_time: '12:00' })
  check('overlapping shift is blocked', overlap.status === 409 && overlap.data.code === '23P01', overlap.data?.error)
  const ok = await a.post('/shifts', { trainer_id: day.trainer_id, class_id: CLASS(4), date: day.date, start_time: day.end_time, end_time: '18:00' })
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
