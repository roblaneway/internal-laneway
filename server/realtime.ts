import pg from 'pg'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { databaseUrl } from './db.ts'

// Database triggers pg_notify() on the 'notifications' channel. One LISTEN
// connection fans those events out to each user's open browser tabs over SSE.
// The connection is only held while someone is connected, so a serverless
// database (e.g. Neon) can still scale to zero when the portal is idle.

type Send = (payload: string) => void

const subscribers = new Map<string, Set<Send>>()
let listener: pg.Client | null = null
let connecting: Promise<void> | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined

function deliver(msg: pg.Notification) {
  if (!msg.payload) return
  try {
    const { user_id } = JSON.parse(msg.payload) as { user_id: string }
    for (const send of subscribers.get(user_id) ?? []) send(msg.payload)
  } catch (err) {
    console.error('Bad notification payload', err)
  }
}

function ensureListening() {
  clearTimeout(idleTimer)
  if (listener || connecting) return
  const client = new pg.Client({ connectionString: databaseUrl })
  const drop = () => {
    if (listener !== client) return
    listener = null
    client.end().catch(() => {})
    // Reconnect only if someone is still waiting for events.
    if (subscribers.size) retryTimer = setTimeout(ensureListening, 5000)
  }
  client.on('notification', deliver)
  client.on('error', (err) => {
    console.warn('Realtime listener error:', err.message)
    drop()
  })
  client.on('end', drop)
  connecting = client
    .connect()
    .then(() => client.query('listen notifications'))
    .then(() => {
      listener = client
    })
    .catch((err) => {
      console.warn('Realtime listener could not connect:', err.message)
      client.end().catch(() => {})
      retryTimer = setTimeout(ensureListening, 5000)
    })
    .finally(() => {
      connecting = null
    })
}

function stopWhenIdle() {
  if (subscribers.size) return
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (subscribers.size) return
    clearTimeout(retryTimer)
    const client = listener
    listener = null
    client?.end().catch(() => {})
  }, 60_000)
}

/** GET handler: an SSE stream of the signed-in user's notification events. */
export function notificationStream(c: Context, userId: string) {
  return streamSSE(c, async (stream) => {
    let open = true
    const send: Send = (payload) => {
      stream.writeSSE({ event: 'notification', data: payload }).catch(() => {})
    }
    const mine = subscribers.get(userId) ?? new Set<Send>()
    mine.add(send)
    subscribers.set(userId, mine)
    ensureListening()

    stream.onAbort(() => {
      open = false
      mine.delete(send)
      if (!mine.size) subscribers.delete(userId)
      stopWhenIdle()
    })

    await stream.writeSSE({ event: 'ready', data: '{}' })
    // Heartbeats keep proxies (and free hosting platforms) from closing the stream.
    while (open) {
      await stream.sleep(25_000)
      if (open) await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {})
    }
  })
}
