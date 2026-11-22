// Helpers for end-to-end tests. Nothing about the user is stored, so every page load starts at the sign-in page; and the real app (not the
// demo) shows a quick built-in check before its sign-in button. `solveCheck` answers it the way a person would, from the question text.
export const answerFor = (q) => {
  let m
  if ((m = q.match(/What is (\d+) \+ (\d+)\?/))) return String(Number(m[1]) + Number(m[2]))
  if ((m = q.match(/What is (\d+) − (\d+)\?/))) return String(Number(m[1]) - Number(m[2]))
  if ((m = q.match(/biggest: ([\d, ]+)\?/))) return String(Math.max(...m[1].split(',').map((n) => Number(n.trim()))))
  if ((m = q.match(/Type the (\w+) letter of “(\w+)”/))) return m[2][['first', 'second', 'third', 'fourth', 'fifth'].indexOf(m[1])]
  throw new Error(`cannot solve: ${q}`)
}
export async function solveCheck(page, timeout = 5000) {
  const q = page.getByTestId('check-question')
  if (!(await q.waitFor({ timeout }).then(() => true).catch(() => false))) return false // the demo has no check, or it is already passed
  await page.getByLabel('Your answer').fill(answerFor(await q.innerText()))
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await page.getByText(/you are not a robot/).waitFor()
  return true
}
export async function signInClick(page) {
  await solveCheck(page)
  await page.getByRole('button', { name: /Sign in with Google/ }).click()
}
// Stand-in for Google's sign-in script and "who is this" call, so every test can sign in as Sam Example without touching Google.
const GSI = "window.__clients=[];window.google={accounts:{oauth2:{initTokenClient:function(c){window.__clients.push(c.client_id);return{requestAccessToken:function(o){if(o&&o.prompt==='none'){c.callback({error:'interaction_required'});return}setTimeout(function(){c.callback({access_token:'T',expires_in:3600})},20)}}}}}}"
export async function stubGoogle(ctx) {
  await ctx.route(/accounts\.google\.com\/gsi\/client/, (r) => r.fulfill({ contentType: 'text/javascript', body: GSI }))
  await ctx.route(/googleapis\.com\/oauth2\/v3\/userinfo/, (r) => r.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { sub: '1', email: 'sam@example.com', name: 'Sam Example', email_verified: true } }))
}
// Every page load starts at the sign-in screen (nothing about the user is stored): sign in with Google each time. { stub: false } when the test routes Google itself.
export function autoSignIn(page, { stub = true } = {}) {
  if (stub) stubGoogle(page.context())
  page.on('load', async () => { try { await signInClick(page) } catch { /* already past it, or a test that handles sign-in itself */ } })
}

// Demo mode (no Google): Continue without signing in, then "Demo mode – nothing will be saved". Every page load starts at sign-in again.
export async function enterDemo(page) {
  await page.getByRole('button', { name: 'Continue without signing in' }).click()
  await page.getByRole('button', { name: /Demo mode – nothing will be saved/ }).click()
  await page.getByRole('status').filter({ hasText: 'DEMO MODE' }).waitFor()
}
export function autoDemo(page) {
  page.on('load', async () => { try { await enterDemo(page) } catch { /* a test that handles sign-in itself */ } })
}
