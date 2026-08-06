import type { PublicPropertyDetail, PublicSite } from '../api/schemas'
import { PROVINCIA } from './localidades'
import { formatPrice, operationLabels, typeLabels } from './propertyLabels'

/**
 * Metadatos de indexación (tarea 4.9).
 *
 * La aplicación es una SPA sin SSR: estas etiquetas las escribe el navegador
 * después de montar la pantalla. Google ejecuta JavaScript antes de indexar, así
 * que las ve. Los previsualizadores de WhatsApp, Facebook y X **no**: leen el
 * HTML crudo, que siempre es el mismo index.html. Arreglar eso pide prerender o
 * SSR, que cambia el deploy; queda anotado como límite conocido.
 */

/** Marca del portal. En la web de una inmobiliaria el sufijo es su nombre. */
export const PORTAL_NAME = 'Entre Rios Propiedades'

const MAX_DESCRIPTION = 155

export interface SeoMeta {
  /** Va antes del sufijo. Sin título, queda solo el sufijo. */
  title?: string
  description?: string | null
  /** Ruta absoluta dentro del sitio ("/propiedad/abc"). El origen lo pone applySeo. */
  canonicalPath?: string
  /** URL absoluta de la imagen de previsualización. */
  image?: string | null
  type?: 'website' | 'article'
  /** Marca la página como no indexable (resultados de búsqueda, pantallas privadas). */
  noIndex?: boolean
  /** Nombre del sitio: el portal, o la inmobiliaria en su web propia. */
  siteName?: string
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null
}

/** "Casa en Paraná — Entre Rios Propiedades", sin repetir el sufijo si ya está. */
export function composeTitle(title: string | undefined, siteName: string): string {
  const limpio = title?.trim()
  if (!limpio) return siteName
  if (limpio === siteName || limpio.endsWith(siteName)) return limpio
  return `${limpio} — ${siteName}`
}

/**
 * Recorta a lo que muestran los buscadores. Corta en el último espacio para no
 * partir una palabra al medio.
 */
export function truncate(text: string | null | undefined, max = MAX_DESCRIPTION): string {
  const limpio = (text ?? '').replace(/\s+/g, ' ').trim()
  if (limpio.length <= max) return limpio

  const cortado = limpio.slice(0, max - 1)
  const ultimoEspacio = cortado.lastIndexOf(' ')
  return `${(ultimoEspacio > max / 2 ? cortado.slice(0, ultimoEspacio) : cortado).trimEnd()}…`
}

export interface MetaTag {
  /** OpenGraph usa `property`; el resto, `name`. */
  attr: 'name' | 'property'
  key: string
  content: string
}

/**
 * Etiquetas que corresponden a estos metadatos. Es una función pura a propósito:
 * es la parte que se puede equivocar y la que se prueba.
 */
export function seoTags(meta: SeoMeta, origin: string): MetaTag[] {
  const siteName = meta.siteName ?? PORTAL_NAME
  const description = truncate(meta.description)
  const canonical = meta.canonicalPath ? origin + meta.canonicalPath : null

  const tags: MetaTag[] = []
  const push = (attr: MetaTag['attr'], key: string, content: string | null) => {
    if (content) tags.push({ attr, key, content })
  }

  push('name', 'description', description)
  // Sin `noindex` no se declara nada: la ausencia ya significa "indexable", y
  // escribir `index,follow` no agrega información.
  push('name', 'robots', meta.noIndex ? 'noindex,follow' : null)

  push('property', 'og:type', meta.type ?? 'website')
  push('property', 'og:site_name', siteName)
  push('property', 'og:title', composeTitle(meta.title, siteName))
  push('property', 'og:description', description)
  push('property', 'og:url', canonical)
  push('property', 'og:image', meta.image ?? null)

  // Sin imagen la tarjeta grande queda vacía: se declara la chica.
  push('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary')
  push('name', 'twitter:title', composeTitle(meta.title, siteName))
  push('name', 'twitter:description', description)
  push('name', 'twitter:image', meta.image ?? null)

  return tags
}

/* ------------------------------ datos estructurados ------------------------------ */

/**
 * Ficha de propiedad como `RealEstateListing`. Es lo que un buscador entiende
 * como un aviso inmobiliario; sin esto solo ve texto suelto.
 */
export function propertyJsonLd(
  property: PublicPropertyDetail,
  url: string,
): Record<string, unknown> {
  const imagenes = property.media.filter((m) => m.type === 'image').map((m) => m.url)

  const json: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.title,
    url,
    datePosted: property.createdAt,
    ...(property.description ? { description: truncate(property.description, 400) } : {}),
    ...(imagenes.length > 0 ? { image: imagenes } : {}),
    offers: {
      '@type': 'Offer',
      price: property.price,
      priceCurrency: property.currency,
      availability: 'https://schema.org/InStock',
      // El tipo de operación no tiene campo propio en schema.org: va como
      // categoría, que es donde los buscadores lo esperan.
      category: operationLabels[property.operationType],
    },
    provider: {
      '@type': 'RealEstateAgent',
      name: property.agency.name,
      ...(property.agency.logoUrl ? { logo: property.agency.logoUrl } : {}),
    },
  }

  const direccion: Record<string, string> = {}
  if (property.address) direccion.streetAddress = property.address
  if (property.city) direccion.addressLocality = property.city
  // La provincia es constante: el catálogo de localidades es solo de Entre Ríos.
  direccion.addressRegion = PROVINCIA
  direccion.addressCountry = property.country ?? 'AR'
  json.address = { '@type': 'PostalAddress', ...direccion }

  if (property.lat && property.lng) {
    json.geo = {
      '@type': 'GeoCoordinates',
      latitude: Number(property.lat),
      longitude: Number(property.lng),
    }
  }

  const caracteristicas: Record<string, unknown> = {}
  if (property.rooms !== null) caracteristicas.numberOfRooms = property.rooms
  if (property.bathrooms !== null) caracteristicas.numberOfBathroomsTotal = property.bathrooms
  if (property.areaM2 !== null) {
    caracteristicas.floorSize = {
      '@type': 'QuantitativeValue',
      value: Number(property.areaM2),
      unitCode: 'MTK',
    }
  }
  if (Object.keys(caracteristicas).length > 0) {
    json.mainEntity = {
      '@type': 'Accommodation',
      name: typeLabels[property.propertyType],
      ...caracteristicas,
    }
  }

  return json
}

/** Web de una inmobiliaria como `RealEstateAgent`. */
export function agencyJsonLd(site: PublicSite, url: string): Record<string, unknown> {
  const redes = [
    site.site.socialFacebook,
    site.site.socialInstagram,
    site.site.socialWhatsapp,
  ].filter((u): u is string => Boolean(u))

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: site.tenant.name,
    url,
    ...(site.tenant.logoUrl ? { logo: site.tenant.logoUrl } : {}),
    ...(site.site.aboutText ? { description: truncate(site.site.aboutText, 400) } : {}),
    ...(site.tenant.contactEmail ? { email: site.tenant.contactEmail } : {}),
    ...(site.tenant.contactPhone ? { telephone: site.tenant.contactPhone } : {}),
    ...(redes.length > 0 ? { sameAs: redes } : {}),
  }
}

/** Descripción autogenerada de una propiedad, para cuando no trae una escrita. */
export function propertySummary(property: PublicPropertyDetail): string {
  const partes = [
    `${typeLabels[property.propertyType]} en ${operationLabels[property.operationType].toLowerCase()}`,
    [property.city, PROVINCIA].filter(Boolean).join(', '),
    property.rooms ? `${property.rooms} ambientes` : '',
    property.areaM2 ? `${Number(property.areaM2)} m²` : '',
    formatPrice(property.price, property.currency),
  ].filter(Boolean)

  return partes.join(' · ')
}

/* --------------------------------- lado del DOM --------------------------------- */

/** Marca las etiquetas que administra este módulo, para poder limpiarlas después. */
const MARCA = 'data-seo'

/**
 * Serializa el JSON-LD escapando `<`.
 *
 * El contenido lo escriben la inmobiliaria y quien publica la propiedad: si una
 * descripción trae la cadena `</script>`, el documento serializado cierra el
 * bloque antes de tiempo y lo que sigue queda como HTML del `<head>`.
 * `<` es JSON válido y los parsers lo leen igual.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/**
 * Vuelca los metadatos en el `<head>`.
 *
 * Borra siempre lo que escribió antes en vez de actualizar en el lugar: al pasar
 * de una propiedad con foto a otra sin foto, un update dejaría el `og:image`
 * viejo pegado a la propiedad nueva.
 */
export function applySeo(meta: SeoMeta, doc: Document = document): void {
  const origin = doc.defaultView?.location.origin ?? ''
  doc.title = composeTitle(meta.title, meta.siteName ?? PORTAL_NAME)

  doc.head.querySelectorAll(`[${MARCA}]`).forEach((el) => el.remove())

  for (const tag of seoTags(meta, origin)) {
    const el = doc.createElement('meta')
    el.setAttribute(tag.attr, tag.key)
    el.setAttribute('content', tag.content)
    el.setAttribute(MARCA, '')
    doc.head.appendChild(el)
  }

  if (meta.canonicalPath) {
    const link = doc.createElement('link')
    link.setAttribute('rel', 'canonical')
    link.setAttribute('href', origin + meta.canonicalPath)
    link.setAttribute(MARCA, '')
    doc.head.appendChild(link)
  }

  if (meta.jsonLd) {
    const script = doc.createElement('script')
    script.setAttribute('type', 'application/ld+json')
    script.setAttribute(MARCA, '')
    script.textContent = serializeJsonLd(meta.jsonLd)
    doc.head.appendChild(script)
  }
}
