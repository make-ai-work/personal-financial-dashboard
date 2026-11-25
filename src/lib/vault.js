// Encrypted file format ("WVLT2"; "WVLT1" files still open and are upgraded on the next save):
//   magic(5) | iterations(u32 BE) | salt(16) | wrapIv(12) | wrappedKey(48) | recoveryFlag(1) | [recSalt(16) | recIv(12) | recWrappedKey(48)] | iv(12) | AES-256-GCM ciphertext+tag
// The data is encrypted with a random 256-bit key. That key is stored twice, each copy encrypted ("wrapped"): once under a key from PBKDF2-SHA256 over the
// passphrase, and, if the user made one, once under a key from the RECOVERY KEY. Either one opens the vault; a new passphrase is set by re-wrapping,
// so the recovery key keeps working after a passphrase change. Neither the passphrase nor the recovery key is ever stored.
// The whole header is authenticated as AES-GCM additional data, so tampering with it fails decryption.
// Legacy "WVLT1": magic(5) | iterations(u32) | salt(16) | iv(12) | ciphertext, where the data key is the passphrase key itself.

const MAGIC1 = [0x57, 0x56, 0x4c, 0x54, 0x31]
const MAGIC = [0x57, 0x56, 0x4c, 0x54, 0x32]
const WRAP_LEN = 48 // 32-byte key + 16-byte tag
const REC_LEN = 16 + 12 + WRAP_LEN
const SALT_LEN = 16
const IV_LEN = 12
const HEADER1_LEN = MAGIC1.length + 4 + SALT_LEN
const MIN_ITER = 100_000
const MAX_ITER = 5_000_000
export const DEFAULT_ITERATIONS = 600_000

const enc = new TextEncoder()
const dec = new TextDecoder()

export class VaultError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

export const newSalt = () => crypto.getRandomValues(new Uint8Array(SALT_LEN))

async function pbkdf(secret, salt, iterations, usages) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usages)
}
export const deriveKey = (passphrase, salt, iterations = DEFAULT_ITERATIONS) => pbkdf(passphrase, salt, iterations, ['encrypt', 'decrypt'])

const importDek = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
async function wrap(kek, dekRaw) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  return { iv, ct: new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dekRaw)) }
}
async function unwrap(kek, w) {
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: w.iv }, kek, w.ct)) } catch { return null }
}

// A new vault: a random data key, wrapped under the passphrase. No recovery key until makeRecoveryKey().
export async function newSession(passphrase, iterations = DEFAULT_ITERATIONS) {
  const salt = newSalt()
  const dekRaw = crypto.getRandomValues(new Uint8Array(32))
  return { salt, iterations, dekRaw, key: await importDek(dekRaw), wrap: await wrap(await deriveKey(passphrase, salt, iterations), dekRaw), rec: null }
}

// Set a new passphrase on an open vault. The data key and any recovery key stay as they are.
export async function setPassphrase(session, passphrase) {
  const salt = newSalt()
  return { ...session, salt, wrap: await wrap(await deriveKey(passphrase, salt, session.iterations), session.dekRaw) }
}

// ---- recovery key: 26 letters/digits, shown once as XXXX-XXXX-…, opens the vault if the passphrase is forgotten ----
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1
export const normalizeRecoveryKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '') // case, spaces and dashes do not matter
export const formatRecoveryKey = (raw) => raw.match(/.{1,4}/g).join('-')
function newRecoveryRaw() {
  const b = crypto.getRandomValues(new Uint8Array(26))
  return Array.from(b, (x) => B32[x & 31]).join('') // 26 × 5 bits = 130 bits
}
export async function makeRecoveryKey(session) {
  const raw = newRecoveryRaw()
  const salt = newSalt()
  const w = await wrap(await pbkdf(raw, salt, session.iterations, ['encrypt', 'decrypt']), session.dekRaw)
  return { code: formatRecoveryKey(raw), session: { ...session, rec: { salt, iv: w.iv, ct: w.ct } } }
}
export const removeRecoveryKey = (session) => ({ ...session, rec: null })
export const hasRecoveryKey = (x) => !!(x && x.rec) || (x instanceof Uint8Array && parseVault(x).hasRecovery)

function buildHeader(session) {
  const rec = session.rec
  const h = new Uint8Array(MAGIC.length + 4 + SALT_LEN + IV_LEN + WRAP_LEN + 1 + (rec ? REC_LEN : 0))
  let o = 0
  h.set(MAGIC, o); o += MAGIC.length
  new DataView(h.buffer).setUint32(o, session.iterations); o += 4
  h.set(session.salt, o); o += SALT_LEN
  h.set(session.wrap.iv, o); o += IV_LEN
  h.set(session.wrap.ct, o); o += WRAP_LEN
  h[o++] = rec ? 1 : 0
  if (rec) { h.set(rec.salt, o); o += SALT_LEN; h.set(rec.iv, o); o += IV_LEN; h.set(rec.ct, o) }
  return h
}

export function parseVault(bytes) {
  const bad = (m) => new VaultError('NOT_A_VAULT', m || 'This is not a WealthBridge vault file.')
  if (!(bytes instanceof Uint8Array) || bytes.length < HEADER1_LEN + IV_LEN + 16) throw bad()
  const v1 = MAGIC1.every((b, i) => bytes[i] === b)
  if (!v1 && !MAGIC.every((b, i) => bytes[i] === b)) throw bad()
  const view = new DataView(bytes.buffer, bytes.byteOffset)
  const iterations = view.getUint32(MAGIC.length)
  if (iterations < MIN_ITER || iterations > MAX_ITER) throw bad('Vault header is damaged.')
  const salt = bytes.slice(MAGIC.length + 4, MAGIC.length + 4 + SALT_LEN)
  if (v1) return { version: 1, iterations, salt, header: bytes.slice(0, HEADER1_LEN), iv: bytes.slice(HEADER1_LEN, HEADER1_LEN + IV_LEN), ciphertext: bytes.slice(HEADER1_LEN + IV_LEN), hasRecovery: false }
  let o = MAGIC.length + 4 + SALT_LEN
  if (bytes.length < o + IV_LEN + WRAP_LEN + 1) throw bad('Vault header is damaged.')
  const wrapped = { iv: bytes.slice(o, o + IV_LEN), ct: bytes.slice(o + IV_LEN, o + IV_LEN + WRAP_LEN) }; o += IV_LEN + WRAP_LEN
  const flag = bytes[o++]
  let rec = null
  if (flag === 1) {
    if (bytes.length < o + REC_LEN) throw bad('Vault header is damaged.')
    rec = { salt: bytes.slice(o, o + SALT_LEN), iv: bytes.slice(o + SALT_LEN, o + SALT_LEN + IV_LEN), ct: bytes.slice(o + SALT_LEN + IV_LEN, o + REC_LEN) }; o += REC_LEN
  } else if (flag !== 0) throw bad('Vault header is damaged.')
  if (bytes.length < o + IV_LEN + 16) throw bad('Vault header is damaged.')
  return { version: 2, iterations, salt, wrap: wrapped, rec, hasRecovery: !!rec, header: bytes.slice(0, o), iv: bytes.slice(o, o + IV_LEN), ciphertext: bytes.slice(o + IV_LEN) }
}

export async function encryptVault(session, data) {
  const header = buildHeader(session)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, session.key, enc.encode(JSON.stringify(data))),
  )
  const out = new Uint8Array(header.length + IV_LEN + ct.length)
  out.set(header, 0)
  out.set(iv, header.length)
  out.set(ct, header.length + IV_LEN)
  return out
}

async function open(p, dekRaw, key, extra) {
  let plain
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.iv, additionalData: p.header }, key, p.ciphertext)
  } catch {
    throw new VaultError('WRONG_PASSPHRASE', 'Wrong passphrase or damaged file.')
  }
  return { data: JSON.parse(dec.decode(plain)), session: { dekRaw, key, salt: p.salt, iterations: p.iterations, wrap: p.wrap, rec: p.rec || null, ...extra } }
}

export async function decryptVault(bytes, passphrase) {
  const p = parseVault(bytes)
  const kek = await deriveKey(passphrase, p.salt, p.iterations)
  if (p.version === 1) { // the passphrase key is the data key: open it, then move to a random data key so it can have a recovery key (done on the next save)
    const { data } = await open(p, null, kek)
    return { data, session: await newSessionFrom(passphrase, p.iterations) }
  }
  const dekRaw = await unwrap(kek, p.wrap)
  if (!dekRaw) throw new VaultError('WRONG_PASSPHRASE', 'Wrong passphrase or damaged file.')
  return open(p, dekRaw, await importDek(dekRaw))
}
const newSessionFrom = (passphrase, iterations) => newSession(passphrase, iterations)

// Open with the recovery key instead of the passphrase. The returned session still holds the old passphrase wrap: the caller must set a new passphrase
// (setPassphrase) and save, otherwise the old one stays valid.
export async function decryptVaultWithRecovery(bytes, recoveryKey) {
  const p = parseVault(bytes)
  if (!p.rec) throw new VaultError('NO_RECOVERY', 'This vault has no recovery key.')
  const dekRaw = await unwrap(await pbkdf(normalizeRecoveryKey(recoveryKey), p.rec.salt, p.iterations, ['encrypt', 'decrypt']), p.rec)
  if (!dekRaw) throw new VaultError('WRONG_RECOVERY', 'That recovery key does not match this vault.')
  return open(p, dekRaw, await importDek(dekRaw))
}

export function passphraseStrength(p) {
  let s = 0
  if (p.length >= 10) s++
  if (p.length >= 14) s++
  if (p.length >= 18 || (p.match(/\s+/g) || []).length >= 3) s++
  if (/[a-z]/.test(p) && /[A-Z0-9]/.test(p) && /[^a-zA-Z0-9\s]|\d/.test(p)) s++
  return Math.min(s, 4)
}
