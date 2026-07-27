import axios from 'axios'
import { api, getJson, patchJson, postJson, putJson } from '../lib/api'
import { toApiError } from '../lib/apiError'
import {
  carouselImageResponseSchema,
  carouselListResponseSchema,
  carouselUploadResponseSchema,
  ownSiteResponseSchema,
  publicSiteSchema,
  type CarouselImage,
  type OwnSite,
  type PublicSite,
  type SiteForm,
} from './schemas'

export const ACCEPTED_CAROUSEL_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export const MAX_CAROUSEL_BYTES = 15 * 1024 * 1024
export const MAX_CAROUSEL_IMAGES = 10

/* --------------------------- lectura pública --------------------------- */

export function getPublicSite(slug: string): Promise<PublicSite> {
  return getJson(`/public/sites/${slug}`, publicSiteSchema)
}

/* ------------------------ config de la inmobiliaria ------------------------ */

export async function getOwnSite(): Promise<OwnSite> {
  const { site } = await getJson('/site', ownSiteResponseSchema)
  return site
}

/** Los campos vacíos se mandan como null para poder limpiarlos de verdad. */
export async function updateOwnSite(form: SiteForm): Promise<OwnSite> {
  const texto = (value?: string) => (value && value.trim() ? value.trim() : null)

  const { site } = await patchJson('/site', ownSiteResponseSchema, {
    heroTitle: texto(form.heroTitle),
    heroSubtitle: texto(form.heroSubtitle),
    aboutText: texto(form.aboutText),
    primaryColor: texto(form.primaryColor),
    secondaryColor: texto(form.secondaryColor),
    socialFacebook: texto(form.socialFacebook),
    socialInstagram: texto(form.socialInstagram),
    socialWhatsapp: texto(form.socialWhatsapp),
    ...(form.showFeaturedOnly !== undefined
      ? { showFeaturedOnly: form.showFeaturedOnly }
      : {}),
  })
  return site
}

export async function setSitePublished(isPublished: boolean): Promise<OwnSite> {
  const { site } = await patchJson('/site', ownSiteResponseSchema, { isPublished })
  return site
}

/* ------------------------------- carrousel ------------------------------- */

/**
 * Misma coreografía que la multimedia de propiedades: firmar, PUT directo al
 * storage con un axios limpio (mandar nuestro token a S3 rompe la firma), y
 * confirmar contra el backend.
 */
export async function uploadCarouselImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CarouselImage> {
  const { image, upload } = await postJson(
    '/site/carousel/upload-url',
    carouselUploadResponseSchema,
    { contentType: file.type, sizeBytes: file.size },
  )

  try {
    await axios.put(upload.uploadUrl, file, {
      headers: { 'Content-Type': upload.contentType },
      withCredentials: false,
      onUploadProgress: (e) => {
        if (!onProgress) return
        const total = e.total ?? file.size
        onProgress(Math.min(99, Math.round((e.loaded / total) * 100)))
      },
    })
  } catch (err) {
    // La fila ya ocupa un lugar del carrousel: se limpia.
    await deleteCarouselImage(image.id).catch(() => undefined)
    throw toApiError(err)
  }

  const confirmed = await postJson(
    `/site/carousel/${image.id}/confirm`,
    carouselImageResponseSchema,
  )
  onProgress?.(100)
  return confirmed.image
}

export async function reorderCarousel(ids: string[]): Promise<CarouselImage[]> {
  const { carousel } = await putJson(
    '/site/carousel/order',
    carouselListResponseSchema,
    { ids },
  )
  return carousel
}

export async function deleteCarouselImage(id: string): Promise<void> {
  await api.delete(`/site/carousel/${id}`)
}
