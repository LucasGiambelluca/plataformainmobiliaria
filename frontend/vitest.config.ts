import { defineConfig } from 'vitest/config'

// Config aparte de vite.config.ts: los tests actuales cubren módulos TS puros
// (cliente HTTP, store de sesión), no necesitan el plugin de React ni un DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
  },
})
