import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.ts'
import { migrate, seedIfEmpty } from './migrate.ts'

// One process serves the API and, in production, the built frontend from dist/.

const port = Number(process.env.PORT ?? 8787)

if (process.env.MIGRATE_ON_START !== 'false') await migrate()
if (process.env.SEED_IF_EMPTY === 'true') await seedIfEmpty()

if (existsSync('dist/index.html')) {
  app.use('/assets/*', async (c, next) => {
    await next()
    // Vite fingerprints asset filenames, so they can be cached forever.
    if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
  })
  app.use('/*', serveStatic({ root: './dist' }))
  // Client-side routes (e.g. /roster) fall back to the SPA shell.
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Laneway portal listening on http://localhost:${info.port}`)
})
