// The Windows (desktop) app. It serves the built web app from a small local server and shows it in a window.
// Your data stays in the encrypted file you choose; nothing here sends it anywhere.
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')
const path = require('node:path')
const { createAppServer } = require('./server.cjs')
const { createOAuth } = require('./oauth.cjs')
const { createVaultFiles } = require('./files.cjs')

// A fixed port gives the app a fixed address, which is what you authorise in Google Cloud (see the README).
const PORT = Number(process.env.DASHBOARD_PORT) || 53682
// Tests set these so no real dialog or browser is needed.
const TEST_DIR = process.env.DASHBOARD_TEST_DIR || ''

if (!app.requestSingleInstanceLock()) { app.quit() } else {
  let win = null
  let server = null
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })

  app.whenReady().then(async () => {
    const root = path.join(__dirname, '..', 'dist')
    const files = createVaultFiles({ stateFile: path.join(app.getPath('userData'), 'desktop-state.json') })
    let oauth = null
    server = createAppServer({ root, onOAuthResult: (r) => (oauth ? oauth.handleResult(r) : { ok: false, message: 'Not ready.' }) })
    let info
    try { info = await server.listen(PORT) } catch {
      dialog.showErrorBox('Finance Dashboard', `Port ${PORT} is already in use by another program, so the app cannot start. Close the other program and try again.`)
      app.quit(); return
    }
    const origin = info.origin
    oauth = createOAuth({ origin, openExternal: (u) => (TEST_DIR ? Promise.resolve(require('node:fs').writeFileSync(path.join(TEST_DIR, 'oauth-url.txt'), u)) : shell.openExternal(u)) })

    // Only our own page may use these.
    const fromApp = (e) => { const u = e.senderFrame?.url || ''; if (!u.startsWith(origin + '/')) throw new Error('Not allowed.') }
    ipcMain.handle('vault:open', async (e) => {
      fromApp(e)
      let p = TEST_DIR ? path.join(TEST_DIR, 'open.wvault') : null
      if (!p) {
        const r = await dialog.showOpenDialog(win, { title: 'Open your data file', properties: ['openFile'], filters: [{ name: 'Finance Dashboard vault', extensions: ['wvault'] }, { name: 'All files', extensions: ['*'] }] })
        if (r.canceled || !r.filePaths[0]) return null
        p = r.filePaths[0]
      }
      files.allow(p)
      return { path: p, name: files.nameOf(p), bytes: files.read(p) }
    })
    ipcMain.handle('vault:saveAs', async (e, suggestedName) => {
      fromApp(e)
      let p = TEST_DIR ? path.join(TEST_DIR, String(suggestedName)) : null
      if (!p) {
        const r = await dialog.showSaveDialog(win, { title: 'Where should your data file go?', defaultPath: path.join(app.getPath('documents'), String(suggestedName)), filters: [{ name: 'Finance Dashboard vault', extensions: ['wvault'] }] })
        if (r.canceled || !r.filePath) return null
        p = r.filePath
      }
      files.allow(p)
      return { path: p, name: files.nameOf(p) }
    })
    ipcMain.handle('vault:read', (e, p) => { fromApp(e); return files.read(p) })
    ipcMain.handle('vault:write', (e, p, bytes) => { fromApp(e); files.writeAtomic(p, bytes); return true })
    ipcMain.handle('vault:last', (e) => { fromApp(e); return files.last() })
    ipcMain.handle('vault:remember', (e, p) => { fromApp(e); files.remember(p); return true })
    ipcMain.handle('vault:forget', (e) => { fromApp(e); files.forget(); return true })
    ipcMain.handle('app:redirectUri', (e) => { fromApp(e); return oauth.redirectUri })
    ipcMain.handle('google:token', (e, clientId, scope) => { fromApp(e); return oauth.begin(String(clientId), scope ? String(scope) : undefined).promise })
    ipcMain.handle('vault:delete', (e, p) => { fromApp(e); files.remove(p); return true })

    Menu.setApplicationMenu(null)
    win = new BrowserWindow({
      width: 1360, height: 900, minWidth: 380, minHeight: 600, show: !TEST_DIR, autoHideMenuBar: true, title: 'Finance Dashboard',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    // Links to other sites open in the normal browser, never inside the app; the app cannot navigate away from itself.
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
    win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith(origin + '/') && url !== origin) { ev.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url) } })
    await win.loadURL(origin + '/')
  })
  app.on('window-all-closed', () => { server?.close(); app.quit() })
}
