import { defineConfig } from 'vitest/config'

// Config aparte de vite.config.ts: los tests actuales cubren módulos TS puros
// (cliente HTTP, store de sesión), no necesitan el plugin de React ni un DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    // `lib/host.ts` lee el dominio del portal al cargarse: tiene que estar
    // definido antes de que el primer test lo importe. Es el mismo valor que el
    // default de PLATFORM_DOMAIN en el backend.
    env: {
      VITE_PLATFORM_DOMAIN: 'plataforma.com',
    },
  },
})
