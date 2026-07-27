import { create } from 'zustand'
import { refreshSession } from '../lib/api'
import { setAccessToken, setSessionExpiredHandler } from '../lib/session'
import * as authApi from '../api/auth'
import type { RegisterForm, SessionUser } from '../api/schemas'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthState {
  user: SessionUser | null
  status: AuthStatus
  /** Rehidrata la sesión al abrir la app usando la cookie de refresh. */
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<SessionUser>
  register: (form: RegisterForm) => Promise<SessionUser>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  async bootstrap() {
    try {
      // El access token vive solo en memoria, así que tras un F5 no hay nada
      // que restaurar: se pide uno nuevo con la cookie httpOnly. Se usa el
      // mismo refresh compartido que el interceptor para no mandar dos veces
      // la misma cookie en paralelo (StrictMode monta el efecto dos veces).
      const { user } = await refreshSession()
      set({ user, status: 'authenticated' })
    } catch {
      // Sin cookie válida: visitante anónimo. No es un error a mostrar.
      setAccessToken(null)
      set({ user: null, status: 'anonymous' })
    }
  },

  async login(email, password) {
    const { user, accessToken } = await authApi.login(email, password)
    setAccessToken(accessToken)
    set({ user, status: 'authenticated' })
    return user
  },

  async register(form) {
    const { user, accessToken } = await authApi.register(form)
    setAccessToken(accessToken)
    set({ user, status: 'authenticated' })
    return user
  },

  async logout() {
    try {
      await authApi.logout()
    } finally {
      // Aunque el backend falle, la sesión local se cierra igual.
      setAccessToken(null)
      set({ user: null, status: 'anonymous' })
    }
  },
}))

// El cliente HTTP avisa cuando el refresh falla en medio de la navegación.
setSessionExpiredHandler(() => {
  useAuth.setState({ user: null, status: 'anonymous' })
})

/** Ruta por defecto de cada rol después de iniciar sesión. */
export function homeFor(user: SessionUser): string {
  return user.role === 'super_admin' ? '/admin' : '/panel'
}
