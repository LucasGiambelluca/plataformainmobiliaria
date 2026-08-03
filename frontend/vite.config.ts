import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    // sitemap.xml y robots.txt los arma el backend con datos reales. En
    // producción los reenvía Caddy (deploy/Caddyfile); en desarrollo los reenvía
    // esto, para poder abrirlos sin levantar todo el stack.
    proxy: {
      '/sitemap.xml': 'http://localhost:3000',
      '/robots.txt': 'http://localhost:3000',
    },
  },
})
