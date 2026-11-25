// Draws the app icon (rising tiles) and writes every size the apps need. Run: node scripts/make-icons.mjs
// Then, for Android: npm run android:sync (or npm run android:assets) so the phone's icon files are regenerated.
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const BG = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14605f"/><stop offset="1" stop-color="#082f33"/></linearGradient></defs>
<rect width="1024" height="1024" fill="url(#g)"/>`
// The artwork: three stepped tiles; `s` scales it around the centre (smaller for the Android adaptive icon's safe zone).
const art = (s = 1) => `<g transform="translate(512 512) scale(${s}) translate(-512 -531) translate(0 19)">
<rect x="262" y="540" width="150" height="222" rx="34" fill="#7be0c3" opacity=".55"/>
<rect x="437" y="440" width="150" height="322" rx="34" fill="#7be0c3" opacity=".8"/>
<rect x="612" y="300" width="150" height="462" rx="34" fill="#fff"/>
<circle cx="687" cy="360" r="22" fill="#0f4c4c"/></g>`
const svg = (inner) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`)
const png = (inner, size, out) => sharp(svg(inner)).resize(size, size).png().toFile(out)

const full = BG + art(1)
await png(full, 1024, 'assets/icon-only.png')
await png(full, 1024, 'build/icon.png')
await png(art(0.9), 1024, 'assets/icon-foreground.png')     // transparent, kept inside the adaptive-icon safe zone
await png(BG, 1024, 'assets/icon-background.png')
await png(full, 192, 'public/icons/icon-192.png')
await png(full, 512, 'public/icons/icon-512.png')
await png(BG + art(0.8), 512, 'public/icons/icon-maskable-512.png')   // maskable: keep the art inside the central 80%

// Windows .ico (16-256 px) written by hand: PNG entries inside an ICO container
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = await Promise.all(sizes.map((s) => sharp(svg(full)).resize(s, s).png().toBuffer()))
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4)
let offset = 6 + 16 * sizes.length
const dir = pngs.map((b, i) => {
  const e = Buffer.alloc(16); const s = sizes[i]
  e[0] = s === 256 ? 0 : s; e[1] = s === 256 ? 0 : s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
  e.writeUInt32LE(b.length, 8); e.writeUInt32LE(offset, 12); offset += b.length; return e
})
writeFileSync('build/icon.ico', Buffer.concat([head, ...dir, ...pngs]))
console.log('icons written')
