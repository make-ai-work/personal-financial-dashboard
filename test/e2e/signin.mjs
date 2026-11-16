// Helper for end-to-end tests that are not about signing in: nothing about the user is stored any more, so every page load starts at the
// sign-in page. This clicks "Sign in with Google" (the placeholder, since these tests save no client ID) after each load.
export function autoSignIn(page) {
  page.on('load', async () => {
    try { await page.getByRole('button', { name: /Sign in with Google/ }).click({ timeout: 5000 }) } catch { /* already past it, or a test that handles sign-in itself */ }
  })
}
