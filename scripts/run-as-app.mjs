// "Run as an app" for the local version on Windows (also works on Mac and Linux): serves the built app on http://localhost:<port> and
// opens it in its own window (Edge or Chrome in app mode: no tabs, no address bar). Closing that window stops the server. No .exe,
// so nothing for Smart App Control to block. Usage:  node scripts/run-as-app.mjs   (or double-click "Run as app.cmd")
//   --rebuild  build the app again first     --port 5000  another port (the address matters for Google sign-in)
//   BROWSER_PATH=...  use a specific Edge/Chrome/Chromium     BROWSER_ARGS="--flag --flag"  extra browser options
import { createRequire } from 'node:module'
import { spawn, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const require = createRequire(import.meta.url)
const { createAppServer } = require('../electron/server.cjs')
const here = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PORT = 4173 // the same address as `npm start`, so a Google client set up for one works for the other

// The first browser that exists: an explicit BROWSER_PATH, then Edge (always on Windows 10/11), then Chrome, then Chromium.
export function findBrowser({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  if (env.BROWSER_PATH) return exists(env.BROWSER_PATH) ? env.BROWSER_PATH : null
  const win = ['ProgramFiles(x86)', 'ProgramFiles', 'LocalAppData'].flatMap((k) => (env[k] ? [
    join(env[k], 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(env[k], 'Google', 'Chrome', 'Application', 'chrome.exe'), join(env[k], 'Chromium', 'Application', 'chrome.exe'),
  ] : []))
  const mac = ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  const linux = ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  const list = platform === 'win32' ? win : platform === 'darwin' ? mac : linux
  return list.find((p) => exists(p)) || null
}

// Its own browser profile: the app keeps its own settings and remembered data file, and closing the window ends the process.
export function profileDir({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  // the folder keeps its old name on purpose: renaming it would hide the settings and remembered file of anyone who already runs the app
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'FinanceDashboard', 'profile')
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'FinanceDashboard', 'profile')
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'FinanceDashboard', 'profile')
}

export const browserArgs = ({ url, profile, extra = [] }) => [`--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1360,900', ...extra]

// 'ours' (a copy of this app is already serving it), 'busy' (something else is) or 'free'.
export function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/__finance-dashboard', headers: { Host: `localhost:${port}`, Connection: 'close' }, agent: false, timeout: 1500 }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body).app === 'finance-dashboard' ? 'ours' : 'busy') } catch { resolve('busy') } })
    })
    req.on('error', (e) => resolve(e.code === 'ECONNREFUSED' ? 'free' : 'busy'))
    req.on('timeout', () => { req.destroy(); resolve('busy') })
  })
}

// Start (or reuse) the server, open the window, wait for it to close, stop the server. Everything outside is injectable for tests.
export async function run({ root = join(here, '..', 'dist'), port = DEFAULT_PORT, browser = findBrowser(), profile = profileDir(), extraArgs = (process.env.BROWSER_ARGS || '').split(/\s+/).filter(Boolean), spawnImpl = spawn, log = console.log, quickMs = 3000 } = {}) {
  if (!existsSync(join(root, 'index.html'))) throw new Error('The app has not been built yet. Run:  npm run build')
  if (!browser) throw new Error('No Edge, Chrome or Chromium was found. Install Microsoft Edge or Google Chrome, or set BROWSER_PATH to the program.')
  const state = await probe(port)
  if (state === 'busy') throw new Error(`Port ${port} is used by another program. Close it, or choose another port:  node scripts/run-as-app.mjs --port 5000`)
  let app = null
  if (state === 'free') app = createAppServer({ root })
  if (app) await app.listen(port)
  const url = `http://localhost:${port}/`
  mkdirSync(profile, { recursive: true })
  log(state === 'ours' ? `The app is already running at ${url}: opening a window.` : `Serving the app at ${url}`)
  log('Close the app window to stop it.')
  const started = Date.now()
  const child = spawnImpl(browser, browserArgs({ url, profile, extra: extraArgs }), { stdio: 'ignore' })
  const code = await new Promise((resolve) => { child.on('error', (e) => { log(`Could not start the browser: ${e.message}`); resolve(1) }); child.on('exit', (c) => resolve(c ?? 0)) })
  // A browser that exits at once has usually handed the window to a copy that is already open; keep serving until Ctrl+C then.
  if (app && Date.now() - started < quickMs && code === 0) {
    log('The window opened in a browser that was already running. Press Ctrl+C here when you are done.')
    await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve) })
  }
  if (app) await app.close()
  return code
}

export function parseArgs(argv) {
  const out = { rebuild: false, port: Number(process.env.PORT) || DEFAULT_PORT }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rebuild') out.rebuild = true
    else if (argv[i] === '--port') out.port = Number(argv[++i]) || out.port
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const opts = parseArgs(process.argv.slice(2))
  try {
    const root = join(here, '..', 'dist')
    if (opts.rebuild || !existsSync(join(root, 'index.html'))) {
      console.log('Building the app (a minute the first time)…')
      execSync('npm run build', { cwd: join(here, '..'), stdio: 'inherit' })
    }
    process.exitCode = await run({ port: opts.port })
  } catch (e) {
    console.error(`\n${e.message}`)
    process.exitCode = 1
  }
}
