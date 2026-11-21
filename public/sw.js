// Service worker: lets the installed app start quickly and open without a connection. It only ever touches this app's OWN files:
// requests to other sites (prices, weather, Google) and to your data are never intercepted or cached. Your data lives in the
// encrypted file you chose, not here.
const CACHE = 'finance-dashboard-v1'
const SKIP = /\/(oauth-callback|docs\/|av-snapshot\.json|ticker-snapshot\.json|__finance-dashboard)/

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k) // older versions of this cache
  await self.clients.claim()
})()))

const home = () => new URL('./', self.registration.scope).href

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return // other sites and live files: straight to the network
  if (req.mode === 'navigate') {
    // The page: the network first (so updates arrive), the last copy when offline.
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(home(), copy)) } return res })
      .catch(async () => (await caches.match(home())) || new Response('Offline, and the app has not been opened online yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } })))
    return
  }
  // Built files have a fingerprint in their name, so a cached copy is always the right one; everything else is refreshed in the background.
  const fingerprinted = /\/assets\//.test(url.pathname)
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return res })
    if (hit) { if (!fingerprinted) net.catch(() => {}); return hit }
    return net
  }))
})
