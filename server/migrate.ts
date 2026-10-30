import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { directUrl } from './db.ts'

// Plain-SQL migrations from db/migrations, applied in filename order and
// recorded in app.schema_migrations. Usage:
//   node server/migrate.ts            apply pending migrations
//   node server/migrate.ts seed       load db/seed.sql
//   node server/migrate.ts seed-if-empty  load it only into a database with no users
//   node server/migrate.ts reset      drop everything, migrate, seed

const dbDir = path.resolve(import.meta.dirname, '../db')
const LOCK_ID = 7_302_026 // advisory lock so two app instances don't migrate at once

async function connect() {
  const client = new pg.Client({ connectionString: directUrl })
  await client.connect()
  return client
}

export async function migrate(log = console.log) {
  const client = await connect()
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_ID])
    await client.query(`
      create schema if not exists app;
      create table if not exists app.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`)
    const { rows } = await client.query<{ name: string }>('select name from app.schema_migrations')
    const applied = new Set(rows.map((r) => r.name))
    const files = (await readdir(path.join(dbDir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort()

    for (const file of files.filter((f) => !applied.has(f))) {
      const text = await readFile(path.join(dbDir, 'migrations', file), 'utf8')
      await client.query('begin')
      try {
        await client.query(text)
        await client.query('insert into app.schema_migrations (name) values ($1)', [file])
        await client.query('commit')
        log(`Applied migration ${file}`)
      } catch (err) {
        await client.query('rollback')
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err })
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {})
    await client.end()
  }
}

export async function seed(log = console.log) {
  const client = await connect()
  try {
    await client.query('begin')
    await client.query(await readFile(path.join(dbDir, 'seed.sql'), 'utf8'))
    await client.query('commit')
    log('Loaded demo seed data')
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

/** Seed only when there are no users yet (first deploy). */
export async function seedIfEmpty(log = console.log) {
  const client = await connect()
  try {
    const { rows } = await client.query('select exists (select 1 from public.profiles) as has_users')
    if (rows[0].has_users) return
  } finally {
    await client.end()
  }
  await seed(log)
}

export async function reset(log = console.log) {
  const client = await connect()
  try {
    await client.query(`
      drop schema if exists app cascade;
      drop schema if exists public cascade;
      create schema public;`)
    log('Dropped all tables')
  } finally {
    await client.end()
  }
  await migrate(log)
  await seed(log)
}

if (import.meta.main) {
  const command = process.argv[2] ?? 'migrate'
  const commands: Record<string, () => Promise<void>> = { migrate, seed, 'seed-if-empty': seedIfEmpty, reset }
  if (!commands[command]) {
    console.error(`Unknown command "${command}". Use migrate, seed, seed-if-empty or reset.`)
    process.exit(1)
  }
  commands[command]()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message)
      process.exit(1)
    })
}
