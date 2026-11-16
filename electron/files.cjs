// File access for the desktop app. The page never gets a path it chose itself: it can only read or write files the user picked in a
// system dialog (or the file remembered from last time), tracked in an allow-list here.
const fs = require('node:fs')
const path = require('node:path')

function createVaultFiles({ stateFile }) {
  const allowed = new Set()
  const allow = (p) => { const r = path.resolve(p); allowed.add(r); return r }
  const check = (p) => { const r = path.resolve(String(p || '')); if (!allowed.has(r)) throw new Error('That file was not chosen in this app.'); return r }
  const nameOf = (p) => path.basename(p)

  // Write beside the target first, then rename over it, so a crash never leaves a half-written vault.
  function writeAtomic(p, bytes) {
    const r = check(p)
    const tmp = `${r}.tmp`
    fs.writeFileSync(tmp, Buffer.from(bytes))
    fs.renameSync(tmp, r)
  }
  const read = (p) => new Uint8Array(fs.readFileSync(check(p)))

  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return {} } }
  const writeState = (s) => { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(s)) }
  const remember = (p) => { writeState({ ...readState(), vaultPath: check(p) }) }
  const forget = () => { const s = readState(); delete s.vaultPath; writeState(s) }
  // The vault used last time, if it is still there.
  function last() {
    const p = readState().vaultPath
    if (!p || !fs.existsSync(p)) return null
    allow(p)
    return { path: p, name: nameOf(p) }
  }
  return { allow, check, nameOf, writeAtomic, read, remember, forget, last }
}

module.exports = { createVaultFiles }
