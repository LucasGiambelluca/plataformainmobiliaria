/**
 * Miniaturas generadas en el navegador.
 *
 * El backend no las produce a propósito: la multimedia nunca pasa por él
 * (decisión fijada en plan_estrategico.md), así que generarlas del lado del
 * servidor obligaría a bajar cada video del storage, procesarlo con ffmpeg y
 * volver a subirlo. Acá el archivo ya está en memoria del cliente.
 *
 * Todo lo de este archivo es accesorio: si algo falla se devuelve null y la
 * subida sigue sin miniatura. Un navegador que no pueda decodificar un códec
 * no puede impedir publicar la propiedad.
 */

/** Lado mayor de la miniatura. Alcanza para una grilla y pesa decenas de KB. */
const LADO_MAXIMO = 640

const CALIDAD_JPEG = 0.8

/** Más allá de esto, esperar los metadatos del video no vale la pena. */
const TIMEOUT_MS = 10_000

/** Lo que se espera un frame antes de dibujar igual. */
const SEEK_TIMEOUT_MS = 3_000

export interface Miniatura {
  blob: Blob
  /** Solo en video: lo que dura, para mostrarlo sin volver a leer el archivo. */
  durationSec?: number
}

/**
 * Miniatura de una imagen o del primer frame útil de un video.
 * Devuelve null si el navegador no puede procesar el archivo.
 */
export async function generarMiniatura(file: File): Promise<Miniatura | null> {
  try {
    if (file.type.startsWith('video/')) return await deVideo(file)
    if (file.type.startsWith('image/')) return await deImagen(file)
    return null
  } catch {
    return null
  }
}

async function deImagen(file: File): Promise<Miniatura | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const blob = await aJpeg(bitmap, bitmap.width, bitmap.height)
    return blob ? { blob } : null
  } finally {
    bitmap.close()
  }
}

/**
 * Captura un frame del video. No usa el primer frame: muchos empiezan en negro
 * o con un fundido, así que se busca un segundo adentro (o la mitad, si dura
 * menos).
 */
/** Cada cuánto se revisa el estado del video mientras se lo espera. */
const SONDEO_MS = 50

/**
 * Espera a que se cumpla una condición, sondeando.
 *
 * Sondear y no escuchar eventos es a propósito: `loadeddata` y `seeked` pueden
 * dispararse antes de que se registre el handler, y ahí la promesa no resuelve
 * nunca. Sondear el `readyState` real no se pierde nada. Al agotarse el tiempo
 * resuelve igual, para que el llamador decida con lo que haya.
 *
 * Con `setTimeout` y no con `requestAnimationFrame`: el navegador no dibuja
 * cuadros en una pestaña que no está a la vista, así que con rAF una subida
 * quedaba congelada para siempre en cuanto la persona cambiaba de pestaña.
 */
function esperarA(condicion: () => boolean, limiteMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const inicio = Date.now()
    const revisar = () => {
      if (condicion()) return resolve(true)
      if (Date.now() - inicio > limiteMs) return resolve(false)
      setTimeout(revisar, SONDEO_MS)
    }
    revisar()
  })
}

async function deVideo(file: File): Promise<Miniatura | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  // "auto" y no "metadata": hace falta un frame decodificado, no solo el alto
  // y el ancho.
  video.preload = 'auto'
  video.src = url

  try {
    // HAVE_METADATA: ya se conocen duración y dimensiones.
    if (!(await esperarA(() => video.readyState >= 1, TIMEOUT_MS))) return null

    const duracion = video.duration
    // Un archivo grabado por el propio navegador suele venir sin duración; ahí
    // no hay adónde saltar y se usa el frame que esté cargado.
    if (Number.isFinite(duracion) && duracion > 0) {
      video.currentTime = Math.min(1, duracion / 2)
    }

    // HAVE_CURRENT_DATA: hay un frame para dibujar.
    const listo = await esperarA(() => video.readyState >= 2, SEEK_TIMEOUT_MS)
    if (!listo) {
      // Algunos formatos no decodifican nada hasta que el video corre. Un
      // pulso de reproducción muda alcanza para forzar el primer frame.
      await video.play().catch(() => undefined)
      await esperarA(() => video.readyState >= 2, SEEK_TIMEOUT_MS)
      video.pause()
    }

    const blob = await aJpeg(video, video.videoWidth, video.videoHeight)
    if (!blob) return null

    return {
      blob,
      durationSec:
        Number.isFinite(duracion) && duracion > 0 ? Math.round(duracion) : undefined,
    }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** Dibuja la fuente en un canvas escalado y lo exporta como jpeg. */
async function aJpeg(
  fuente: CanvasImageSource,
  ancho: number,
  alto: number,
): Promise<Blob | null> {
  if (!ancho || !alto) return null

  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(ancho * escala)
  canvas.height = Math.round(alto * escala)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', CALIDAD_JPEG)
  })
}
