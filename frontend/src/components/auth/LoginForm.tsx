import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import Button from '../common/Button'
import Input from '../common/Input'
import { loginFormSchema, type LoginForm as LoginFormValues, type SessionUser } from '../../api/schemas'
import { ApiError } from '../../lib/apiError'
import { useAuth } from '../../store/auth'

interface Props {
  onSuccess: (user: SessionUser) => void
}

export default function LoginForm({ onSuccess }: Props) {
  const login = useAuth((s) => s.login)
  const [failure, setFailure] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) })

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null)
    try {
      onSuccess(await login(values.email, values.password))
    } catch (err) {
      if (err instanceof ApiError) {
        // El backend puede devolver el campo exacto que falló (422).
        const emailIssue = err.issueFor('email')
        const passwordIssue = err.issueFor('password')
        if (emailIssue) setError('email', { message: emailIssue })
        if (passwordIssue) setError('password', { message: passwordIssue })
        if (!emailIssue && !passwordIssue) setFailure(err.message)
        return
      }
      setFailure('No se pudo iniciar sesión')
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
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="tu@inmobiliaria.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}
