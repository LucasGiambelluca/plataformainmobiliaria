import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardList, Info } from 'lucide-react'
import {
  createAppraisal,
  listAppraisalParticipants,
} from '../api/appraisals'
import { getLocalidades } from '../api/publicCatalog'
import {
  appraisalFormSchema,
  type AppraisalAgency,
  type AppraisalForm,
} from '../api/schemas'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import Select from '../components/common/Select'
import { ErrorState } from '../components/common/AsyncState'
import { Skeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { ApiError } from '../lib/apiError'
import {
  APPRAISAL_AMENITIES,
  APPRAISAL_SERVICES,
  APPRAISAL_SPACES,
  appraisalConditionLabels,
  appraisalPropertyTypeLabels,
  appraisalPurposeLabels,
  appraisalReasonLabels,
  appraisalTimeframeLabels,
  opcionesDe,
} from '../lib/appraisalLabels'

/**
 * Tasaciones online (portal).
 *
 * El propietario completa la solicitud y la recibe una inmobiliaria: puede
 * elegirla o dejar que la asigne el portal. Solo participan las inmobiliarias
 * con plan premium, así que la lista puede venir vacía para una localidad —
 * eso se avisa antes de que alguien complete cincuenta campos para nada.
 */

const tiposDePropiedad = opcionesDe(appraisalPropertyTypeLabels)
const destinos = opcionesDe(appraisalPurposeLabels)
const estados = opcionesDe(appraisalConditionLabels)
const motivos = opcionesDe(appraisalReasonLabels)
const plazos = opcionesDe(appraisalTimeframeLabels)

/** Estado de los bloques opcionales, fuera de react-hook-form por simplicidad. */
interface Extras {
  surfaces: { land: string; covered: string; semiCovered: string; uncovered: string }
  ageYears: string
  spaces: string[]
  services: string[]
  amenities: string[]
  situation: { hasDeed: boolean; isRented: boolean; wasRenovated: boolean; lastRenovationYear: string }
  estimatedValue: string
  reason: string
  timeframe: string
}

const EXTRAS_VACIOS: Extras = {
  surfaces: { land: '', covered: '', semiCovered: '', uncovered: '' },
  ageYears: '',
  spaces: [],
  services: [],
  amenities: [],
  situation: { hasDeed: false, isRented: false, wasRenovated: false, lastRenovationYear: '' },
  estimatedValue: '',
  reason: '',
  timeframe: '',
}

const numero = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')))

/** Arma el `details` que espera el backend, sin claves vacías. */
function armarDetails(e: Extras): Record<string, unknown> | undefined {
  const surfaces = {
    land: numero(e.surfaces.land),
    covered: numero(e.surfaces.covered),
    semiCovered: numero(e.surfaces.semiCovered),
    uncovered: numero(e.surfaces.uncovered),
  }
  const tieneSuperficies = Object.values(surfaces).some((v) => v !== undefined)

  const situation = {
    ...(e.situation.hasDeed ? { hasDeed: true } : {}),
    ...(e.situation.isRented ? { isRented: true } : {}),
    ...(e.situation.wasRenovated ? { wasRenovated: true } : {}),
    ...(e.situation.lastRenovationYear
      ? { lastRenovationYear: Number(e.situation.lastRenovationYear) }
      : {}),
  }

  const details: Record<string, unknown> = {
    ...(tieneSuperficies ? { surfaces } : {}),
    ...(e.ageYears ? { ageYears: Number(e.ageYears) } : {}),
    ...(e.spaces.length ? { spaces: e.spaces } : {}),
    ...(e.services.length ? { services: e.services } : {}),
    ...(e.amenities.length ? { amenities: e.amenities } : {}),
    ...(Object.keys(situation).length ? { situation } : {}),
    ...(e.estimatedValue.trim() ? { estimatedValue: e.estimatedValue.trim() } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.timeframe ? { timeframe: e.timeframe } : {}),
  }

  return Object.keys(details).length ? details : undefined
}

export default function Tasaciones() {
  const participantes = useResource<AppraisalAgency[]>(
    () => listAppraisalParticipants(),
    [],
  )

  useSeo({
    title: 'Tasaciones online: conocé el valor de tu propiedad',
    description:
      'Pedí una estimación del valor de tu propiedad a una inmobiliaria matriculada. Completá el formulario y elegí con quién querés tasarla.',
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header className="text-center">
        <h1 className="font-serif text-3xl text-brand md:text-4xl">Tasaciones Online</h1>
        <p className="mt-3 text-lg text-muted">Conocé el valor estimado de tu propiedad</p>
      </header>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-ink">
        <p>
          La tasación online es una herramienta práctica que permite obtener una estimación
          inicial del valor de una propiedad de forma rápida y sencilla, a partir de la
          información proporcionada por el propietario y del análisis de inmuebles con
          características similares y de los valores vigentes del mercado.
        </p>
        <p>
          Una tasación realizada de manera presencial por un corredor inmobiliario matriculado
          permite obtener una valoración más precisa: el profesional evalúa aspectos que no
          siempre se aprecian en un formulario o en fotografías, como el estado general del
          inmueble, la calidad de sus materiales y terminaciones, las mejoras realizadas, su
          distribución, orientación, iluminación y entorno.
        </p>
        <p className="rounded-lg bg-accent/10 px-4 py-3">
          <strong>La tasación online es una estimación orientativa.</strong> La tasación
          presencial sigue siendo la herramienta más adecuada para determinar con mayor
          precisión el valor de una propiedad.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl text-brand">¿Cómo funciona?</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          Completá los datos del formulario. Podés elegir la inmobiliaria de tu preferencia
          entre las participantes del servicio o dejar que el portal asigne tu consulta
          automáticamente. Las condiciones de la tasación y su modalidad se acuerdan
          directamente entre vos y la inmobiliaria.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl text-brand">Inmobiliarias participantes</h2>

        {participantes.loading && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2" role="status" aria-label="Cargando inmobiliarias">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        )}

        {participantes.error && (
          <div className="mt-4">
            <ErrorState error={participantes.error} onRetry={participantes.reload} />
          </div>
        )}

        {participantes.data && participantes.data.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {participantes.data.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-card"
              >
                {a.logoUrl ? (
                  <img src={a.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                    {a.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <Link to={`/inmobiliaria/${a.slug}`} className="font-medium text-ink hover:text-brand">
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {participantes.data && participantes.data.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            Por ahora ninguna inmobiliaria está participando del servicio.{' '}
            <Link to="/inmobiliarias" className="text-brand underline">
              Mirá el directorio
            </Link>{' '}
            para contactar una directamente.
          </p>
        )}

        <p className="mt-3 text-xs text-muted">
          También podés consultar el{' '}
          <Link to="/inmobiliarias" className="text-brand underline">
            directorio de inmobiliarias
          </Link>{' '}
          y comunicarte directamente con la que prefieras.
        </p>
      </section>

      {participantes.data && participantes.data.length > 0 && <FormularioTasacion />}
    </div>
  )
}

/**
 * No recibe la lista de inmobiliarias: la pide por localidad.
 *
 * La lista global la sigue usando la pantalla de arriba, pero solo para decidir
 * si vale la pena mostrar el formulario. Quién aparece en el selector lo decide
 * la localidad que se eligió.
 */
function FormularioTasacion() {
  const [extras, setExtras] = useState<Extras>(EXTRAS_VACIOS)
  const [enviado, setEnviado] = useState<{ assigned: boolean } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // Catálogo cerrado: la localidad es la clave con la que se busca a qué
  // inmobiliaria le toca la solicitud, así que no puede ser texto libre.
  const localidades = useResource<string[]>(getLocalidades, [])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AppraisalForm>({
    resolver: zodResolver(appraisalFormSchema) as never,
  })

  /**
   * Inmobiliarias que operan en la localidad elegida.
   *
   * El selector mostraba la lista global, así que ofrecía inmobiliarias que
   * trabajan a trescientos kilómetros y el aviso de "acá no hay ninguna" recién
   * llegaba después de completar cincuenta campos — justo lo que el comentario
   * de arriba de este archivo dice que la pantalla evita. Peor: elegir una de
   * esas la asignaba igual, porque `findParticipantById` no chequea localidad,
   * y eso saltea la regla que el reparto automático sí respeta.
   */
  const ciudad = watch('city')
  const porLocalidad = useResource<AppraisalAgency[]>(
    () => (ciudad ? listAppraisalParticipants(ciudad) : Promise.resolve([])),
    [ciudad],
  )
  const deLaZona = porLocalidad.data ?? []

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      const r = await createAppraisal({
        ...values,
        ...(armarDetails(extras) ? { details: armarDetails(extras) } : {}),
      } as never)
      setEnviado({ assigned: r.assigned })
    } catch (err) {
      setFailure(
        err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud',
      )
    }
  })

  if (enviado) {
    return (
      <section className="mt-10 rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h2 className="mt-3 font-serif text-2xl text-brand">Recibimos tu solicitud</h2>
        <p className="mt-2 text-sm text-muted">
          {enviado.assigned
            ? 'Una inmobiliaria participante se va a comunicar con vos a la brevedad.'
            : 'Todavía no hay inmobiliarias participantes en esa localidad. Guardamos tu solicitud y el portal va a contactarte; mientras tanto podés escribirle a una del directorio.'}
        </p>
      </section>
    )
  }

  return (
    <section className="mt-10 rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-brand" aria-hidden />
        <h2 className="font-serif text-2xl text-brand">Solicitud de tasación</h2>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-8" noValidate>
        {/*
          Honeypot: los humanos no lo ven, los bots lo llenan. El backend ya
          respondía 201 sin guardar nada cuando venía cargado, pero este campo
          no existía en el formulario, así que la trampa no tenía carnada. Sin
          él la única defensa era el rate limit por IP.
        */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute h-0 w-0 overflow-hidden opacity-0"
          {...register('website')}
        />

        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Tus datos</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Input label="Nombre y apellido *" error={errors.name?.message} {...register('name')} />
            <Input
              label="Teléfono / WhatsApp *"
              inputMode="tel"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <Input
              label="Correo electrónico *"
              type="email"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">La propiedad</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Select
              label="Localidad *"
              options={(localidades.data ?? []).map((l) => ({ value: l, label: l }))}
              placeholder={
                localidades.error ? 'No se pudieron cargar' : 'Elegí una localidad'
              }
              disabled={!localidades.data}
              error={errors.city?.message}
              {...register('city')}
            />
            <Input label="Barrio" error={errors.neighborhood?.message} {...register('neighborhood')} />
            <Input label="Dirección *" error={errors.address?.message} {...register('address')} />
            <Select
              label="Tipo de propiedad *"
              options={tiposDePropiedad}
              placeholder="Elegí una opción"
              error={errors.propertyType?.message}
              {...register('propertyType')}
            />
            <Select
              label="Destino de la tasación *"
              options={destinos}
              placeholder="Elegí una opción"
              error={errors.purpose?.message}
              {...register('purpose')}
            />
            <Select
              label="Estado del inmueble"
              options={estados}
              placeholder="Sin especificar"
              error={errors.condition?.message}
              {...register('condition')}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input
              label="Superficie aproximada (m²)"
              inputMode="decimal"
              error={errors.areaM2?.message}
              {...register('areaM2')}
            />
            <Input
              label="Dormitorios"
              inputMode="numeric"
              error={errors.rooms?.message}
              {...register('rooms')}
            />
            <Input
              label="Baños"
              inputMode="numeric"
              error={errors.bathrooms?.message}
              {...register('bathrooms')}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-ink">Comentarios</legend>
          <textarea
            rows={3}
            placeholder="Cualquier información adicional que consideres importante."
            className="mt-3 w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            {...register('comments')}
          />
        </fieldset>

        <div className="rounded-lg bg-canvas p-4 text-xs text-muted">
          Cuanta más información nos des, más precisa va a ser la estimación. Si ahora no
          tenés todos los datos, completá solo lo obligatorio y ampliá después en el contacto
          con el profesional.
        </div>

        <BloquesOpcionales extras={extras} onChange={setExtras} />

        <fieldset>
          <legend className="text-sm font-semibold text-ink">
            ¿Con quién querés tasarla?
          </legend>
          <div className="mt-3">
            <Select
              label="Inmobiliaria"
              options={deLaZona.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Que el portal elija por mí"
              disabled={!ciudad || porLocalidad.loading}
              error={errors.tenantId?.message}
              {...register('tenantId')}
            />

            {!ciudad && (
              <p className="mt-1.5 text-xs text-muted">
                Elegí primero la localidad para ver qué inmobiliarias operan ahí.
              </p>
            )}

            {ciudad && !porLocalidad.loading && deLaZona.length === 0 && (
              <p className="mt-1.5 text-xs text-muted">
                Todavía no hay inmobiliarias participantes en {ciudad}. Podés enviar la
                solicitud igual: queda registrada y el portal se va a contactar con vos.
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" {...register('declaredAccurate')} />
            <span>
              Declaro que la información suministrada es correcta.
              {errors.declaredAccurate && (
                <span className="block text-xs text-red-600">
                  {errors.declaredAccurate.message}
                </span>
              )}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" {...register('acceptedTerms')} />
            <span>
              He leído y acepto los términos y condiciones y la política de privacidad.
              {errors.acceptedTerms && (
                <span className="block text-xs text-red-600">
                  {errors.acceptedTerms.message}
                </span>
              )}
            </span>
          </label>
        </fieldset>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Enviando…' : 'Enviar solicitud'}
        </Button>

        <p className="flex gap-2 text-xs text-muted">
          <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>
            Tus datos se comparten con la inmobiliaria que atienda la solicitud para que pueda
            contactarte.
          </span>
        </p>
      </form>
    </section>
  )
}

/* --------------------- bloques opcionales desplegables --------------------- */

interface BloquesProps {
  extras: Extras
  onChange: (e: Extras) => void
}

function BloquesOpcionales({ extras, onChange }: BloquesProps) {
  const alternar = (lista: string[], valor: string) =>
    lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink">Información adicional (opcional)</p>

      <Desplegable titulo="Superficies y antigüedad">
        <div className="grid gap-4 sm:grid-cols-4">
          {(['land', 'covered', 'semiCovered', 'uncovered'] as const).map((k) => (
            <Input
              key={k}
              label={
                { land: 'Terreno (m²)', covered: 'Cubierta (m²)', semiCovered: 'Semicubierta (m²)', uncovered: 'Descubierta (m²)' }[k]
              }
              inputMode="decimal"
              value={extras.surfaces[k]}
              onChange={(e) =>
                onChange({ ...extras, surfaces: { ...extras.surfaces, [k]: e.target.value } })
              }
            />
          ))}
        </div>
        <div className="mt-4 max-w-xs">
          <Input
            label="Años de construcción"
            inputMode="numeric"
            value={extras.ageYears}
            onChange={(e) => onChange({ ...extras, ageYears: e.target.value })}
          />
        </div>
      </Desplegable>

      <Desplegable titulo="Ambientes">
        <Casilleros
          opciones={APPRAISAL_SPACES}
          elegidas={extras.spaces}
          onToggle={(v) => onChange({ ...extras, spaces: alternar(extras.spaces, v) })}
        />
      </Desplegable>

      <Desplegable titulo="Servicios">
        <Casilleros
          opciones={APPRAISAL_SERVICES}
          elegidas={extras.services}
          onToggle={(v) => onChange({ ...extras, services: alternar(extras.services, v) })}
        />
      </Desplegable>

      <Desplegable titulo="Comodidades">
        <Casilleros
          opciones={APPRAISAL_AMENITIES}
          elegidas={extras.amenities}
          onToggle={(v) => onChange({ ...extras, amenities: alternar(extras.amenities, v) })}
        />
      </Desplegable>

      <Desplegable titulo="Situación de la propiedad">
        <div className="space-y-2">
          {([
            ['hasDeed', '¿Posee escritura?'],
            ['isRented', '¿Se encuentra alquilada?'],
            ['wasRenovated', '¿Fue refaccionada?'],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={extras.situation[k]}
                onChange={(e) =>
                  onChange({
                    ...extras,
                    situation: { ...extras.situation, [k]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
          {extras.situation.wasRenovated && (
            <div className="max-w-xs pt-2">
              <Input
                label="Año de la última refacción"
                inputMode="numeric"
                value={extras.situation.lastRenovationYear}
                onChange={(e) =>
                  onChange({
                    ...extras,
                    situation: { ...extras.situation, lastRenovationYear: e.target.value },
                  })
                }
              />
            </div>
          )}
        </div>
      </Desplegable>

      <Desplegable titulo="Valor estimado, motivo y plazo">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="¿Cuál creés que es su valor?"
            placeholder="Ej. 120.000 USD"
            value={extras.estimatedValue}
            onChange={(e) => onChange({ ...extras, estimatedValue: e.target.value })}
          />
          <Select
            label="Motivo de la tasación"
            options={motivos}
            placeholder="Sin especificar"
            value={extras.reason}
            onChange={(e) => onChange({ ...extras, reason: e.target.value })}
          />
          <Select
            label="Plazo para operar"
            options={plazos}
            placeholder="Sin especificar"
            value={extras.timeframe}
            onChange={(e) => onChange({ ...extras, timeframe: e.target.value })}
          />
        </div>
      </Desplegable>
    </div>
  )
}

function Desplegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-line bg-canvas/40">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">
        {titulo}
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  )
}

function Casilleros({
  opciones,
  elegidas,
  onToggle,
}: {
  opciones: string[]
  elegidas: string[]
  onToggle: (valor: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {opciones.map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={elegidas.includes(o)} onChange={() => onToggle(o)} />
          {o}
        </label>
      ))}
    </div>
  )
}
