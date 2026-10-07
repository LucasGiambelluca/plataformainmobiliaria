import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Facebook,
  Instagram,
  Mail,
  Phone,
} from 'lucide-react'
import PropertyCard from '../components/properties/PropertyCard'
import Pagination from '../components/common/Pagination'
import { EmptyState, ErrorState } from '../components/common/AsyncState'
import { AgencySiteSkeleton, PropertyGridSkeleton } from '../components/common/Skeleton'
import { WhatsAppIcon } from '../components/common/BrandIcons'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { getCurrentSite, getPublicSite } from '../api/sites'
import { getCatalog } from '../api/publicCatalog'
import { tenantThemeStyle } from '../lib/theme'
import { operationLabels } from '../lib/propertyLabels'
import { portalHref } from '../lib/host'
import { agencyJsonLd } from '../lib/seo'
import type { OperationType } from '../api/schemas'

/**
 * Web propia de una inmobiliaria.
 *
 * Se sirve de dos maneras: por slug (`/inmobiliaria/:slug`, dentro del portal) y
 * por host, cuando la inmobiliaria entra por su subdominio o su dominio propio y
 * la web ocupa la raíz. En ese caso no hay slug en la URL y quién es la
 * inmobiliaria lo resuelve el backend leyendo el `Host`.
 *
 * No usa PublicLayout: es el sitio del tenant, con su marca y sus colores, no
 * el portal. Los colores se inyectan como CSS variables acotadas a este
 * subárbol, así el resto de la app no queda tematizado al navegar.
 */
const PAGE_SIZE = 24

export default function AgencySite() {
  const { slug } = useParams()
  const [slide, setSlide] = useState(0)
  const [filtro, setFiltro] = useState<OperationType | 'all'>('all')
  const [page, setPage] = useState(1)

  const sitio = useResource(
    () => (slug ? getPublicSite(slug) : getCurrentSite()),
    [slug],
  )

  // Por host, el slug lo trae la respuesta: el catálogo igual filtra por slug.
  const agencySlug = slug ?? sitio.data?.tenant.slug

  const propiedades = useResource(
    () =>
      // Por host, hasta que llega el sitio no se sabe de quién es la web. Pedir
      // el catálogo sin `agency` traía el de TODAS las inmobiliarias y se veía
      // un instante en el dominio de un cliente. Se espera: cuando llega el
      // slug cambian las deps y se pide de verdad.
      agencySlug
        ? getCatalog({
            agency: agencySlug,
            operationType: filtro === 'all' ? undefined : filtro,
            onlyFeatured: sitio.data?.site.showFeaturedOnly || undefined,
            page,
            pageSize: PAGE_SIZE,
          })
        : new Promise<never>(() => {}),
    [agencySlug, filtro, sitio.data?.site.showFeaturedOnly, page],
  )

  const irAPagina = (n: number) => {
    setPage(n)
    // Al listado y no al tope: el carrusel ocupa toda la primera pantalla.
    document.getElementById('propiedades')?.scrollIntoView({ behavior: 'smooth' })
  }

  const portal = portalHref()

  useSeo({
    title: sitio.data?.site.heroTitle ?? sitio.data?.tenant.name,
    siteName: sitio.data?.tenant.name,
    description: sitio.data?.site.aboutText ?? sitio.data?.tenant.description,
    // Por host la web vive en la raíz; dentro del portal, bajo su slug.
    canonicalPath: slug ? `/inmobiliaria/${slug}` : '/',
    image: sitio.data?.carousel[0]?.imageUrl ?? sitio.data?.tenant.logoUrl ?? null,
    jsonLd: sitio.data
      ? agencyJsonLd(
          sitio.data,
          window.location.origin + (slug ? `/inmobiliaria/${slug}` : '/'),
        )
      : null,
  })

  const carousel = sitio.data?.carousel ?? []

  // Avance automático del carrousel; se reinicia si cambia la cantidad.
  useEffect(() => {
    if (carousel.length < 2) return
    const id = setInterval(() => setSlide((s) => (s + 1) % carousel.length), 6000)
    return () => clearInterval(id)
  }, [carousel.length])

  if (sitio.error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <ErrorState error={sitio.error} onRetry={sitio.reload} />
        <p className="mt-6 text-muted">
          Puede que esta inmobiliaria todavía no haya publicado su sitio.
        </p>
        <a href={portal} className="mt-2 inline-block text-brand hover:underline">
          Volver al portal
        </a>
      </div>
    )
  }

  if (sitio.loading || !sitio.data) {
    return <AgencySiteSkeleton />
  }

  const { tenant, site } = sitio.data
  const actual = carousel[slide]

  const redes = [
    site.socialFacebook && {
      href: site.socialFacebook,
      label: 'Facebook',
      Icon: Facebook,
    },
    site.socialInstagram && {
      href: site.socialInstagram,
      label: 'Instagram',
      Icon: Instagram,
    },
    site.socialWhatsapp && {
      href: `https://wa.me/${site.socialWhatsapp.replace(/[^0-9]/g, '')}`,
      label: 'WhatsApp',
      Icon: WhatsAppIcon,
    },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof Facebook }[]

  return (
    <div style={tenantThemeStyle(site)} className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt="" className="h-10 w-auto" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded bg-brand text-white">
                <Building2 className="h-5 w-5" />
              </span>
            )}
            <span className="font-serif text-xl font-semibold text-brand">
              {tenant.name}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted">
            {tenant.contactPhone && (
              <a href={`tel:${tenant.contactPhone}`} className="flex items-center gap-1.5 hover:text-brand">
                <Phone className="h-4 w-4" />
                {tenant.contactPhone}
              </a>
            )}
            {tenant.contactEmail && (
              <a href={`mailto:${tenant.contactEmail}`} className="flex items-center gap-1.5 hover:text-brand">
                <Mail className="h-4 w-4" />
                {tenant.contactEmail}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Carrousel */}
      <section className="relative bg-brand">
        {actual ? (
          <>
            <img
              src={actual.imageUrl}
              alt={actual.caption ?? ''}
              className="h-[380px] w-full object-cover md:h-[460px]"
            />
            {/* Dos capas: la inmobiliaria sube la foto que quiere y puede ser
                clarísima o muy cargada. El velo plano sostiene el contraste
                mínimo y el degradado protege la zona del título. */}
            <div className="absolute inset-0 bg-hero-overlay/60" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
          </>
        ) : (
          <div className="h-[300px] w-full bg-hero-overlay" />
        )}

        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-7xl px-4">
            <h1 className="max-w-2xl font-serif text-3xl text-white drop-shadow md:text-5xl">
              {site.heroTitle ?? tenant.name}
            </h1>
            {site.heroSubtitle && (
              <p className="mt-2 max-w-2xl font-serif text-lg text-white/95 drop-shadow md:text-2xl">
                {site.heroSubtitle}
              </p>
            )}
            {actual?.caption && (
              <p className="mt-4 text-sm text-white/70">{actual.caption}</p>
            )}
          </div>
        </div>

        {carousel.length > 1 && (
          <>
            <button
              onClick={() => setSlide((s) => (s - 1 + carousel.length) % carousel.length)}
              aria-label="Imagen anterior"
              className="absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-ink hover:bg-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSlide((s) => (s + 1) % carousel.length)}
              aria-label="Imagen siguiente"
              className="absolute right-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-ink hover:bg-white"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {carousel.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setSlide(i)}
                  aria-label={`Ir a la imagen ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === slide ? 'w-6 bg-white' : 'w-2 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {site.aboutText && (
        <section className="mx-auto max-w-3xl px-4 py-12 text-center">
          <p className="whitespace-pre-line leading-relaxed text-ink">{site.aboutText}</p>
        </section>
      )}

      {/* Propiedades */}
      <section id="propiedades" className="mx-auto max-w-7xl scroll-mt-4 px-4 pb-16">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="border-l-4 border-accent pl-3 font-serif text-2xl text-ink">
            {site.showFeaturedOnly ? 'Propiedades destacadas' : 'Nuestras propiedades'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: 'all' as const, label: 'Todas' },
                { key: 'sale' as const, label: operationLabels.sale },
                { key: 'rent' as const, label: operationLabels.rent },
                { key: 'temporary_rental' as const, label: operationLabels.temporary_rental },
              ]
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFiltro(f.key)
                  setPage(1)
                }}
                className={`rounded-pill px-4 py-1.5 text-sm transition-colors ${
                  filtro === f.key
                    ? 'bg-brand text-white'
                    : 'border border-line bg-surface text-ink hover:border-brand'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {propiedades.error ? (
          <ErrorState error={propiedades.error} onRetry={propiedades.reload} />
        ) : propiedades.loading && !propiedades.data ? (
          <PropertyGridSkeleton
            count={6}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          />
        ) : propiedades.data && propiedades.data.items.length === 0 ? (
          <EmptyState>
            {filtro === 'all'
              ? 'Esta inmobiliaria todavía no tiene propiedades publicadas.'
              : `No hay propiedades en ${operationLabels[filtro].toLowerCase()}.`}
          </EmptyState>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {propiedades.data?.items.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={propiedades.data?.total ?? 0}
          loading={propiedades.loading}
          onChange={irAPagina}
        />
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8">
          <div>
            <p className="font-serif text-lg font-semibold text-brand">{tenant.name}</p>
            {tenant.description && (
              <p className="mt-1 max-w-md text-sm text-muted">{tenant.description}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {redes.map((r) => (
              <a
                key={r.label}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                aria-label={r.label}
                className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white transition-opacity hover:opacity-80"
              >
                <r.Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div className="border-t border-line py-3 text-center text-xs text-muted">
          Publicado en{' '}
          {/* Enlace absoluto y no <Link>: en el dominio propio de la
              inmobiliaria, "/" es su propia home, no la del portal. */}
          <a href={portal} className="text-brand hover:underline">
            Entre Rios Propiedades
          </a>
        </div>
      </footer>
    </div>
  )
}
