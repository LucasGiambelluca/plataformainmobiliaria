import { useEffect } from 'react'
import { applySeo, PORTAL_NAME, type SeoMeta } from '../lib/seo'

/**
 * Escribe el `<title>` y las meta etiquetas de la pantalla montada (tarea 4.9).
 *
 * Se llama en cada render con los datos que haya: mientras la propiedad carga,
 * el título es genérico, y se completa al llegar la respuesta. Es a propósito —
 * esperar a tener datos dejaría el título del portal en la ficha si el pedido
 * falla.
 *
 * El objeto `meta` se serializa para comparar: pasarle un literal nuevo en cada
 * render no vuelve a tocar el DOM.
 */
export function useSeo(meta: SeoMeta): void {
  const firma = JSON.stringify(meta)

  useEffect(() => {
    applySeo(JSON.parse(firma) as SeoMeta)

    return () => {
      // Al desmontar se limpia todo: si no, la ficha de una propiedad le
      // dejaría su og:image y su JSON-LD a la pantalla siguiente.
      applySeo({ siteName: PORTAL_NAME })
    }
  }, [firma])
}
