// The only things the page may ask the desktop app to do. Everything goes through the main process, which checks it.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  openVault: () => ipcRenderer.invoke('vault:open'),
  saveVaultAs: (suggestedName) => ipcRenderer.invoke('vault:saveAs', String(suggestedName || 'WealthTracker.wvault')),
  readVault: (p) => ipcRenderer.invoke('vault:read', String(p)),
  writeVault: (p, bytes) => ipcRenderer.invoke('vault:write', String(p), bytes),
  lastVault: () => ipcRenderer.invoke('vault:last'),
  rememberVault: (p) => ipcRenderer.invoke('vault:remember', String(p)),
  forgetVault: () => ipcRenderer.invoke('vault:forget'),
  googleToken: (clientId, scope) => ipcRenderer.invoke('google:token', String(clientId), scope ? String(scope) : undefined),
  deleteVault: (p) => ipcRenderer.invoke('vault:delete', String(p)),
  redirectUri: () => ipcRenderer.invoke('app:redirectUri'),
})
