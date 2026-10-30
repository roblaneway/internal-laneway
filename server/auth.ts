import { Hono, type MiddlewareHandler } from 'hono'
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

async function sessionUserId(token: string | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const payload = await verify(token, secret, 'HS256')
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

const loadProfile = (userId: string) =>
  withUser(userId, async (sql) => (await sql('select * from public.profiles where id = app.user_id()'))[0] ?? null)

/** Rejects requests without a valid session cookie. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const userId = await sessionUserId(getCookie(c, COOKIE))
  if (!userId) throw new HttpError(401, 'Please sign in')
  c.set('userId', userId)
  await next()
}

export const authRoutes = new Hono()

authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>()
  if (!email || !password) throw new HttpError(400, 'Email and password are required')

  const userId = await withUser(null, async (sql) => (await sql('select app.authenticate($1, $2) as id', [email, password]))[0].id)
  if (!userId) throw new HttpError(401, 'Invalid email or password')

  const now = Math.floor(Date.now() / 1000)
  const token = await sign({ sub: userId, iat: now, exp: now + MAX_AGE }, secret, 'HS256')
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: isProduction, path: '/', maxAge: MAX_AGE })
  return c.json({ profile: await loadProfile(userId) })
})

authRoutes.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/** The signed-in profile, or null. Never 401, so the app can call it on startup. */
authRoutes.get('/session', async (c) => {
  const userId = await sessionUserId(getCookie(c, COOKIE))
  const profile = userId ? await loadProfile(userId) : null
  if (userId && !profile) deleteCookie(c, COOKIE, { path: '/' }) // the account was deleted
  return c.json({ profile })
})
