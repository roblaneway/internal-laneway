// Sets a user's password without it appearing in shell history or the database logs
// in plain text: only the bcrypt hash is stored (app.credentials).
// Usage: npm run user:password -- someone@example.com
//   against another database: node --env-file=.env.neon scripts/set-password.ts someone@example.com
// Asks for the password twice with hidden input, or reads one line from stdin when piped.
import { createInterface } from 'node:readline'
import pg from 'pg'
import { directUrl } from '../server/db.ts'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npm run user:password -- <email>')
  process.exit(1)
}

/** Reads one line without echoing it when stdin is a terminal. */
function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
  if (process.stdin.isTTY) {
    process.stdout.write(prompt)
    // Hide the typed characters.
    ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {}
  }
  return new Promise((resolve) => {
    rl.once('line', (line) => {
      rl.close()
      if (process.stdin.isTTY) process.stdout.write('\n')
      resolve(line)
    })
  })
}

const password = await ask('New password: ')
if (process.stdin.isTTY && (await ask('Repeat password: ')) !== password) {
  console.error('Passwords do not match.')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: directUrl })
await client.connect()
try {
  const { rowCount } = await client.query(
    `insert into app.credentials (user_id, password_hash)
     select id, extensions.crypt($2, extensions.gen_salt('bf', 10)) from public.profiles where lower(email) = lower($1)
     on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now()`,
    [email, password],
  )
  if (!rowCount) {
    console.error(`No user with email ${email}.`)
    process.exitCode = 1
  } else {
    console.log(`Password updated for ${email}.`)
  }
} finally {
  await client.end()
}
