// A tiny local web server for the desktop app: it serves the built app (dist/) on http://localhost:<port> so the page has a real
// web address (Google sign-in needs one) and receives Google's sign-in answer. Loopback only, GET/HEAD only, and every request must
// carry a localhost Host header (so a web page on the internet cannot talk to it by pointing a name at 127.0.0.1).
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
}

const CALLBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>Signing in…</title><body style="font-family:system-ui;max-width:32em;margin:4em auto;padding:0 1em">
<h2 id="t">Finishing sign-in…</h2><p id="m"></p>
<script>
(function(){
  var h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  var body = { state: h.get('state') || q.get('state'), access_token: h.get('access_token'), error: h.get('error') || q.get('error') };
  history.replaceState(null, '', location.pathname); // the token must not stay in the address bar
  fetch('/oauth-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      document.getElementById('t').textContent = j.ok ? 'You are signed in' : 'Sign-in did not finish';
      document.getElementById('m').textContent = j.ok ? 'You can close this tab and go back to the app.' : (j.message || 'Go back to the app and try again.');
    })
    .catch(function () { document.getElementById('t').textContent = 'Sign-in did not finish'; document.getElementById('m').textContent = 'Go back to the app and try again.'; });
})();
</script></body>`

// root: folder with the built app. onOAuthResult({state, access_token, error}) -> { ok, message? }.
function createAppServer({ root, onOAuthResult = () => ({ ok: false, message: 'Sign-in is not available.' }) }) {
  const resolvedRoot = path.resolve(root)
  let port = 0
  const hostOk = (host) => host === `localhost:${port}` || host === `127.0.0.1:${port}`
  const server = http.createServer((req, res) => {
    const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...extra }); res.end(req.method === 'HEAD' ? undefined : body) }
    if (!hostOk(req.headers.host || '')) return send(403, 'text/plain', 'Forbidden')
    let pathname
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { return send(400, 'text/plain', 'Bad request') }

    if (pathname === '/oauth-result') {
      if (req.method !== 'POST') return send(405, 'text/plain', 'Method not allowed')
      const origin = req.headers.origin
      if (origin && origin !== `http://localhost:${port}` && origin !== `http://127.0.0.1:${port}`) return send(403, 'text/plain', 'Forbidden')
      let data = ''
      req.on('data', (c) => { data += c; if (data.length > 20_000) req.destroy() })
      req.on('end', () => {
        let j = {}
        try { j = JSON.parse(data) } catch { /* handled below */ }
        const out = onOAuthResult({ state: String(j.state || ''), access_token: j.access_token ? String(j.access_token) : '', error: j.error ? String(j.error) : '' })
        send(200, 'application/json', JSON.stringify(out))
      })
      return undefined
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed')
    if (pathname === '/oauth-callback') return send(200, 'text/html; charset=utf-8', CALLBACK_PAGE)
    if (pathname === '/__finance-dashboard') return send(200, 'application/json', JSON.stringify({ app: 'finance-dashboard' })) // lets a second launch recognise a running copy

    let file = path.join(resolvedRoot, pathname === '/' ? 'index.html' : pathname)
    if (file !== resolvedRoot && !file.startsWith(resolvedRoot + path.sep)) return send(403, 'text/plain', 'Forbidden') // no climbing out of dist
    let stat = null
    try { stat = fs.statSync(file) } catch { /* not found */ }
    if (stat?.isDirectory()) { file = path.join(file, 'index.html'); try { stat = fs.statSync(file) } catch { stat = null } }
    if (!stat) {
      if (path.extname(pathname)) return send(404, 'text/plain', 'Not found')
      file = path.join(resolvedRoot, 'index.html') // the app is one page
    }
    try { return send(200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', fs.readFileSync(file)) } catch { return send(404, 'text/plain', 'Not found') }
  })
  return {
    server,
    listen: (wantedPort) => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(wantedPort, '127.0.0.1', () => { port = server.address().port; resolve({ port, origin: `http://localhost:${port}` }) })
    }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

module.exports = { createAppServer, MIME }
