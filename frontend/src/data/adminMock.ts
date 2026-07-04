export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'Básico' | 'Pro' | 'Enterprise'
  status: 'active' | 'trialing' | 'past_due' | 'suspended'
  properties: number
  users: number
  joined: string
}

export interface Plan {
  id: string
  name: string
  price: number
  interval: 'mes' | 'año'
  maxProperties: number
  maxUsers: number
  maxStorageGb: number
  active: boolean
  tenants: number
}

export interface GlobalDomain {
  id: string
  domain: string
  tenant: string
  status: 'pending' | 'verifying' | 'active' | 'failed'
}

export interface AuditLog {
  id: string
  user: string
  tenant: string
  action: string
  entity: string
  date: string
}

export const tenants: Tenant[] = [
  { id: 't1', name: 'Inmobiliaria Norte', slug: 'norte', plan: 'Pro', status: 'active', properties: 38, users: 4, joined: '2025-02-11' },
  { id: 't2', name: 'Sur Propiedades', slug: 'sur', plan: 'Básico', status: 'active', properties: 22, users: 2, joined: '2025-04-02' },
  { id: 't3', name: 'Quilmes Hogar', slug: 'quilmes-hogar', plan: 'Pro', status: 'trialing', properties: 9, users: 2, joined: '2026-05-20' },
  { id: 't4', name: 'Echeverría Estates', slug: 'echeverria', plan: 'Enterprise', status: 'active', properties: 120, users: 9, joined: '2024-11-08' },
  { id: 't5', name: 'Lanús Comercial', slug: 'lanus-comercial', plan: 'Básico', status: 'past_due', properties: 15, users: 1, joined: '2025-08-19' },
  { id: 't6', name: 'Bera Rentas', slug: 'bera-rentas', plan: 'Básico', status: 'suspended', properties: 6, users: 1, joined: '2025-09-30' },
]

export const plans: Plan[] = [
  { id: 'p1', name: 'Básico', price: 24900, interval: 'mes', maxProperties: 30, maxUsers: 2, maxStorageGb: 5, active: true, tenants: 3 },
  { id: 'p2', name: 'Pro', price: 59900, interval: 'mes', maxProperties: 100, maxUsers: 10, maxStorageGb: 20, active: true, tenants: 2 },
  { id: 'p3', name: 'Enterprise', price: 119900, interval: 'mes', maxProperties: 9999, maxUsers: 9999, maxStorageGb: 100, active: true, tenants: 1 },
]

export const globalDomains: GlobalDomain[] = [
  { id: 'gd1', domain: 'www.inmobiliaria-norte.com', tenant: 'Inmobiliaria Norte', status: 'active' },
  { id: 'gd2', domain: 'propiedades.norte.com.ar', tenant: 'Inmobiliaria Norte', status: 'verifying' },
  { id: 'gd3', domain: 'www.echeverria-estates.com', tenant: 'Echeverría Estates', status: 'active' },
  { id: 'gd4', domain: 'sur-propiedades.com', tenant: 'Sur Propiedades', status: 'pending' },
  { id: 'gd5', domain: 'lanus.com.ar', tenant: 'Lanús Comercial', status: 'failed' },
]

export const auditLogs: AuditLog[] = [
  { id: 'a1', user: 'Ana Gómez', tenant: 'Inmobiliaria Norte', action: 'property.create', entity: 'Casa 3 ambientes', date: '2026-06-12 09:14' },
  { id: 'a2', user: 'Super Admin', tenant: '—', action: 'tenant.suspend', entity: 'Bera Rentas', date: '2026-06-11 18:02' },
  { id: 'a3', user: 'Diego Ruiz', tenant: 'Sur Propiedades', action: 'auth.login', entity: 'sesión', date: '2026-06-11 08:47' },
  { id: 'a4', user: 'Ana Gómez', tenant: 'Inmobiliaria Norte', action: 'domain.verify', entity: 'www.inmobiliaria-norte.com', date: '2026-06-10 15:30' },
  { id: 'a5', user: 'Super Admin', tenant: '—', action: 'plan.update', entity: 'Pro', date: '2026-06-09 11:20' },
  { id: 'a6', user: 'Marta Díaz', tenant: 'Echeverría Estates', action: 'property.delete', entity: 'Lote 12', date: '2026-06-08 17:05' },
]

export const tenantStatusLabels: Record<Tenant['status'], string> = {
  active: 'Activa',
  trialing: 'Trial',
  past_due: 'Pago vencido',
  suspended: 'Suspendida',
}

export const tenantStatusTone: Record<
  Tenant['status'],
  'success' | 'brand' | 'warning' | 'danger'
> = {
  active: 'success',
  trialing: 'brand',
  past_due: 'warning',
  suspended: 'danger',
}

// Monthly revenue (last 6 months, ARS) for the dashboard chart.
export const revenueSeries = [
  { month: 'Ene', value: 5040000 },
  { month: 'Feb', value: 5520000 },
  { month: 'Mar', value: 6120000 },
  { month: 'Abr', value: 6480000 },
  { month: 'May', value: 7260000 },
  { month: 'Jun', value: 7776000 },
]
