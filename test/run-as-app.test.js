import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createServer } from 'node:net'
import { browserArgs, findBrowser, parseArgs, probe, profileDir, run } from '../scripts/run-as-app.mjs'

const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) }) })
const get = (port, p) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: p, headers: { Host: `localhost:${port}` } }, (r) => { let b = ''; r.on('data', (c) => { b += c }); r.on('end', () => resolve({ status: r.statusCode, body: b })) }).on('error', reject))
const dist = () => { const d = mkdtempSync(path.join(tmpdir(), 'raa-')); writeFileSync(path.join(d, 'index.html'), '<h1>app</h1>'); return d }

test('browser: an explicit path wins; otherwise Edge, then Chrome, then Chromium; none found is null', () => {
  const env = { 'ProgramFiles(x86)': 'C:\\PF86', ProgramFiles: 'C:\\PF', LocalAppData: 'C:\\L' }
  const has = (set) => (p) => set.includes(p)
  const edge = path.join('C:\\PF86', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  const chrome = path.join('C:\\PF', 'Google', 'Chrome', 'Application', 'chrome.exe')
  assert.equal(findBrowser({ platform: 'win32', env, exists: has([edge, chrome]) }), edge)
  assert.equal(findBrowser({ platform: 'win32', env, exists: has([chrome]) }), chrome)
  assert.equal(findBrowser({ platform: 'win32', env, exists: has([]) }), null)
  assert.equal(findBrowser({ platform: 'win32', env: { ...env, BROWSER_PATH: 'X:\\mine.exe' }, exists: has(['X:\\mine.exe', edge]) }), 'X:\\mine.exe')
  assert.equal(findBrowser({ platform: 'win32', env: { BROWSER_PATH: 'X:\\gone.exe' }, exists: has([edge]) }), null) // a wrong explicit path is not silently replaced
  assert.equal(findBrowser({ platform: 'linux', env: {}, exists: has(['/usr/bin/chromium']) }), '/usr/bin/chromium')
})

test('window: app mode with its own profile, and the profile lives under the user’s local app data', () => {
  assert.deepEqual(browserArgs({ url: 'http://localhost:4173/', profile: 'C:\\P' }).slice(0, 2), ['--app=http://localhost:4173/', '--user-data-dir=C:\\P'])
  assert.ok(browserArgs({ url: 'u', profile: 'p', extra: ['--x'] }).includes('--x'))
  assert.equal(profileDir({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\U\\AppData\\Local' }, home: 'C:\\U' }), path.join('C:\\U\\AppData\\Local', 'FinanceDashboard', 'profile'))
  assert.match(profileDir({ platform: 'linux', env: {}, home: '/h' }), /FinanceDashboard/)
})

test('arguments: --rebuild and --port', () => {
  assert.deepEqual(parseArgs(['--rebuild', '--port', '5000']), { rebuild: true, port: 5000 })
  assert.equal(parseArgs([]).port, 4173)
})

test('probe: free, ours and busy ports are told apart', async () => {
  const port = await freePort()
  assert.equal(await probe(port), 'free')
  const other = http.createServer((q, r) => r.end('not us')).listen(port, '127.0.0.1')
  await new Promise((r) => other.once('listening', r))
  assert.equal(await probe(port), 'busy'); await new Promise((r) => other.close(r))
  const logs = []
  let seen
  const code = await run({
    root: dist(), port, browser: process.execPath, profile: path.join(tmpdir(), 'raa-profile'), log: (m) => logs.push(m),
    spawnImpl: (cmd, args) => { // a stand-in browser that looks at the page, then closes
      seen = args
      return spawnNode(port)
    },
    quickMs: 0,
  })
  assert.equal(code, 0); assert.equal(await probe(port), 'free', 'the server is stopped when the window closes')
  assert.ok(seen[0].startsWith('--app=http://localhost:')); assert.ok(logs.some((l) => /Serving the app/.test(l)))
})

import { spawn } from 'node:child_process'
const spawnNode = (port) => spawn(process.execPath, ['-e', `
  const http = require('node:http')
  http.get({ host: '127.0.0.1', port: ${port}, path: '/', headers: { Host: 'localhost:${port}' } }, (r) => { let b = ''; r.on('data', (c) => b += c); r.on('end', () => process.exit(b.includes('<h1>app</h1>') ? 0 : 3)) })
`], { stdio: 'ignore' })

test('a second launch reuses the running copy; a busy port and a missing build or browser are explained', async () => {
  const port = await freePort(), root = dist()
  const first = run({ root, port, browser: process.execPath, profile: path.join(tmpdir(), 'raa-p2'), log: () => {}, spawnImpl: () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 700)'], { stdio: 'ignore' }), quickMs: 0 })
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(await probe(port), 'ours')
  const logs = []
  const second = await run({ root, port, browser: process.execPath, profile: path.join(tmpdir(), 'raa-p2'), log: (m) => logs.push(m), spawnImpl: () => spawnNode(port), quickMs: 0 })
  assert.equal(second, 0); assert.ok(logs.some((l) => /already running/.test(l)))
  assert.equal(await probe(port), 'ours', 'the second launch leaves the first one’s server alone')
  await first
  const busy = http.createServer((q, r) => r.end('x')).listen(port, '127.0.0.1'); await new Promise((r) => busy.once('listening', r))
  await assert.rejects(run({ root, port, browser: process.execPath, log: () => {} }), /used by another program/); await new Promise((r) => busy.close(r))
  await assert.rejects(run({ root: path.join(tmpdir(), 'nope-not-built'), port, browser: process.execPath, log: () => {} }), /not been built/)
  await assert.rejects(run({ root, port, browser: null, log: () => {} }), /No Edge, Chrome or Chromium/)
})
