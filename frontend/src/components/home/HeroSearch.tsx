import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Chevron from '../common/Chevron'
import { usePopover } from '../../hooks/usePopover'
import { useResource } from '../../hooks/useResource'
import { getCities } from '../../api/publicCatalog'
import type { OperationType } from '../../api/schemas'
import { typeOptions } from '../../lib/propertyLabels'

// Hero de la home según M2Prop.pdf: título, chips de operación y la barra de
// filtros con chevrons naranjas. Medidas del PDF (frame de 1440px): chips de
// 25px de alto con 15px de padding y 14,4px entre sí; en la barra, 14px entre
// texto y chevron y 19px a cada lado del separador de 1,4×12px. Debajo de
// 1140px la barra hace wrap: se agranda el texto y se ocultan los separadores,
// que si no quedan huérfanos al principio de cada línea.

const operaciones: { key: OperationType; label: string }[] = [
  { key: 'sale', label: 'Comprar' },
  { key: 'rent', label: 'Alquiler' },
  { key: 'temporary_rental', label: 'Temporario' },
]

// Accesos por categoría. El modelo no tiene un campo para "emprendimiento",
// "barrio privado" o "campo": se resuelven con la búsqueda de texto del
// catálogo (título, dirección y localidad), que es lo más cercano que hay.
const categorias = [
  { label: 'Nuevos Emprendimientos', q: 'emprendimiento' },
  { label: 'Barrios Privados & Desarrollos', q: 'barrio privado' },
  { label: 'Campos & Chacras', q: 'campo' },
]

const minimos = (sufijo: string, hasta: number) =>
  Array.from({ length: hasta }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}${i + 1 === hasta ? '+' : ''} ${sufijo}`,
  }))

const ambientesOpts = minimos('amb.', 5)
const dormitoriosOpts = minimos('dorm.', 4)
const banosOpts = minimos('baños', 3)
const cocherasOpts = minimos('cocheras', 3)
const antiguedadOpts = [
  { value: '0', label: 'A estrenar' },
  { value: '5', label: 'Hasta 5 años' },
  { value: '10', label: 'Hasta 10 años' },
  { value: '20', label: 'Hasta 20 años' },
]
// Las características se cargan como texto libre en cada propiedad, así que el
// filtro busca por contenido: estas son las que más se usan.
const caracteristicasOpts = [
  'Pileta',
  'Quincho',
  'Parrilla',
  'Jardín',
  'Patio',
  'Balcón',
  'Terraza',
  'Aire acondicionado',
  'Calefacción',
  'Amoblado',
  'Apto crédito',
  'Apto mascotas',
  'Seguridad',
].map((c) => ({ value: c, label: c }))

interface Opcion {
  value: string
  label: string
}

/** Ítem de la barra: etiqueta + chevron, y el panel que se abre debajo. */
function Filtro({
  label,
  activo,
  children,
}: {
  label: string
  /** Lo elegido reemplaza a la etiqueta, para que se vea qué está filtrando. */
  activo?: string
  children: (close: () => void) => ReactNode
}) {
  const { open, setOpen, ref } = usePopover()
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-[14px] whitespace-nowrap font-serif text-[13px] min-[1140px]:text-[10px] leading-none transition-colors hover:text-accent ${
          activo ? 'text-accent' : 'text-black'
        }`}
      >
        {activo ?? label}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-30 mt-3 min-w-[180px] -translate-x-1/2 overflow-hidden rounded-md border border-line bg-surface py-1 text-left shadow-card-hover">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function Lista({
  opciones,
  valor,
  onElegir,
  todos,
}: {
  opciones: Opcion[]
  valor: string
  onElegir: (v: string) => void
  todos: string
}) {
  return (
    <ul className="max-h-72 overflow-y-auto">
      {[{ value: '', label: todos }, ...opciones].map((o) => (
        <li key={o.value}>
          <button
            type="button"
            onClick={() => onElegir(o.value)}
            className={`block w-full px-4 py-2 text-left font-serif text-sm hover:bg-cream ${
              valor === o.value ? 'text-accent' : 'text-ink'
            }`}
          >
            {o.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Sep() {
  return <span className="hidden h-3 w-px shrink-0 bg-black min-[1140px]:block" aria-hidden />
}

type Filtros = {
  q: string
  type: string
  ambientes: string
  dormitorios: string
  banos: string
  cocheras: string
  minPrice: string
  maxPrice: string
  antiguedad: string
  feature: string
}

const vacio: Filtros = {
  q: '',
  type: '',
  ambientes: '',
  dormitorios: '',
  banos: '',
  cocheras: '',
  minPrice: '',
  maxPrice: '',
  antiguedad: '',
  feature: '',
}

const etiqueta = (opts: Opcion[], v: string) => opts.find((o) => o.value === v)?.label

export default function HeroSearch() {
  const navigate = useNavigate()
  const [op, setOp] = useState<OperationType>('sale')
  const [f, setF] = useState<Filtros>(vacio)
  const set = (k: keyof Filtros) => (v: string) => setF((prev) => ({ ...prev, [k]: v }))

  // Las localidades salen de las propiedades publicadas: no tiene sentido
  // ofrecer una ciudad donde no hay nada para mostrar.
  const ciudades = useResource(() => getCities(), [])
  const localidadOpts = (ciudades.data ?? []).map((c) => ({
    value: c.city,
    label: `${c.city} (${c.count})`,
  }))

  const buscar = () => {
    const p = new URLSearchParams({ op })
    if (f.q) p.set('q', f.q)
    if (f.type) p.set('type', f.type)
    // El catálogo no guarda dormitorios: guarda ambientes. Por la convención
    // del mercado (ambientes = dormitorios + living), N dormitorios piden al
    // menos N+1 ambientes, y si se eligieron los dos gana el más exigente.
    const minRooms = Math.max(
      Number(f.ambientes) || 0,
      f.dormitorios ? Number(f.dormitorios) + 1 : 0,
    )
    if (minRooms) p.set('minRooms', String(minRooms))
    if (f.banos) p.set('minBathrooms', f.banos)
    if (f.cocheras) p.set('minParking', f.cocheras)
    if (f.minPrice) p.set('minPrice', f.minPrice)
    if (f.maxPrice) p.set('maxPrice', f.maxPrice)
    if (f.antiguedad) p.set('maxAge', f.antiguedad)
    if (f.feature) p.set('feature', f.feature)
    navigate(`/buscar?${p.toString()}`)
  }

  const precioActivo =
    f.minPrice || f.maxPrice
      ? `${f.minPrice ? `Desde ${f.minPrice}` : ''}${f.minPrice && f.maxPrice ? ' · ' : ''}${
          f.maxPrice ? `Hasta ${f.maxPrice}` : ''
        }`
      : undefined

  const listas: { label: string; key: keyof Filtros; opts: Opcion[]; todos: string }[] = [
    { label: 'Localidad', key: 'q', opts: localidadOpts, todos: 'Todas las localidades' },
    { label: 'Tipo de propiedad', key: 'type', opts: typeOptions, todos: 'Todos los tipos' },
    { label: 'Ambientes', key: 'ambientes', opts: ambientesOpts, todos: 'Indistinto' },
    { label: 'Dormitorios', key: 'dormitorios', opts: dormitoriosOpts, todos: 'Indistinto' },
    { label: 'Baños', key: 'banos', opts: banosOpts, todos: 'Indistinto' },
    { label: 'Cocheras', key: 'cocheras', opts: cocherasOpts, todos: 'Indistinto' },
  ]

  return (
    <section className="bg-cream px-4 pb-3 pt-[19.7px] text-center">
      <h1 className="font-serif text-[26px] leading-tight text-black md:text-[36px]">
        Encuentre el lugar de sus sueños y comience a llenarlos de historias...
      </h1>
      <p className="mt-[7.6px] font-serif text-[16px] leading-tight text-black md:text-[20px]">
        Con el respaldo del sector inmobiliario
      </p>

      {/* Chips de operación y categorías */}
      <div className="mt-[32.9px] flex flex-wrap items-center justify-center gap-[14.4px]">
        {operaciones.slice(0, 1).map((o) => (
          <ChipOperacion key={o.key} label={o.label} activo={op === o.key} onClick={() => setOp(o.key)} />
        ))}
        {/* Vender no es una búsqueda: quien vende necesita una tasación. */}
        <button
          type="button"
          onClick={() => navigate('/tasaciones')}
          className="h-[30px] min-[1140px]:h-[25px] rounded-full border-[0.5px] border-black px-[15px] font-serif text-[13px] min-[1140px]:text-[10px] leading-none text-black transition-colors hover:border-accent hover:text-accent"
        >
          Vender
        </button>
        {operaciones.slice(1).map((o) => (
          <ChipOperacion key={o.key} label={o.label} activo={op === o.key} onClick={() => setOp(o.key)} />
        ))}
        {categorias.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => navigate(`/buscar?q=${encodeURIComponent(c.q)}`)}
            className="h-[30px] min-[1140px]:h-[25px] rounded-full border-[0.5px] border-accent px-[15px] font-serif text-[13px] min-[1140px]:text-[10px] leading-none text-black transition-colors hover:bg-accent hover:text-white"
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Barra de filtros */}
      <div className="mt-[22.5px] flex flex-wrap items-center justify-center gap-x-6 gap-y-4 min-[1140px]:gap-x-[19px]">
        {listas.map((l) => (
          <Fragment key={l.key}>
            <Filtro label={l.label} activo={etiqueta(l.opts, f[l.key])}>
              {(close) => (
                <Lista
                  opciones={l.opts}
                  valor={f[l.key]}
                  todos={l.todos}
                  onElegir={(v) => {
                    set(l.key)(v)
                    close()
                  }}
                />
              )}
            </Filtro>
            <Sep />
          </Fragment>
        ))}

        <Filtro label="Rango de precios" activo={precioActivo}>
          {(close) => (
            <div className="w-56 space-y-2 px-4 py-3">
              {(['minPrice', 'maxPrice'] as const).map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block font-serif text-xs text-muted">
                    {k === 'minPrice' ? 'Desde' : 'Hasta'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={f[k]}
                    onChange={(e) => set(k)(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && close()}
                    className="w-full rounded-md border border-line px-3 py-1.5 font-serif text-sm text-ink focus:border-accent focus:outline-none"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={close}
                className="w-full rounded-full bg-accent py-1.5 font-serif text-sm text-white hover:bg-accent-dark"
              >
                Aplicar
              </button>
            </div>
          )}
        </Filtro>
        <Sep />

        <Filtro label="Antigüedad" activo={etiqueta(antiguedadOpts, f.antiguedad)}>
          {(close) => (
            <Lista
              opciones={antiguedadOpts}
              valor={f.antiguedad}
              todos="Indistinto"
              onElegir={(v) => {
                set('antiguedad')(v)
                close()
              }}
            />
          )}
        </Filtro>
        <Sep />

        <Filtro label="Características" activo={f.feature || undefined}>
          {(close) => (
            <Lista
              opciones={caracteristicasOpts}
              valor={f.feature}
              todos="Todas"
              onElegir={(v) => {
                set('feature')(v)
                close()
              }}
            />
          )}
        </Filtro>
        <Sep />

        <button
          type="button"
          onClick={buscar}
          className="h-8 w-[100px] rounded-full bg-accent min-[1140px]:h-6 min-[1140px]:w-[83px] font-serif text-[13px] min-[1140px]:text-[10px] leading-none text-[#E3E3E3] transition-colors hover:bg-accent-dark hover:text-white"
        >
          Buscar
        </button>
      </div>
    </section>
  )
}

function ChipOperacion({
  label,
  activo,
  onClick,
}: {
  label: string
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex h-[30px] min-[1140px]:h-[25px] items-center gap-[14px] rounded-full border-[0.5px] border-black px-[15px] font-serif text-[13px] min-[1140px]:text-[10px] leading-none text-black transition-colors ${
        activo ? 'bg-chip pr-[18.8px]' : 'hover:border-accent hover:text-accent'
      }`}
    >
      {label}
      {activo && <Chevron />}
    </button>
  )
}
