// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  agencyJsonLd,
  applySeo,
  composeTitle,
  propertyJsonLd,
  propertySummary,
  seoTags,
  serializeJsonLd,
  truncate,
} from '../../src/lib/seo'
import type { PublicPropertyDetail, PublicSite } from '../../src/api/schemas'

const PROPIEDAD: PublicPropertyDetail = {
  id: 'p1',
  title: 'Casa 4 ambientes con jardín',
  propertyType: 'house',
  operationType: 'sale',
  price: '189500.00',
  currency: 'USD',
  address: 'Los Aromos 450',
  city: 'Oro Verde',
  state: 'Entre Ríos',
  country: 'AR',
  lat: '-31.83000000',
  lng: '-60.53000000',
  rooms: 4,
  bathrooms: 2,
  parking: 1,
  floor: null,
  yearBuilt: 2015,
  areaM2: '185.00',
  featured: true,
  coverUrl: 'https://cdn.test/foto.png',
  description: 'Casa luminosa en barrio tranquilo.',
  viewsCount: 12,
  createdAt: '2026-03-01T10:00:00.000Z',
  features: ['Parrilla'],
  media: [
    { id: 'm1', type: 'image', url: 'https://cdn.test/foto.png', thumbnailUrl: null },
    { id: 'm2', type: 'video', url: 'https://cdn.test/tour.mp4', thumbnailUrl: null },
  ],
  agency: { name: 'Inmobiliaria Demo', slug: 'demo', logoUrl: 'https://cdn.test/logo.png' },
  agencyContact: { email: 'hola@demo.test', phone: '0343 400-0000', description: null },
}

const SITIO: PublicSite = {
  tenant: {
    id: 't1',
    name: 'Inmobiliaria Demo',
    slug: 'demo',
    logoUrl: 'https://cdn.test/logo.png',
    description: 'Más de 20 años en Entre Ríos.',
    contactEmail: 'hola@demo.test',
    contactPhone: '0343 400-0000',
  },
  site: {
    primaryColor: '#0F766E',
    secondaryColor: null,
    heroTitle: 'Tu próxima casa',
    heroSubtitle: null,
    aboutText: 'Acompañamos a las familias de la región.',
    socialFacebook: 'https://facebook.com/demo',
    socialInstagram: null,
    socialWhatsapp: null,
    showFeaturedOnly: false,
    template: 'default',
  },
  carousel: [],
}

describe('composeTitle', () => {
  it('agrega el sufijo del sitio', () => {
    expect(composeTitle('Casa en Paraná', 'Portal')).toBe('Casa en Paraná — Portal')
  })

  it('no repite el sufijo si el título ya lo trae', () => {
    expect(composeTitle('Inmobiliaria Demo', 'Inmobiliaria Demo')).toBe(
      'Inmobiliaria Demo',
    )
  })

  it('sin título queda solo el sufijo', () => {
    expect(composeTitle(undefined, 'Portal')).toBe('Portal')
    expect(composeTitle('   ', 'Portal')).toBe('Portal')
  })
})

describe('truncate', () => {
  it('deja pasar lo que entra', () => {
    expect(truncate('Corto')).toBe('Corto')
  })

  it('corta en un espacio y no a mitad de palabra', () => {
    const largo = `${'palabra '.repeat(30)}final`
    const recortado = truncate(largo)

    expect(recortado.length).toBeLessThanOrEqual(155)
    expect(recortado.endsWith('…')).toBe(true)
    expect(recortado).not.toContain('pala…')
  })

  it('colapsa los saltos de línea', () => {
    expect(truncate('uno\n\n  dos')).toBe('uno dos')
  })
})

describe('seoTags', () => {
  it('arma OpenGraph y Twitter con la URL absoluta', () => {
    const tags = seoTags(
      {
        title: 'Casa',
        description: 'Una casa',
        canonicalPath: '/propiedad/p1',
        image: 'https://cdn.test/foto.png',
      },
      'https://plataforma.com',
    )
    const buscar = (key: string) => tags.find((t) => t.key === key)?.content

    expect(buscar('og:url')).toBe('https://plataforma.com/propiedad/p1')
    expect(buscar('og:image')).toBe('https://cdn.test/foto.png')
    expect(buscar('twitter:card')).toBe('summary_large_image')
    expect(buscar('description')).toBe('Una casa')
  })

  it('sin imagen declara la tarjeta chica y omite og:image', () => {
    const tags = seoTags({ title: 'Casa' }, 'https://plataforma.com')

    expect(tags.find((t) => t.key === 'twitter:card')?.content).toBe('summary')
    expect(tags.find((t) => t.key === 'og:image')).toBeUndefined()
  })

  it('solo escribe robots cuando la página no se indexa', () => {
    expect(
      seoTags({ noIndex: true }, 'https://x.test').find((t) => t.key === 'robots')
        ?.content,
    ).toBe('noindex,follow')
    expect(
      seoTags({}, 'https://x.test').find((t) => t.key === 'robots'),
    ).toBeUndefined()
  })
})

describe('propertyJsonLd', () => {
  const json = propertyJsonLd(PROPIEDAD, 'https://plataforma.com/propiedad/p1')

  it('describe la propiedad como un aviso inmobiliario', () => {
    expect(json['@type']).toBe('RealEstateListing')
    expect(json.url).toBe('https://plataforma.com/propiedad/p1')
    expect(json.offers).toMatchObject({ price: '189500.00', priceCurrency: 'USD' })
    expect(json.address).toMatchObject({
      addressLocality: 'Oro Verde',
      addressCountry: 'AR',
    })
    expect(json.geo).toMatchObject({ latitude: -31.83, longitude: -60.53 })
  })

  it('solo publica las imágenes, no los videos', () => {
    // schema.org espera imágenes en `image`; un mp4 ahí no lo entiende nadie.
    expect(json.image).toEqual(['https://cdn.test/foto.png'])
  })

  it('omite la geolocalización cuando la propiedad no la tiene cargada', () => {
    const sinCoordenadas = propertyJsonLd(
      { ...PROPIEDAD, lat: null, lng: null },
      'https://plataforma.com/propiedad/p1',
    )
    expect(sinCoordenadas.geo).toBeUndefined()
  })

  it('pone la provincia aunque la propiedad no la traiga cargada', () => {
    // Desde que la localidad es un catálogo cerrado de Entre Ríos, el campo
    // provincia dejó de existir en el alta y las propiedades nuevas llegan con
    // `state` en null. El addressRegion sale de la constante, no del dato.
    const sinProvincia = propertyJsonLd(
      { ...PROPIEDAD, state: null },
      'https://plataforma.com/propiedad/p1',
    )

    expect(sinProvincia.address).toMatchObject({ addressRegion: 'Entre Ríos' })
  })
})

describe('agencyJsonLd', () => {
  it('describe la inmobiliaria y lista solo las redes cargadas', () => {
    const json = agencyJsonLd(SITIO, 'https://demo.plataforma.com/')

    expect(json['@type']).toBe('RealEstateAgent')
    expect(json.name).toBe('Inmobiliaria Demo')
    expect(json.sameAs).toEqual(['https://facebook.com/demo'])
    expect(json.telephone).toBe('0343 400-0000')
  })
})

describe('propertySummary', () => {
  it('arma una descripción con lo que la propiedad sí declara', () => {
    expect(propertySummary(PROPIEDAD)).toBe(
      'Casa en venta · Oro Verde, Entre Ríos · 4 ambientes · 185 m² · USD 189.500',
    )
  })

  it('nombra la provincia aunque la propiedad no la traiga cargada', () => {
    expect(propertySummary({ ...PROPIEDAD, state: null })).toContain('Oro Verde, Entre Ríos')
  })
})

describe('serializeJsonLd', () => {
  it('escapa el menor-que para que un texto no cierre el script', () => {
    // La descripción la escribe quien publica la propiedad.
    const salida = serializeJsonLd({ description: '</script><img onerror=x>' })

    expect(salida).not.toContain('</script>')
    expect(JSON.parse(salida).description).toBe('</script><img onerror=x>')
  })
})

describe('applySeo', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.title = ''
  })

  it('escribe título, canonical y JSON-LD', () => {
    applySeo({
      title: 'Casa',
      description: 'Una casa',
      canonicalPath: '/propiedad/p1',
      jsonLd: { '@type': 'RealEstateListing' },
    })

    expect(document.title).toBe('Casa — Entre Rios Propiedades')
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ).toBe(`${window.location.origin}/propiedad/p1`)
    expect(
      document.head.querySelector('script[type="application/ld+json"]')?.textContent,
    ).toContain('RealEstateListing')
  })

  it('no deja etiquetas de la pantalla anterior', () => {
    // El caso que motiva borrar en vez de actualizar: pasar de una propiedad con
    // foto a una sin foto dejaba pegado el og:image viejo.
    applySeo({ title: 'Con foto', image: 'https://cdn.test/foto.png' })
    applySeo({ title: 'Sin foto' })

    expect(document.head.querySelectorAll('meta[property="og:image"]')).toHaveLength(0)
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
  })

  it('no toca las etiquetas que ya venían en el index.html', () => {
    document.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="x">'

    applySeo({ title: 'Casa' })

    expect(document.head.querySelector('meta[charset]')).not.toBeNull()
    expect(document.head.querySelector('meta[name="viewport"]')).not.toBeNull()
  })
})
