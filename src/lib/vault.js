// Encrypted file format ("WVLT1"):
//   magic(5) | iterations(u32 BE) | salt(16) | iv(12) | AES-256-GCM ciphertext+tag
// The header is authenticated as AES-GCM additional data, so tampering with it fails decryption.
// The key comes from PBKDF2-SHA256 over the passphrase; the passphrase itself is never stored.

const MAGIC = [0x57, 0x56, 0x4c, 0x54, 0x31]
const SALT_LEN = 16
const IV_LEN = 12
const HEADER_LEN = MAGIC.length + 4 + SALT_LEN
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

export async function deriveKey(passphrase, salt, iterations = DEFAULT_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function newSession(passphrase, iterations = DEFAULT_ITERATIONS) {
  const salt = newSalt()
  return { salt, iterations, key: await deriveKey(passphrase, salt, iterations) }
}

function buildHeader(iterations, salt) {
  const h = new Uint8Array(HEADER_LEN)
  h.set(MAGIC, 0)
  new DataView(h.buffer).setUint32(MAGIC.length, iterations)
  h.set(salt, MAGIC.length + 4)
  return h
}

export function parseVault(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < HEADER_LEN + IV_LEN + 16 || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new VaultError('NOT_A_VAULT', 'This is not a Finance Dashboard vault file.')
  }
  const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length)
  if (iterations < MIN_ITER || iterations > MAX_ITER) throw new VaultError('NOT_A_VAULT', 'Vault header is damaged.')
  return {
    iterations,
    salt: bytes.slice(MAGIC.length + 4, HEADER_LEN),
    header: bytes.slice(0, HEADER_LEN),
    iv: bytes.slice(HEADER_LEN, HEADER_LEN + IV_LEN),
    ciphertext: bytes.slice(HEADER_LEN + IV_LEN),
  }
}

export async function encryptVault(session, data) {
  const header = buildHeader(session.iterations, session.salt)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, session.key, enc.encode(JSON.stringify(data))),
  )
  const out = new Uint8Array(HEADER_LEN + IV_LEN + ct.length)
  out.set(header, 0)
  out.set(iv, HEADER_LEN)
  out.set(ct, HEADER_LEN + IV_LEN)
  return out
}

export async function decryptVault(bytes, passphrase) {
  const p = parseVault(bytes)
  const key = await deriveKey(passphrase, p.salt, p.iterations)
  let plain
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: p.iv, additionalData: p.header }, key, p.ciphertext)
  } catch {
    throw new VaultError('WRONG_PASSPHRASE', 'Wrong passphrase or damaged file.')
  }
  return { data: JSON.parse(dec.decode(plain)), session: { key, salt: p.salt, iterations: p.iterations } }
}

export function passphraseStrength(p) {
  let s = 0
  if (p.length >= 10) s++
  if (p.length >= 14) s++
  if (p.length >= 18 || (p.match(/\s+/g) || []).length >= 3) s++
  if (/[a-z]/.test(p) && /[A-Z0-9]/.test(p) && /[^a-zA-Z0-9\s]|\d/.test(p)) s++
  return Math.min(s, 4)
}
