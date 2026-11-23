import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) // the one place the version number lives

export default defineConfig({
  base: './', // relative asset paths, so it works at a sub-path such as github.io/<repo>/ and inside an Android wrapper
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { chunkSizeWarningLimit: 1000 }, // exceljs is lazy-loaded and large
})
