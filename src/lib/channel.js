// Which version of the app this is, and which storage choices it offers. The choices are the SAME on every real version, in the same
// order, with the same wording; only the hint under "Vault file" differs, and anything unavailable says why.
//   Vault file    Android: kept inside the app.  Windows / web: a .wvault file in a place you choose, remembered for next time.
//   Google Drive  The same everywhere. Only the encrypted file is uploaded.
export const channelOf = ({ demo = false, native = false, desktop = false } = {}) => (demo ? 'demo' : native ? 'android' : desktop ? 'windows' : 'web')

// The "Where should your data live?" choices. Signed out, only demo mode works: the other two say so. Signed in, demo mode is greyed out.
export function storageChoices({ channel, signedIn = true, clientReady = false, canRemember = true } = {}) {
  const needSignIn = 'Sign in with Google to use this.'
  const demoChoice = signedIn
    ? { id: 'demo', title: 'Demo mode – nothing will be saved', hint: 'Not available while signed in.', available: false }
    : { id: 'demo', title: 'Demo mode – nothing will be saved', hint: 'Sample data. Change anything you like; it is gone when you reload.', available: true }
  const fileHint = channel === 'android'
    ? 'Kept inside this app, private to it.'
    : canRemember
      ? 'An encrypted .wvault file in a folder you choose. The app remembers it.'
      : 'An encrypted .wvault file. This browser cannot remember its location, so you open it each time and download after changes.'
  const file = signedIn ? { id: 'file', title: 'Vault file', hint: fileHint, available: true } : { id: 'file', title: 'Vault file', hint: needSignIn, available: false }
  let drive
  if (!signedIn) drive = { id: 'drive', title: 'Google Drive', hint: needSignIn, available: false }
  else if (!clientReady) drive = { id: 'drive', title: 'Google Drive', hint: 'Google sign-in is not set up in this copy of the app.', available: false }
  else drive = { id: 'drive', title: 'Google Drive', hint: 'Only the encrypted file goes to your own Drive, so it is on every device you sign in to.', available: true }
  return [file, drive, demoChoice]
}

// What a move leaves behind. `kind` is where the vault was: 'app' | 'device' | 'drive'. -> sentence for the notice, or null.
export function oldCopyNotice(old) {
  if (!old) return null
  const where = old.kind === 'drive' ? 'in your Google Drive' : old.kind === 'app' ? 'inside this app' : 'on this computer'
  return `Your previous copy${old.name ? ` (${old.name})` : ''} is still ${where}. It is no longer used and is not updated. Delete it when you are happy with the new location.`
}

// Can the app delete that old copy itself, or must the user do it?
export const canDeleteOld = (old, { desktop = false } = {}) => !!old && (old.kind === 'drive' || old.kind === 'app' || (old.kind === 'device' && desktop && !!old.path))
