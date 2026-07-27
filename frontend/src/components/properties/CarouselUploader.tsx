import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react'
import {
  ACCEPTED_CAROUSEL_TYPES,
  MAX_CAROUSEL_BYTES,
  MAX_CAROUSEL_IMAGES,
  deleteCarouselImage,
  reorderCarousel,
  uploadCarouselImage,
} from '../../api/sites'
import type { CarouselImage } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

interface Props {
  carousel: CarouselImage[]
  onChange: (carousel: CarouselImage[]) => void
}

interface EnCurso {
  id: string
  preview: string
  progreso: number
  error?: string
}

const MB = 1024 * 1024

/** Carrousel del sitio del tenant. Mismo flujo de subida que la multimedia. */
export default function CarouselUploader({ carousel, onChange }: Props) {
  const [enCurso, setEnCurso] = useState<EnCurso[]>([])
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const lleno = carousel.length + enCurso.length >= MAX_CAROUSEL_IMAGES

  const subir = async (files: FileList | File[]) => {
    setError(null)
    const lista = Array.from(files)

    const invalido = lista.find(
      (f) => !(ACCEPTED_CAROUSEL_TYPES as readonly string[]).includes(f.type),
    )
    if (invalido) {
      setError(`"${invalido.name}" no es una imagen aceptada (JPG, PNG, WebP o AVIF)`)
      return
    }
    const grande = lista.find((f) => f.size > MAX_CAROUSEL_BYTES)
    if (grande) {
      setError(`"${grande.name}" supera los ${MAX_CAROUSEL_BYTES / MB} MB`)
      return
    }
    if (carousel.length + lista.length > MAX_CAROUSEL_IMAGES) {
      setError(`El carrousel admite hasta ${MAX_CAROUSEL_IMAGES} imágenes.`)
      return
    }

    let actual = carousel
    for (const file of lista) {
      const tempId = `${file.name}-${file.lastModified}`
      const preview = URL.createObjectURL(file)
      setEnCurso((prev) => [...prev, { id: tempId, preview, progreso: 0 }])

      try {
        const image = await uploadCarouselImage(file, (p) =>
          setEnCurso((prev) => prev.map((e) => (e.id === tempId ? { ...e, progreso: p } : e))),
        )
        actual = [...actual, image]
        onChange(actual)
        setEnCurso((prev) => prev.filter((e) => e.id !== tempId))
        URL.revokeObjectURL(preview)
      } catch (err) {
        const mensaje = err instanceof ApiError ? err.message : 'Falló la subida'
        setEnCurso((prev) => prev.map((e) => (e.id === tempId ? { ...e, error: mensaje } : e)))
      }
    }
  }

  const mover = async (index: number, delta: number) => {
    const destino = index + delta
    if (destino < 0 || destino >= carousel.length) return

    const nuevo = [...carousel]
    const [movido] = nuevo.splice(index, 1)
    nuevo.splice(destino, 0, movido)
    onChange(nuevo)

    try {
      onChange(await reorderCarousel(nuevo.map((i) => i.id)))
    } catch (err) {
      onChange(carousel)
      setError(err instanceof ApiError ? err.message : 'No se pudo reordenar')
    }
  }

  const borrar = async (id: string) => {
    setOcupadoId(id)
    setError(null)
    try {
      await deleteCarouselImage(id)
      onChange(carousel.filter((i) => i.id !== id))
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
          if (!lleno && e.dataTransfer.files.length) void subir(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          arrastrando ? 'border-brand bg-brand/5' : 'border-line bg-canvas'
        } ${lleno ? 'opacity-60' : ''}`}
      >
        <UploadCloud className="mx-auto h-7 w-7 text-muted" aria-hidden />
        <p className="mt-2 text-sm text-ink">
          {lleno ? (
            `Llegaste al máximo de ${MAX_CAROUSEL_IMAGES} imágenes.`
          ) : (
            <>
              Arrastrá las imágenes del carrousel, o{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-brand hover:underline"
              >
                elegilas de tu compu
              </button>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">
          {carousel.length} de {MAX_CAROUSEL_IMAGES} · se muestran en este orden
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_CAROUSEL_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void subir(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {carousel.length === 0 && enCurso.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ImagePlus className="h-4 w-4" aria-hidden />
          Sin imágenes, el sitio muestra un fondo liso con tu color principal.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {carousel.map((img, i) => (
            <li
              key={img.id}
              className="overflow-hidden rounded-lg border border-line bg-surface"
            >
              <img src={img.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
              <div className="flex items-center justify-between border-t border-line px-1.5 py-1.5">
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
                    disabled={i === carousel.length - 1}
                    className="rounded p-1 text-muted hover:bg-canvas hover:text-ink disabled:opacity-30"
                    aria-label="Mover después"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void borrar(img.id)}
                  disabled={ocupadoId === img.id}
                  className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  aria-label="Eliminar imagen"
                >
                  {ocupadoId === img.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}

          {enCurso.map((e) => (
            <li key={e.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              <img src={e.preview} alt="" className="aspect-[16/9] w-full object-cover opacity-50" />
              <div className="border-t border-line px-2 py-1.5">
                {e.error ? (
                  <p className="truncate text-[11px] text-red-600">{e.error}</p>
                ) : (
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${e.progreso}%` }}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
