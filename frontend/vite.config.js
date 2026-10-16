import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Django dev server. Override with VITE_BACKEND_URL if it runs elsewhere.
const backend = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxying keeps the browser same-origin in development, so no CORS
      // preflight and uploaded images resolve at /media/... as-is.
      '/api': { target: backend, changeOrigin: true },
      '/media': { target: backend, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
})
