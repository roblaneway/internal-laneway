// Packages the app in Vercel's Build Output format (.vercel/output): the built
// frontend as static files and the API as one Node serverless function.
// Run after `npm run build`; vercel.json's buildCommand does both.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'

const out = '.vercel/output'
const fn = `${out}/functions/api.func`

await rm(out, { recursive: true, force: true })
await mkdir(fn, { recursive: true })
await cp('dist', `${out}/static`, { recursive: true })

await build({
  entryPoints: ['server/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // pg looks for these optional drivers at runtime; neither is used here.
  external: ['pg-native', 'pg-cloudflare'],
  // Let bundled CommonJS packages (pg) call require() inside an ES module.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
})

const json = (value: unknown) => JSON.stringify(value, null, 2)

await writeFile(`${fn}/.vc-config.json`, json({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  maxDuration: 30,
}))

await writeFile(`${out}/config.json`, json({
  version: 3,
  routes: [
    // Vite fingerprints asset filenames, so they can be cached forever.
    { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '/api(/.*)?', dest: '/api' },
    { handle: 'filesystem' },
    // Client-side routes (e.g. /roster) fall back to the SPA shell.
    { src: '/(.*)', dest: '/index.html' },
  ],
}))

console.log(`Wrote ${out}`)
