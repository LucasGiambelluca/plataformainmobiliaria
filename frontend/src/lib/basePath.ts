/**
 * Dónde vive la aplicación dentro de su host.
 *
 * El caso normal es la raíz del dominio y `BASE_PATH` queda vacío: nada cambia.
 * El caso que justifica el módulo es otro despliegue, donde la app se sirve
 * bajo un subpath (`hernandezyasociados.com.ar/m2props`) porque el host ya
 * tiene otro sitio en la raíz. Ahí hay tres cosas que se rompen si nadie las
 * ajusta, y las tres leen de acá:
 *
 *   - los assets, que los resuelve Vite con `base` y ya llegan bien;
 *   - las rutas del router, que necesitan ese subpath como `basename`;
 *   - las URL absolutas del SEO (canonical y og:url), que si lo omiten
 *     declaran como canónica una ruta que en el host no existe.
 *
 * `import.meta.env.BASE_URL` lo fija Vite desde `base` y lo congela en el
 * bundle: cambiar el subpath de un despliegue a otro es rebuild, no un reinicio.
 */

/** Con barra final, como lo emite Vite: es la forma que quieren los assets. */
export const BASE_URL = import.meta.env.BASE_URL || '/'

/**
 * Sin barra final, que es la forma que quiere el `basename` del router. Vacío en
 * la raíz, para no pasarle un "/" que React Router tomaría como prefijo real.
 */
export const BASE_PATH = BASE_URL === '/' ? '' : BASE_URL.replace(/\/+$/, '')

/**
 * Une una ruta interna con el subpath. Las que ya son absolutas (una URL de
 * foto, por ejemplo) se devuelven sin tocar.
 */
export function conBase(ruta: string): string {
  if (!ruta.startsWith('/') || /^https?:\/\//.test(ruta)) return ruta
  return `${BASE_PATH}${ruta}`
}
