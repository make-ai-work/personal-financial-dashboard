import test from 'node:test'
import assert from 'node:assert/strict'
import { API_URL, DEFAULT_MODEL, MAX_HISTORY, MAX_TOKENS, SYSTEM_PROMPT, AiError, buildRequest, explainAiError, parseSseBlock, streamReply, trimHistory, validateKey, validateModel } from '../src/lib/aichat.js'

const KEY = 'sk-ant-api03-' + 'x'.repeat(30)
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
const delta = (text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
const body = (str, chunk = 7) => new ReadableStream({ start(c) { const b = new TextEncoder().encode(str); for (let i = 0; i < b.length; i += chunk) c.enqueue(b.slice(i, i + chunk)); c.close() } })
const fakeFetch = (res, log = []) => async (url, init) => { log.push({ url, init }); return res }
const collect = async (gen) => { let s = ''; for await (const t of gen) s += t; return s }

test('a key is checked for shape only; empty means remove', () => {
  assert.deepEqual(validateKey(''), { ok: true, key: '' })
  assert.deepEqual(validateKey('   '), { ok: true, key: '' })
  assert.equal(validateKey('short').ok, false)
  assert.equal(validateKey('sk-ant-has space inside it 1234567').ok, false)
  assert.equal(validateKey(` ${KEY} `).key, KEY)
})

test('the model name is checked; blank means the default', () => {
  assert.equal(validateModel('').model, DEFAULT_MODEL)
  assert.equal(validateModel('claude-sonnet-5-5').model, 'claude-sonnet-5-5')
  assert.equal(validateModel('has space').ok, false)
  assert.equal(validateModel('x'.repeat(101)).ok, false)
})

test('history: last messages only, always starting with the user, empty ones dropped', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }))
  const t = trimHistory(many)
  assert.ok(t.length <= MAX_HISTORY); assert.equal(t[0].role, 'user'); assert.equal(t.at(-1).content, 'm29' === t.at(-1).content ? 'm29' : t.at(-1).content)
  assert.deepEqual(trimHistory([{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'q' }, { role: 'assistant', content: '' }]), [{ role: 'user', content: 'q' }])
})

test('the request goes to Anthropic with the key header, the browser-access header, a system prompt, streaming on, and ONLY the typed messages', () => {
  const { url, init } = buildRequest({ key: KEY, model: DEFAULT_MODEL, messages: [{ role: 'user', content: 'What is an index fund?' }] })
  assert.equal(url, API_URL); assert.equal(init.method, 'POST')
  assert.equal(init.headers['x-api-key'], KEY); assert.equal(init.headers['anthropic-version'], '2023-06-01'); assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true')
  const b = JSON.parse(init.body)
  assert.deepEqual([b.model, b.stream, b.max_tokens, b.system], [DEFAULT_MODEL, true, MAX_TOKENS, SYSTEM_PROMPT])
  assert.deepEqual(b.messages, [{ role: 'user', content: 'What is an index fund?' }])
  assert.ok(!init.body.includes(KEY), 'the key is a header, never in the body')
  assert.match(SYSTEM_PROMPT, /can NOT see any of the user/)
})

test('errors are explained in plain words', () => {
  assert.match(explainAiError(401), /rejected the API key/); assert.match(explainAiError(403), /rejected the API key/)
  assert.match(explainAiError(404, 'claude-nope'), /does not know the model 'claude-nope'/)
  assert.match(explainAiError(429), /rate limit or spending limit/); assert.match(explainAiError(529), /rate limit or spending limit/)
  assert.match(explainAiError(0), /Could not reach the Anthropic API/); assert.match(explainAiError(500), /HTTP 500/)
})

test('an SSE block parses; junk does not', () => {
  assert.deepEqual(parseSseBlock('event: x\ndata: {"a":1}'), { a: 1 })
  assert.equal(parseSseBlock('event: ping'), null); assert.equal(parseSseBlock('data: {oops'), null)
})

test('the answer streams in pieces, even when the network splits events mid-way, and stops at message_stop', async () => {
  const text = sse([{ type: 'message_start' }, delta('Hello'), delta(', wor'), delta('ld'), { type: 'message_stop' }, delta('ignored')])
  const log = []
  const out = await collect(streamReply({ key: KEY, model: DEFAULT_MODEL, messages: [{ role: 'user', content: 'hi' }], fetchImpl: fakeFetch({ ok: true, status: 200, body: body(text) }, log) }))
  assert.equal(out, 'Hello, world'); assert.equal(log.length, 1)
})

test('HTTP errors become AiError with the plain message; a network failure is "could not reach"', async () => {
  await assert.rejects(collect(streamReply({ key: KEY, model: 'm', messages: [], fetchImpl: fakeFetch({ ok: false, status: 401 }) })), (e) => e instanceof AiError && /rejected the API key/.test(e.message) && e.status === 401)
  await assert.rejects(collect(streamReply({ key: KEY, model: 'gone', messages: [], fetchImpl: fakeFetch({ ok: false, status: 404 }) })), /does not know the model 'gone'/)
  await assert.rejects(collect(streamReply({ key: KEY, model: 'm', messages: [], fetchImpl: async () => { throw new TypeError('Failed to fetch') } })), /Could not reach the Anthropic API/)
})

test('an error event in the stream is reported', async () => {
  const text = sse([delta('Par'), { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }])
  await assert.rejects(collect(streamReply({ key: KEY, model: 'm', messages: [], fetchImpl: fakeFetch({ ok: true, status: 200, body: body(text) }) })), /rate limit or spending limit/)
})

test('stopping aborts the request', async () => {
  const ctl = new AbortController()
  let seen
  const f = async (url, init) => { seen = init.signal; return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }
  const p = collect(streamReply({ key: KEY, model: 'm', messages: [], fetchImpl: f, signal: ctl.signal }))
  ctl.abort()
  await assert.rejects(p, (e) => e.name === 'AbortError'); assert.ok(seen.aborted)
})
