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
export function autoSignIn(page) {
  page.on('load', async () => { try { await signInClick(page) } catch { /* already past it, or a test that handles sign-in itself */ } })
}
