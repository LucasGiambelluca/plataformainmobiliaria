import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Badge from '../../components/common/Badge'
import { ErrorState, Spinner } from '../../components/common/AsyncState'
import CarouselUploader from '../../components/properties/CarouselUploader'
import { useResource } from '../../hooks/useResource'
import { getOwnSite, setSitePublished, updateOwnSite } from '../../api/sites'
import {
  siteFormSchema,
  type CarouselImage,
  type OwnSite,
  type SiteForm,
} from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

/** Los campos vienen null cuando la inmobiliaria nunca los tocó. */
function defaults(site: OwnSite): SiteForm {
  return {
    heroTitle: site.heroTitle ?? '',
    heroSubtitle: site.heroSubtitle ?? '',
    aboutText: site.aboutText ?? '',
    primaryColor: site.primaryColor ?? '',
    secondaryColor: site.secondaryColor ?? '',
    socialFacebook: site.socialFacebook ?? '',
    socialInstagram: site.socialInstagram ?? '',
    socialWhatsapp: site.socialWhatsapp ?? '',
    showFeaturedOnly: site.showFeaturedOnly,
  }
}

function ColorPreview({ value }: { value?: string }) {
  if (!value || !/^#[0-9a-fA-F]{6}$/.test(value)) return null
  return (
    <div className="mt-2 flex items-center gap-2">
      <span
        className="h-6 w-6 rounded border border-line"
        style={{ backgroundColor: value }}
        aria-hidden
      />
      <span className="text-xs text-muted">{value.toUpperCase()}</span>
    </div>
  )
}

interface PreviewProps {
  tenantName: string
  heroTitle?: string
  heroSubtitle?: string
  aboutText?: string
  primaryColor?: string
  imagen?: string
}

/**
 * Portada del sitio dibujada con los valores que se están editando.
 *
 * No es un iframe del sitio real a propósito: mientras no esté publicado, la
 * web pública responde 404, y aunque estuviera, el iframe mostraría lo último
 * guardado en vez de lo que la persona está escribiendo. Acá el cambio se ve
 * mientras se tipea, que es de lo que sirve una vista previa.
 */
function SitePreview({
  tenantName,
  heroTitle,
  heroSubtitle,
  aboutText,
  primaryColor,
  imagen,
}: PreviewProps) {
  const color = /^#[0-9a-fA-F]{6}$/.test(primaryColor ?? '') ? primaryColor : '#0F3258'

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-line" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-line" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-line" aria-hidden />
      </div>

      <div
        className="relative flex min-h-[9rem] flex-col justify-center bg-cover bg-center px-5 py-7"
        style={{
          backgroundColor: color,
          ...(imagen ? { backgroundImage: `url(${imagen})` } : {}),
        }}
      >
        {/* Sin el velo, un carrusel claro deja el título ilegible. */}
        {imagen && <span className="absolute inset-0 bg-black/45" aria-hidden />}
        <div className="relative">
          <p className="text-lg font-semibold leading-tight text-white">
            {heroTitle?.trim() || tenantName}
          </p>
          {heroSubtitle?.trim() && (
            <p className="mt-1 text-sm text-white/85">{heroSubtitle}</p>
          )}
        </div>
      </div>

      {aboutText?.trim() && (
        <p className="line-clamp-3 bg-surface px-5 py-4 text-center text-xs text-muted">
          {aboutText}
        </p>
      )}
    </div>
  )
}

export default function MiSitio() {
  const recurso = useResource(() => getOwnSite(), [])
  const [site, setSite] = useState<OwnSite | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [publicando, setPublicando] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SiteForm>({ resolver: zodResolver(siteFormSchema) })

  useEffect(() => {
    if (recurso.data) {
      setSite(recurso.data)
      reset(defaults(recurso.data))
    }
  }, [recurso.data, reset])

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    setGuardado(false)
    try {
      const actualizado = await updateOwnSite(values)
      setSite(actualizado)
      reset(defaults(actualizado))
      setGuardado(true)
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  })

  const togglePublicado = async () => {
    if (!site) return
    setFailure(null)
    setPublicando(true)
    try {
      setSite(await setSitePublished(!site.isPublished))
    } catch (err) {
      setFailure(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setPublicando(false)
    }
  }

  const onCarouselChange = (carousel: CarouselImage[]) =>
    setSite((s) => (s ? { ...s, carousel } : s))

  if (recurso.error) return <ErrorState error={recurso.error} onRetry={recurso.reload} />
  if (!site) return <Spinner label="Cargando tu sitio…" />

  const url = `/inmobiliaria/${site.slug}`

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">Mi Sitio Web</h1>
          <p className="text-muted">Así te ve el público, con tu marca.</p>
        </div>

        <div className="flex items-center gap-3">
          <Badge tone={site.isPublished ? 'success' : 'neutral'}>
            {site.isPublished ? 'Publicado' : 'Sin publicar'}
          </Badge>
          <Button
            variant="secondary"
            disabled={publicando}
            onClick={() => void togglePublicado()}
          >
            {publicando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : site.isPublished ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {site.isPublished ? 'Despublicar' : 'Publicar sitio'}
          </Button>
        </div>
      </div>

      {!site.isPublished && (
        <p className="mb-6 rounded-md border border-line bg-canvas px-4 py-3 text-sm text-muted">
          Mientras esté sin publicar, tu sitio responde 404 a cualquier visitante.
          Configuralo tranquilo y publicalo cuando esté listo.
        </p>
      )}

      {failure && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {failure}
        </p>
      )}
      {guardado && (
        <p className="mb-4 rounded-md bg-brand/10 px-3 py-2 text-sm text-brand-dark">
          Cambios guardados.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold tracking-base text-ink">Portada</h2>
            <div className="space-y-4">
              <Input
                label="Título principal"
                placeholder={site.tenantName}
                error={errors.heroTitle?.message}
                {...register('heroTitle')}
              />
              <Input
                label="Subtítulo"
                placeholder="Más de 20 años en Entre Ríos"
                error={errors.heroSubtitle?.message}
                {...register('heroSubtitle')}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  Sobre nosotros
                </span>
                <textarea
                  rows={4}
                  placeholder="Contá quiénes son y qué los diferencia."
                  className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  {...register('aboutText')}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold tracking-base text-ink">Colores</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Principal"
                  placeholder="#0F3258"
                  error={errors.primaryColor?.message}
                  {...register('primaryColor')}
                />
                <ColorPreview value={watch('primaryColor')} />
              </div>
              <div>
                <Input
                  label="Secundario"
                  placeholder="#BAA67A"
                  error={errors.secondaryColor?.message}
                  {...register('secondaryColor')}
                />
                <ColorPreview value={watch('secondaryColor')} />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">
              Si los dejás vacíos, tu sitio usa los colores del portal.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold tracking-base text-ink">Redes</h2>
            <div className="space-y-4">
              <Input
                label="Facebook"
                placeholder="https://facebook.com/tuinmobiliaria"
                error={errors.socialFacebook?.message}
                {...register('socialFacebook')}
              />
              <Input
                label="Instagram"
                placeholder="https://instagram.com/tuinmobiliaria"
                error={errors.socialInstagram?.message}
                {...register('socialInstagram')}
              />
              <Input
                label="WhatsApp"
                placeholder="+54 343 400 0000"
                error={errors.socialWhatsapp?.message}
                {...register('socialWhatsapp')}
              />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand"
                {...register('showFeaturedOnly')}
              />
              <span>
                <span className="block text-sm font-medium text-ink">
                  Mostrar solo destacadas
                </span>
                <span className="block text-xs text-muted">
                  Tu sitio lista únicamente las propiedades que marcaste como
                  destacadas, en vez de toda la cartera.
                </span>
              </span>
            </label>
          </div>

          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar cambios
          </Button>
        </form>

        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold tracking-base text-ink">Carrousel</h2>
            <CarouselUploader carousel={site.carousel} onChange={onCarouselChange} />
          </div>

          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="text-lg font-semibold tracking-base text-ink">Vista previa</h2>
            <p className="mt-1 text-sm text-muted">
              Así queda tu portada. Se actualiza mientras escribís, antes de guardar.
            </p>
            <SitePreview
              tenantName={site.tenantName}
              heroTitle={watch('heroTitle')}
              heroSubtitle={watch('heroSubtitle')}
              aboutText={watch('aboutText')}
              primaryColor={watch('primaryColor')}
              imagen={site.carousel.find((c) => c.isActive)?.imageUrl}
            />
          </div>

          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="text-lg font-semibold tracking-base text-ink">Tu dirección</h2>
            <p className="mt-1 text-sm text-muted">
              {site.isPublished
                ? 'Tu sitio está online. Compartí este enlace.'
                : 'Publicalo para que este enlace funcione.'}
            </p>
            <Link
              to={url}
              target="_blank"
              className="mt-3 inline-flex items-center gap-2 font-medium text-brand hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {url}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
