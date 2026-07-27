import axios from 'axios'
import { api, getJson, patchJson, postJson, putJson } from '../lib/api'
import { toApiError } from '../lib/apiError'
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

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export async function listMedia(propertyId: string): Promise<PropertyMedia[]> {
  const { media } = await getJson(
    `/properties/${propertyId}/media`,
    mediaListResponseSchema,
  )
  return media
}

/**
 * Sube un archivo en los tres pasos que exige el backend.
 *
 * El PUT del paso 2 va DIRECTO al storage, no a nuestra API: por eso usa un
 * axios limpio, sin el interceptor de auth ni withCredentials. Mandar el header
 * Authorization a S3 haría fallar la firma, y el archivo nunca toca el backend.
 */
export async function uploadImage(
  propertyId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PropertyMedia> {
  // 1. Firmar
  const { media, upload } = await postJson(
    `/properties/${propertyId}/media/upload-url`,
    signedUploadResponseSchema,
    { contentType: file.type, sizeBytes: file.size },
  )

  // 2. Subir al storage
  try {
    await axios.put(upload.uploadUrl, file, {
      headers: { 'Content-Type': upload.contentType },
      // Sin credenciales: el storage es otro origen y la firma ya autoriza.
      withCredentials: false,
      onUploadProgress: (e) => {
        if (!onProgress) return
        const total = e.total ?? file.size
        onProgress(Math.min(99, Math.round((e.loaded / total) * 100)))
      },
    })
  } catch (err) {
    // La fila queda en `processing`; borrarla evita que ocupe cupo del plan.
    await deleteMedia(propertyId, media.id).catch(() => undefined)
    throw toApiError(err)
  }

  // 3. Confirmar: el backend verifica el objeto real contra lo declarado.
  const confirmed = await postJson(
    `/properties/${propertyId}/media/${media.id}/confirm`,
    mediaResponseSchema,
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
