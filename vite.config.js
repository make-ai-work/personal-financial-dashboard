import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // relative asset paths, so it works at a sub-path such as github.io/<repo>/ and inside an Android wrapper
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1000 }, // exceljs is lazy-loaded and large
})
