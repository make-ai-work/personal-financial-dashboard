// A small "are you a person" check shown before signing in on the real app (not the demo). It is a built-in puzzle with no outside
// service and nothing stored. Be clear about what it is: with no server of its own, this app cannot verify anything remotely, so it
// only stops casual automation clicking the button; it is not strong security. A wrong answer counts against a short lock-out.

const WORDS = ['garden', 'planet', 'silver', 'window', 'pencil', 'orange', 'bridge', 'candle', 'forest', 'basket']
const ORD = ['first', 'second', 'third', 'fourth', 'fifth']
const pick = (rand, n) => Math.floor(rand() * n)

// { kind, question, answer } — the answer is a lower-case string.
export function makeChallenge(rand = Math.random) {
  const kind = ['sum', 'diff', 'largest', 'letter'][pick(rand, 4)]
  if (kind === 'sum') { const a = 2 + pick(rand, 8), b = 2 + pick(rand, 8); return { kind, question: `What is ${a} + ${b}?`, answer: String(a + b) } }
  if (kind === 'diff') { const b = 2 + pick(rand, 7), a = b + 2 + pick(rand, 8); return { kind, question: `What is ${a} − ${b}?`, answer: String(a - b) } }
  if (kind === 'largest') {
    const set = new Set(); while (set.size < 3) set.add(5 + pick(rand, 90))
    const nums = [...set]
    return { kind, question: `Which is the biggest: ${nums.join(', ')}?`, answer: String(Math.max(...nums)) }
  }
  const word = WORDS[pick(rand, WORDS.length)], i = pick(rand, ORD.length)
  return { kind, question: `Type the ${ORD[i]} letter of “${word}”.`, answer: word[i] }
}

export const checkAnswer = (challenge, input) => String(input ?? '').trim().toLowerCase() === challenge.answer

// After maxTries wrong answers the check is locked for lockMs; a new question is then offered.
export function createLimiter({ maxTries = 3, lockMs = 30_000, now = () => Date.now() } = {}) {
  let wrong = 0, until = 0
  return {
    fail() { wrong++; if (wrong >= maxTries) { until = now() + lockMs; wrong = 0 } },
    locked: () => now() < until,
    secondsLeft: () => Math.max(0, Math.ceil((until - now()) / 1000)),
    triesLeft: () => maxTries - wrong,
  }
}
