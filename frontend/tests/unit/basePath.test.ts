import { describe, expect, it } from 'vitest'
import { BASE_PATH, BASE_URL, conBase } from '../../src/lib/basePath'

/**
 * El subpath de la app.
 *
 * Estas funciones son la diferencia entre que la web funcione y que no, y
 * ninguna falla ruidosamente cuando están mal: un `base` equivocado produce un
 * bundle válido que pide los assets a un path inexistente, y una imagen
 * hardcodeada con ruta absoluta sale 404 sin romper nada. Por eso valen tests.
 *
 * Ojo con el caso de abajo: el de la URL de la API no lo cubre esta suite, y es
 * el que rompió producción una vez. `//m2props/api` (una barra de más al armar
 * el path) es una URL protocol-relative, así que el browser la resuelve contra
 * otro host y la petición nunca sale de la máquina. El guard de
 * deploy/m2props/update.sh chequea el bundle por eso.
 */

describe('BASE_PATH', () => {
  it('es vacío en la raíz del host, que es el despliegue por defecto', () => {
    // En los tests BASE_URL es '/', que es lo que Vite define sin `base`.
    expect(BASE_URL).toBe('/')
    expect(BASE_PATH).toBe('')
  })
})

describe('conBase', () => {
  it('devuelve la ruta tal cual cuando no hay subpath', () => {
    expect(conBase('/brand/logo-navy.png')).toBe('/brand/logo-navy.png')
  })

  it('no toca lo que ya es una URL absoluta', () => {
    // Las fotos vienen como URL completa desde la API:.prefixearlas rompería
    // la URL en vez de arreglarla.
    const remota = 'https://hernandezyasociados.com.ar/inmobiliaria-media/x.png'
    expect(conBase(remota)).toBe(remota)

    const conProtocolo = 'http://localhost:3000/api/x'
    expect(conBase(conProtocolo)).toBe(conProtocolo)
  })

  it('no rompe las rutas relativas', () => {
    expect(conBase('brand/logo.png')).toBe('brand/logo.png')
    expect(conBase('')).toBe('')
  })
})
