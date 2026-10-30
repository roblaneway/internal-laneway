import pg from 'pg'

// Return DATE columns as 'YYYY-MM-DD' strings (Melbourne wall-clock dates), not JS Dates.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

export const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/laneway'

/**
 * Direct (unpooled) connection for session-level work: migrations, advisory locks and LISTEN.
 * Neon sets DATABASE_URL to its transaction-mode pooler and this one to the direct host.
 */
export const directUrl = process.env.DATABASE_URL_UNPOOLED || databaseUrl

export const pool = new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) })

export type Row = Record<string, any>
export type Sql = <T extends Row = Row>(text: string, values?: unknown[]) => Promise<T[]>

/**
 * Run queries as the signed-in user. The transaction switches to the unprivileged
 * `laneway_app` role and sets `app.user_id`, so row-level security decides what
 * the user can read and write. Pass null for a signed-out request.
 */
export async function withUser<T>(userId: string | null, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin; set local role laneway_app')
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? ''])
    const result = await fn(async (text, values) => (await client.query(text, values)).rows)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Keep only the listed columns that are present in the request body. */
export function pick(body: unknown, columns: readonly string[]): Row {
  const source = (body && typeof body === 'object' ? body : {}) as Row
  return Object.fromEntries(columns.filter((c) => c in source).map((c) => [c, source[c]]))
}

// Table and column names below always come from server code, never from the request.

export async function insertRow(sql: Sql, table: string, data: Row): Promise<Row> {
  const cols = Object.keys(data)
  const text = cols.length
    ? `insert into public.${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`
    : `insert into public.${table} default values returning *`
  const [row] = await sql(text, Object.values(data))
  return row
}

/** Update by id. Returns undefined when the row doesn't exist or RLS hides it. */
export async function updateRow(sql: Sql, table: string, id: string, data: Row): Promise<Row | undefined> {
  const cols = Object.keys(data)
  if (!cols.length) return (await sql(`select * from public.${table} where id = $1`, [id]))[0]
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
  const [row] = await sql(`update public.${table} set ${sets} where id = $1 returning *`, [id, ...Object.values(data)])
  return row
}

export async function deleteRow(sql: Sql, table: string, id: string): Promise<boolean> {
  return (await sql(`delete from public.${table} where id = $1 returning id`, [id])).length > 0
}
