import { describe, expect, it } from 'vitest'
import { isTenantHost, portalHref } from '../../src/lib/host'

// VITE_PLATFORM_DOMAIN lo fija vitest.config.ts en "plataforma.com", el mismo
// default que usa el backend.

describe('isTenantHost', () => {
  it('el dominio del portal y su www no son de una inmobiliaria', () => {
    expect(isTenantHost('plataforma.com')).toBe(false)
    expect(isTenantHost('www.plataforma.com')).toBe(false)
  })

  it('un subdominio de la plataforma sí lo es', () => {
    expect(isTenantHost('demo.plataforma.com')).toBe(true)
  })

  it('los subdominios reservados no son inmobiliarias', () => {
    // Sin esta lista, entrar a cdn.plataforma.com pediría el sitio del tenant
    // "cdn", que el backend nunca va a resolver.
    for (const label of ['www', 'api', 'admin', 'app', 'cdn', 'static', 'mail']) {
      expect(isTenantHost(`${label}.plataforma.com`)).toBe(false)
    }
  })

  it('solo un nivel de subdominio', () => {
    expect(isTenantHost('a.b.plataforma.com')).toBe(false)
  })

  it('un dominio propio es de una inmobiliaria', () => {
    // Llegó hasta acá porque Caddy le emitió certificado, y eso solo pasa si el
    // backend autorizó el host.
    expect(isTenantHost('inmobiliarianorte.com.ar')).toBe(true)
    expect(isTenantHost('www.inmobiliarianorte.com.ar')).toBe(true)
  })

  it('los hosts de desarrollo son siempre el portal', () => {
    expect(isTenantHost('localhost')).toBe(false)
    expect(isTenantHost('127.0.0.1')).toBe(false)
    expect(isTenantHost('mi-app.localhost')).toBe(false)
  })

  it('no distingue mayúsculas', () => {
    expect(isTenantHost('Demo.Plataforma.COM')).toBe(true)
    expect(isTenantHost('PLATAFORMA.COM')).toBe(false)
  })
})

describe('portalHref', () => {
  it('dentro del portal alcanza con la raíz', () => {
    expect(portalHref('plataforma.com')).toBe('/')
  })

  it('en la web de una inmobiliaria el enlace es absoluto', () => {
    // "/" ahí es la home de la inmobiliaria, no la del portal.
    expect(portalHref('inmobiliarianorte.com.ar')).toBe('https://plataforma.com')
  })
})
