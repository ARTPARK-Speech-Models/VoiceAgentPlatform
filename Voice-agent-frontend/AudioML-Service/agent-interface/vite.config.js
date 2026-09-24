import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Orchestrator the dev server proxies to. Override with DEV_PROXY_TARGET to
// point local dev at a remote backend.
const proxyTarget = process.env.DEV_PROXY_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxies REST + WebSocket calls to the orchestrator so the browser sees
    // same-origin requests -- avoids cross-site cookie restrictions entirely
    // (SameSite=None+Secure needs HTTPS; SameSite=Lax doesn't work for
    // cross-site fetch/XHR at all, only top-level navigations).
    // url.js's baseURL must be relative ("/") to route through this proxy.
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/orchestrate': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
