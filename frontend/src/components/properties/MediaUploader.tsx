import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Play,
  Star,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import {
  ACCEPTED_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  deleteMedia,
  esVideo,
  listMedia,
  maxBytesPara,
  reorderMedia,
  setCover,
  uploadMedia,
} from '../../api/media'
import type { PropertyMedia } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

interface Props {
  propertyId: string
  /** Avisa al padre para refrescar contadores de uso del plan. */
  onChange?: () => void
}

interface EnCurso {
  id: string
  nombre: string
  preview: string
  esVideo: boolean
  progreso: number
  error?: string
}

const MB = 1024 * 1024

function esAceptado(file: File): boolean {
  return (ACCEPTED_MEDIA_TYPES as readonly string[]).includes(file.type)
}

/** 95 → "1:35". */
function duracion(segundos: number): string {
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}

/**
 * Carga de fotos y videos de una propiedad.
 *
 * Cada archivo pasa por firmar → PUT directo al storage → miniatura →
 * confirmar. Se sube de a uno: en paralelo, varias subidas grandes compiten por
 * el ancho de banda y la barra de progreso deja de significar algo.
 *
 * La miniatura del video la genera este navegador capturando un frame; hasta
 * que el archivo termina de confirmarse, la tarjeta se muestra en gris.
 */
export default function MediaUploader({ propertyId, onChange }: Props) {
  const [media, setMedia] = useState<PropertyMedia[]>([])
  const [cargando, setCargando] = useState(true)
  const [enCurso, setEnCurso] = useState<EnCurso[]>([])
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelado = false
    listMedia(propertyId)
      .then((m) => {
        if (!cancelado) setMedia(m)
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof ApiError ? err.message : 'No se pudo cargar')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [propertyId])

  // Las URLs de preview son objetos en memoria: hay que liberarlas.
  useEffect(() => {
    return () => {
      enCurso.forEach((e) => URL.revokeObjectURL(e.preview))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subir = async (files: FileList | File[]) => {
    setError(null)
    const lista = Array.from(files)

    const invalido = lista.find((f) => !esAceptado(f))
    if (invalido) {
      setError(
        `"${invalido.name}" no es un archivo aceptado (JPG, PNG, WebP, AVIF, MP4, WebM o MOV)`,
      )
      return
    }
    const grande = lista.find((f) => f.size > maxBytesPara(f.type))
    if (grande) {
      const max = maxBytesPara(grande.type) / MB
      setError(
        `"${grande.name}" pesa ${Math.round(grande.size / MB)} MB y el máximo es ${max} MB`,
      )
      return
    }

    for (const file of lista) {
      const tempId = `${file.name}-${file.size}-${file.lastModified}`
      const preview = URL.createObjectURL(file)
      setEnCurso((prev) => [
        ...prev,
        { id: tempId, nombre: file.name, preview, esVideo: esVideo(file.type), progreso: 0 },
      ])

      try {
        const subida = await uploadMedia(propertyId, file, (p) => {
          setEnCurso((prev) =>
            prev.map((e) => (e.id === tempId ? { ...e, progreso: p } : e)),
          )
        })
        setMedia((prev) => [...prev, subida])
        setEnCurso((prev) => prev.filter((e) => e.id !== tempId))
        URL.revokeObjectURL(preview)
        onChange?.()
      } catch (err) {
        const mensaje = err instanceof ApiError ? err.message : 'Falló la subida'
        setEnCurso((prev) =>
          prev.map((e) => (e.id === tempId ? { ...e, error: mensaje } : e)),
        )
      }
    }
  }

  const marcarPortada = async (id: string) => {
    setOcupadoId(id)
    setError(null)
    try {
      await setCover(propertyId, id)
      setMedia((prev) => prev.map((m) => ({ ...m, isCover: m.id === id })))
      onChange?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar la portada')
    } finally {
      setOcupadoId(null)
    }
  }

  const mover = async (index: number, delta: number) => {
    const destino = index + delta
    if (destino < 0 || destino >= media.length) return

    const nuevo = [...media]
    const [movido] = nuevo.splice(index, 1)
    nuevo.splice(destino, 0, movido)
    setMedia(nuevo) // optimista: el reordenar tiene que sentirse instantáneo

    try {
      setMedia(await reorderMedia(propertyId, nuevo.map((m) => m.id)))
    } catch (err) {
      setMedia(media) // vuelve al orden anterior
      setError(err instanceof ApiError ? err.message : 'No se pudo reordenar')
    }
  }

  const borrar = async (id: string) => {
    setOcupadoId(id)
    setError(null)
    try {
      await deleteMedia(propertyId, id)
      setMedia((prev) => prev.filter((m) => m.id !== id))
      onChange?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar')
    } finally {
      setOcupadoId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastrando(false)
          if (e.dataTransfer.files.length) void subir(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          arrastrando ? 'border-brand bg-brand/5' : 'border-line bg-canvas'
        }`}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-muted" aria-hidden />
        <p className="mt-2 text-sm text-ink">
          Arrastrá las fotos o videos acá, o{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-brand hover:underline"
          >
            elegilos de tu compu
          </button>
        </p>
        <p className="mt-1 text-xs text-muted">
          Fotos JPG, PNG, WebP o AVIF hasta {MAX_IMAGE_BYTES / MB} MB · videos MP4, WebM
          o MOV hasta {MAX_VIDEO_BYTES / MB} MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_MEDIA_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void subir(e.target.files)
            e.target.value = '' // permite volver a elegir el mismo archivo
          }}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-muted">Cargando fotos…</p>
      ) : media.length === 0 && enCurso.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ImagePlus className="h-4 w-4" aria-hidden />
          Todavía no hay fotos. La primera queda como portada.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m, i) => (
            <li
              key={m.id}
              className={`group relative overflow-hidden rounded-lg border bg-surface ${
                m.isCover ? 'border-brand ring-1 ring-brand' : 'border-line'
              }`}
            >
              {m.type === 'video' && !m.thumbnailUrl ? (
                // Sin miniatura (el navegador no pudo generarla): el propio
                // video muestra su primer frame con preload=metadata.
                <video
                  src={m.url}
                  preload="metadata"
                  muted
                  playsInline
                  className="aspect-[4/3] w-full bg-black object-cover"
                />
              ) : (
                <img
                  src={m.thumbnailUrl ?? m.url}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}

              {m.type === 'video' && (
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
                  {m.durationSec ? duracion(m.durationSec) : 'Video'}
                </span>
              )}

              {m.isCover && (
                <span className="absolute left-1.5 top-1.5 rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                  Portada
                </span>
              )}

              <div className="flex items-center justify-between gap-1 border-t border-line px-1.5 py-1.5">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => void mover(i, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                    aria-label="Mover antes"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void mover(i, 1)}
                    disabled={i === media.length - 1}
                    className="rounded p-1 text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                    aria-label="Mover después"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex gap-0.5">
                  {!m.isCover && (
                    <button
                      type="button"
                      onClick={() => void marcarPortada(m.id)}
                      disabled={ocupadoId === m.id}
                      className="rounded p-1 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-30"
                      aria-label="Usar como portada"
                      title="Usar como portada"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void borrar(m.id)}
                    disabled={ocupadoId === m.id}
                    className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Eliminar foto"
                  >
                    {ocupadoId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </li>
          ))}

          {enCurso.map((e) => (
            <li
              key={e.id}
              className="relative overflow-hidden rounded-lg border border-line bg-surface"
            >
              {e.esVideo ? (
                <video
                  src={e.preview}
                  preload="metadata"
                  muted
                  playsInline
                  className="aspect-[4/3] w-full bg-black object-cover opacity-50"
                />
              ) : (
                <img
                  src={e.preview}
                  alt=""
                  className="aspect-[4/3] w-full object-cover opacity-50"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 border-t border-line bg-surface px-2 py-1.5">
                {e.error ? (
                  <p className="truncate text-[11px] text-red-600" title={e.error}>
                    {e.error}
                  </p>
                ) : (
                  <>
                    <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${e.progreso}%` }}
                      />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {/* El PUT llega hasta 99: lo que queda es generar la
                          miniatura, subirla y confirmar contra el plan. */}
                      {e.progreso >= 99 ? 'Procesando…' : `${e.progreso}%`} · {e.nombre}
                    </p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
