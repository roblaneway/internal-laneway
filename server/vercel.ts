import { getRequestListener } from '@hono/node-server'
import { app } from './app.ts'

// Vercel serverless entry, bundled into the api function (see scripts/build-vercel.ts).
// Migrations run at build time, and the notification bell polls instead of streaming.
export default getRequestListener(app.fetch)
