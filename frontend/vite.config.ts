import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * La aplicación puede servirse bajo un subpath ("/m2prop") en vez de en la raíz
 * del host. Vite resuelve los assets con `base`, así que sin esto el index.html
 * pediría /assets/... y el host devolvería 404.
 *
 * Se acepta con o sin barras: se normaliza a una sola forma porque de eso
 * depende `import.meta.env.BASE_URL` y, con él, el `basename` del router y las
 * URL absolutas del SEO.
 */
function normalizarBase(valor: string | undefined): string {
  const limpio = (valor ?? '').trim()
  if (!limpio || limpio === '/') return '/'
  return `/${limpio.replace(/^\/+|\/+$/g, '')}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    base: normalizarBase(env.VITE_BASE_PATH),
    plugins: [react()],
    server: {
      port: 5173,
      allowedHosts: true,
      // Este proxy es el Caddy de desarrollo: hace que la API, las fotos y la SPA
      // salgan por el MISMO origen, igual que deploy/Caddyfile en el VPS. Sin
      // esto, exponer el dev server por un túnel (ngrok) no alcanza — el
      // navegador de quien mira la demo resolvería localhost contra su propia
      // máquina.
      proxy: {
        '/api': 'http://localhost:3000',

        // sitemap.xml y robots.txt los arma el backend con datos reales. En
        // producción los reenvía Caddy; acá los reenvía esto, para poder abrirlos
        // sin levantar todo el stack.
        '/sitemap.xml': 'http://localhost:3000',
        '/robots.txt': 'http://localhost:3000',

        // Multimedia servida por MinIO. `changeOrigin` queda en false a
        // propósito: las URLs de subida van firmadas con SigV4, que incluye el
        // header Host en la firma. Si el proxy lo reescribiera a 127.0.0.1:9000,
        // MinIO calcularía otra firma y todo PUT fallaría con
        // SignatureDoesNotMatch.
        '/inmobiliaria-media': {
          target: 'http://127.0.0.1:9000',
          changeOrigin: false,
        },
      },
    },
  }
})
