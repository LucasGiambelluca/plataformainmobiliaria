import { api, getJson, patchJson, postJson } from '../lib/api'
import {
  userResponseSchema,
  usersResponseSchema,
  type AgentForm,
  type TenantRole,
  type TenantUser,
} from './schemas'

/** Equipo de la inmobiliaria de la sesión. Solo lo ve un tenant_admin. */
export async function listTeam(): Promise<TenantUser[]> {
  const { users } = await getJson('/users', usersResponseSchema)
  return users
}

export async function createTeamMember(form: AgentForm): Promise<TenantUser> {
  const { user } = await postJson('/users', userResponseSchema, {
    name: form.name,
    email: form.email,
    password: form.password,
    role: form.role,
    // El backend rechaza la cadena vacía: se manda el campo o no se manda.
    ...(form.phone ? { phone: form.phone } : {}),
  })
  return user
}

export async function updateTeamMember(
  id: string,
  data: { name?: string; phone?: string; role?: TenantRole; isActive?: boolean },
): Promise<TenantUser> {
  const { user } = await patchJson(`/users/${id}`, userResponseSchema, data)
  return user
}

/**
 * Da de baja al usuario. No lo borra: sus propiedades y su historial siguen
 * existiendo, así que se desactiva y deja de poder entrar.
 */
export async function deactivateTeamMember(id: string): Promise<void> {
  await api.delete(`/users/${id}`)
}
