import axios from 'axios'
import { api, getJson, patchJson, postJson, putJson } from '../lib/api'
import { toApiError } from '../lib/apiError'
import { generarMiniatura } from '../lib/thumbnail'
import {
  mediaListResponseSchema,
  mediaResponseSchema,
  signedUploadResponseSchema,
  type PropertyMedia,
} from './schemas'

/** Tipos que acepta el backend, para el atributo accept del input de archivos. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const

export const ACCEPTED_MEDIA_TYPES = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
] as const

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export function esVideo(contentType: string): boolean {
  return (ACCEPTED_VIDEO_TYPES as readonly string[]).includes(contentType)
}

/** Tope que le corresponde al archivo según su tipo. */
export function maxBytesPara(contentType: string): number {
  return esVideo(contentType) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

export async function listMedia(propertyId: string): Promise<PropertyMedia[]> {
  const { media } = await getJson(
    `/properties/${propertyId}/media`,
    mediaListResponseSchema,
  )
  return media
}

/** PUT directo al storage, con un axios limpio. Ver uploadMedia. */
async function subirAlStorage(
  uploadUrl: string,
  contentType: string,
  cuerpo: Blob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await axios.put(uploadUrl, cuerpo, {
    headers: { 'Content-Type': contentType },
    // Sin credenciales: el storage es otro origen y la firma ya autoriza.
    withCredentials: false,
    onUploadProgress: (e) => {
      if (!onProgress) return
      const total = e.total ?? cuerpo.size
      onProgress(Math.min(99, Math.round((e.loaded / total) * 100)))
    },
  })
}

/**
 * Sube una foto o un video de una propiedad.
 *
 * El PUT va DIRECTO al storage, no a nuestra API: por eso usa un axios limpio,
 * sin el interceptor de auth ni withCredentials. Mandar el header Authorization
 * a S3 haría fallar la firma, y el archivo nunca toca el backend.
 *
 * La miniatura la genera este mismo navegador y viaja por su propia URL
 * firmada. Es opcional: si el navegador no puede generarla, la subida sigue.
 */
export async function uploadMedia(
  propertyId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PropertyMedia> {
  // 1. Firmar el archivo
  const { media, upload } = await postJson(
    `/properties/${propertyId}/media/upload-url`,
    signedUploadResponseSchema,
    { contentType: file.type, sizeBytes: file.size },
  )

  // 2. Subirlo
  try {
    await subirAlStorage(upload.uploadUrl, upload.contentType, file, onProgress)
  } catch (err) {
    // La fila queda en `processing`; borrarla evita que ocupe cupo del plan.
    await deleteMedia(propertyId, media.id).catch(() => undefined)
    throw toApiError(err)
  }

  // 3. Miniatura y duración. Todo este bloque es best-effort: cualquier fallo
  // deja el archivo sin miniatura, nunca sin subir.
  let durationSec: number | undefined
  try {
    const miniatura = await generarMiniatura(file)
    if (miniatura) {
      durationSec = miniatura.durationSec
      const { upload: thumbUpload } = await postJson(
        `/properties/${propertyId}/media/${media.id}/thumbnail-url`,
        signedUploadResponseSchema,
        { sizeBytes: miniatura.blob.size },
      )
      await subirAlStorage(thumbUpload.uploadUrl, thumbUpload.contentType, miniatura.blob)
    }
  } catch {
    /* sin miniatura: la propiedad se publica igual */
  }

  // 4. Confirmar: el backend verifica el objeto real contra lo declarado y
  // registra la miniatura si llegó.
  const confirmed = await postJson(
    `/properties/${propertyId}/media/${media.id}/confirm`,
    mediaResponseSchema,
    durationSec ? { durationSec } : {},
  )
  onProgress?.(100)
  return confirmed.media
}


export async function setCover(
  propertyId: string,
  mediaId: string,
): Promise<PropertyMedia> {
  const { media } = await patchJson(
    `/properties/${propertyId}/media/${mediaId}`,
    mediaResponseSchema,
    { isCover: true },
  )
  return media
}

/** Reordena: la posición en el array define el orden final. */
export async function reorderMedia(
  propertyId: string,
  ids: string[],
): Promise<PropertyMedia[]> {
  const { media } = await putJson(
    `/properties/${propertyId}/media/order`,
    mediaListResponseSchema,
    { ids },
  )
  return media
}

export async function deleteMedia(propertyId: string, mediaId: string): Promise<void> {
  await api.delete(`/properties/${propertyId}/media/${mediaId}`)
}
