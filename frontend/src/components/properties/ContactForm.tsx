import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import Button from '../common/Button'
import Input from '../common/Input'
import { sendInquiry } from '../../api/inquiries'
import { contactFormSchema, type ContactForm as ContactFormValues } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

interface Props {
  propertyId: string
  propertyTitle: string
}

/** Formulario de consulta de la ficha pública. Genera un lead real. */
export default function ContactForm({ propertyId, propertyTitle }: Props) {
  const [enviado, setEnviado] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      message: `Hola, me interesa la propiedad "${propertyTitle}". ¿Podemos coordinar una visita?`,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      await sendInquiry(propertyId, values)
      setEnviado(true)
    } catch (err) {
      if (err instanceof ApiError) {
        let porCampo = false
        for (const key of ['name', 'email', 'phone', 'message'] as const) {
          const issue = err.issueFor(key)
          if (issue) {
            setError(key, { message: issue })
            porCampo = true
          }
        }
        if (!porCampo) setFailure(err.message)
        return
      }
      setFailure('No se pudo enviar la consulta')
    }
  })

  if (enviado) {
    return (
      <div className="mt-4 rounded-md bg-brand/10 p-4">
        <p className="flex items-center gap-2 font-medium text-brand-dark">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          Consulta enviada
        </p>
        <p className="mt-1 text-sm text-brand-dark/80">
          La inmobiliaria la ve en su bandeja y se pone en contacto con vos.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
      {failure && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {failure}
        </p>
      )}

      <Input
        placeholder="Nombre y apellido"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        type="email"
        placeholder="Email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        type="tel"
        placeholder="Teléfono (opcional)"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />

      <label className="block">
        <span className="sr-only">Mensaje</span>
        <textarea
          rows={4}
          className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          {...register('message')}
        />
        {errors.message && (
          <span className="mt-1 block text-xs text-red-600">{errors.message.message}</span>
        )}
      </label>

      {/* Trampa para bots: oculta a la vista y fuera del orden de tabulación.
          Un humano no la ve; un bot que completa todo cae acá. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isSubmitting ? 'Enviando…' : 'Enviar consulta'}
      </Button>
    </form>
  )
}
