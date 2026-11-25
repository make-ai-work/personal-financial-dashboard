import { useEffect, useRef, useState } from 'react'
import { checkAnswer, createLimiter, makeChallenge } from '../lib/humancheck.js'
import { useAuth } from './AuthContext.jsx'

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

// "Quick check" before the real sign-in button (not in the demo). A built-in puzzle: see lib/humancheck.js for what it is and is not.
function HumanCheck({ onPass }) {
  const limiter = useRef(createLimiter())
  const [challenge, setChallenge] = useState(() => makeChallenge())
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const [, tick] = useState(0)
  const [passed, setPassed] = useState(false)
  useEffect(() => { if (!limiter.current.locked()) return undefined; const id = setInterval(() => { tick((n) => n + 1); if (!limiter.current.locked()) { clearInterval(id); setChallenge(makeChallenge()); setValue('') } }, 500); return () => clearInterval(id) }, [bad])
  if (passed) return <div className="hcheck ok" role="status">✓ Thanks, you are not a robot.</div>
  const locked = limiter.current.locked()
  const submit = (e) => {
    e.preventDefault()
    if (locked) return
    if (checkAnswer(challenge, value)) { setPassed(true); onPass() }
    else { limiter.current.fail(); setBad(true); setValue(''); if (!limiter.current.locked()) setChallenge(makeChallenge()) }
  }
  return (
    <form className="hcheck" onSubmit={submit} aria-label="Quick check">
      <div className="hq"><b>Quick check</b> <span data-testid="check-question">{locked ? 'Too many wrong answers.' : challenge.question}</span></div>
      <div className="hrow">
        <input aria-label="Your answer" value={value} onChange={(e) => { setValue(e.target.value); setBad(false) }} autoComplete="off" maxLength={8} disabled={locked} />
        <button className="btn" disabled={locked || !value.trim()}>Check</button>
      </div>
      {bad && !locked && <p className="err" role="alert">Not quite. Try this one.</p>}
      {locked && <p className="err" role="alert">Wait {limiter.current.secondsLeft()} seconds, then try again.</p>}
    </form>
  )
}

export function SignIn() {
  const { signIn, continueDemo, demoSite, googleReady, busy, checking, error } = useAuth()
  const [human, setHuman] = useState(false)
  // The demo site has no Google and no quick check; everywhere else the real sign-in sits behind the quick check.
  const googleOff = demoSite || !googleReady
  return (
    <div className="panel center narrow">
      <h2>Welcome to WealthBridge</h2>
      <p className="tagline">Simple, completely private, multi-country personal wealth tracker and retirement planner.</p>
      <p className="note">{demoSite
        ? 'This is the demo. Google sign-in is switched off here.'
        : 'Sign in with Google to keep your own data, or carry on in demo mode with sample data.'}</p>
      {!googleOff && <HumanCheck onPass={() => setHuman(true)} />}
      <button className="gbtn" onClick={signIn} disabled={googleOff || busy || !human}
        title={demoSite ? 'Not available in the demo' : !googleReady ? 'Google sign-in is not set up in this copy of the app' : human ? undefined : 'Answer the quick check first'}>
        <GoogleMark /> {checking ? 'Checking your Google session…' : busy ? 'Opening Google…' : 'Sign in with Google'}
      </button>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn wide" onClick={continueDemo} disabled={busy}>Continue without signing in</button>
      <div className="warn">
        {googleOff
          ? <><b>Demo mode.</b> Continue without signing in opens the app as Demo User with made-up sample data. You can change anything; nothing is saved or sent anywhere, and a reload resets it.</>
          : <><b>Only your name and email are read</b>, to show who is signed in. Nothing else is requested and nothing is kept. Without signing in you get demo mode: sample data, nothing saved.</>}
      </div>
    </div>
  )
}
