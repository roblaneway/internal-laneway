import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { withUser } from './db.ts'
import { HttpError } from './errors.ts'

const COOKIE = 'laneway_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days
const isProduction = process.env.NODE_ENV === 'production'

const secret = process.env.JWT_SECRET ?? (isProduction ? '' : 'dev-only-secret-change-me')
if (!secret) throw new Error('JWT_SECRET must be set in production')

export type AuthEnv = { Variables: { userId: string } }

/** A signed-in session. `mustChangePassword` is set after signing in with a temporary password. */
interface Session {
  userId: string
  mustChangePassword: boolean
}

async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null
  try {
    const payload = await verify(token, secret, 'HS256')
    return typeof payload.sub === 'string' ? { userId: payload.sub, mustChangePassword: payload.pwc === true } : null
  } catch {
    return null
  }
}

async function startSession(c: Context, userId: string, mustChangePassword: boolean) {
  const now = Math.floor(Date.now() / 1000)
  const claims = { sub: userId, iat: now, exp: now + MAX_AGE, ...(mustChangePassword && { pwc: true }) }
  setCookie(c, COOKIE, await sign(claims, secret, 'HS256'), { httpOnly: true, sameSite: 'Lax', secure: isProduction, path: '/', maxAge: MAX_AGE })
}

const loadProfile = (userId: string) =>
  withUser(userId, async (sql) => (await sql('select * from public.profiles where id = app.user_id()'))[0] ?? null)

/**
 * Rejects requests without a valid session cookie, and sessions that still have to
 * replace a temporary password (they can only call /api/auth/change-password).
 */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const session = await readSession(getCookie(c, COOKIE))
  if (!session) throw new HttpError(401, 'Please sign in')
  if (session.mustChangePassword) throw new HttpError(403, 'Choose a new password to continue', 'PASSWORD_CHANGE_REQUIRED')
  c.set('userId', session.userId)
  await next()
}

export const authRoutes = new Hono()

authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>()
  if (!email || !password) throw new HttpError(400, 'Email and password are required')

  const userId = await withUser(null, async (sql) => (await sql('select app.authenticate($1, $2) as id', [email, password]))[0].id)
  if (!userId) throw new HttpError(401, 'Invalid email or password')

  const mustChangePassword = await withUser(
    null,
    async (sql) => (await sql('select app.password_change_required($1) as required', [userId]))[0].required as boolean,
  )
  await startSession(c, userId, mustChangePassword)
  return c.json({ profile: await loadProfile(userId), mustChangePassword })
})

/** Replace the signed-in user's password; also how a temporary password is swapped for a real one. */
authRoutes.post('/change-password', async (c) => {
  const session = await readSession(getCookie(c, COOKIE))
  if (!session) throw new HttpError(401, 'Please sign in')
  type Body = { current_password?: string; new_password?: string }
  const { current_password, new_password } = await c.req.json<Body>().catch((): Body => ({}))
  await withUser(session.userId, (sql) => sql('select app.change_password($1, $2)', [current_password ?? '', new_password ?? '']))
  await startSession(c, session.userId, false)
  return c.json({ profile: await loadProfile(session.userId), mustChangePassword: false })
})

authRoutes.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/** The signed-in profile, or null. Never 401, so the app can call it on startup. */
authRoutes.get('/session', async (c) => {
  const session = await readSession(getCookie(c, COOKIE))
  const profile = session ? await loadProfile(session.userId) : null
  if (session && !profile) deleteCookie(c, COOKIE, { path: '/' }) // the account was deleted
  return c.json({ profile, mustChangePassword: Boolean(profile && session?.mustChangePassword) })
})
