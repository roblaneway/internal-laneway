import { Hono } from 'hono'
import { authRoutes, requireUser, type AuthEnv } from './auth.ts'
import { onError } from './errors.ts'
import { api } from './routes.ts'

/** The JSON API, mounted at /api. Kept separate from the HTTP server so tests can call it directly. */
export const app = new Hono<AuthEnv>()

app.onError(onError)
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', authRoutes)
app.use('/api/*', requireUser)
app.route('/api', api)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))
