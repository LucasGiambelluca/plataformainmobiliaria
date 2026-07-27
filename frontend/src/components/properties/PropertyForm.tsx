import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import Button from '../common/Button'
import Input from '../common/Input'
import Select from '../common/Select'
import {
  propertyFormSchema,
  type PropertyDetail,
  type PropertyForm as PropertyFormValues,
} from '../../api/schemas'
import { createProperty, updateProperty } from '../../api/properties'
import { ApiError } from '../../lib/apiError'

import { operationOptions, typeOptions } from '../../lib/propertyLabels'

const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'ARS', label: 'ARS' },
]

interface Props {
  /** Sin propiedad = alta. Con propiedad = edición. */
  property?: PropertyDetail
  onSaved: (property: PropertyDetail) => void
  onCancel: () => void
}

function defaults(property?: PropertyDetail): Partial<PropertyFormValues> {
  if (!property) {
    return { propertyType: 'house', operationType: 'sale', currency: 'USD' }
  }
  const num = (value: string | null) => (value === null ? undefined : Number(value))
  return {
    title: property.title,
    description: property.description ?? '',
    propertyType: property.propertyType,
    operationType: property.operationType,
    price: property.price,
    currency: property.currency === 'ARS' ? 'ARS' : 'USD',
    address: property.address ?? '',
    city: property.city ?? '',
    state: property.state ?? '',
    areaM2: num(property.areaM2),
    rooms: property.rooms ?? undefined,
    bathrooms: property.bathrooms ?? undefined,
    parking: property.parking ?? undefined,
    floor: property.floor ?? undefined,
    yearBuilt: property.yearBuilt ?? undefined,
    features: property.features.join(', '),
  }
}

export default function PropertyForm({ property, onSaved, onCancel }: Props) {
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues: defaults(property),
  })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      onSaved(
        property
          ? await updateProperty(property.id, values)
          : await createProperty(values),
      )
    } catch (err) {
      if (err instanceof ApiError) {
        // El backend nombra el campo cuando la validación falla del otro lado.
        let porCampo = false
        for (const key of ['title', 'price', 'propertyType', 'operationType'] as const) {
          const issue = err.issueFor(key)
          if (issue) {
            setError(key, { message: issue })
            porCampo = true
          }
        }
        if (!porCampo) setFailure(err.message)
        return
      }
      setFailure('No se pudo guardar la propiedad')
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {failure && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {failure}
        </p>
      )}

      <Input
        label="Título"
        placeholder="Casa 3 ambientes en Paraná"
        error={errors.title?.message}
        {...register('title')}
      />

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Descripción</span>
        <textarea
          rows={3}
          placeholder="Detalles, estado, entorno…"
          className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          {...register('description')}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Operación"
          options={operationOptions}
          error={errors.operationType?.message}
          {...register('operationType')}
        />
        <Select
          label="Tipo"
          options={typeOptions}
          error={errors.propertyType?.message}
          {...register('propertyType')}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Input
          label="Precio"
          inputMode="decimal"
          placeholder="185000.00"
          error={errors.price?.message}
          {...register('price')}
        />
        <Select
          label="Moneda"
          options={currencyOptions}
          className="w-28"
          {...register('currency')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Ciudad" error={errors.city?.message} {...register('city')} />
        <Input label="Provincia" error={errors.state?.message} {...register('state')} />
      </div>

      <Input label="Dirección" error={errors.address?.message} {...register('address')} />

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Superficie m²"
          type="number"
          error={errors.areaM2?.message}
          {...register('areaM2')}
        />
        <Input
          label="Ambientes"
          type="number"
          error={errors.rooms?.message}
          {...register('rooms')}
        />
        <Input
          label="Baños"
          type="number"
          error={errors.bathrooms?.message}
          {...register('bathrooms')}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Cocheras"
          type="number"
          error={errors.parking?.message}
          {...register('parking')}
        />
        <Input label="Piso" type="number" error={errors.floor?.message} {...register('floor')} />
        <Input
          label="Año"
          type="number"
          error={errors.yearBuilt?.message}
          {...register('yearBuilt')}
        />
      </div>

      <Input
        label="Características"
        placeholder="Parrilla, Pileta, Patio"
        error={errors.features?.message}
        {...register('features')}
      />
      <p className="-mt-2 text-xs text-muted">Separalas con comas.</p>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {property ? 'Guardar cambios' : 'Crear propiedad'}
        </Button>
      </div>
    </form>
  )
}
