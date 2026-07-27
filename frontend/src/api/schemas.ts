import { z } from 'zod'

// Espejo de los contratos del backend (mismos enums que prisma/schema.prisma).
// Se validan las respuestas para que un cambio de forma en la API explote acá
// y no diez componentes más abajo con un `undefined`.

export const userRoleSchema = z.enum(['super_admin', 'tenant_admin', 'agent'])
export type UserRole = z.infer<typeof userRoleSchema>

export const subscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'suspended',
])
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

export const billingIntervalSchema = z.enum(['monthly', 'yearly'])
export type BillingInterval = z.infer<typeof billingIntervalSchema>

// Los Decimal de Prisma se serializan como string; se acepta number por las
// dudas y se normaliza a string para no perder precisión con plata.
const decimalString = z.union([z.string(), z.number()]).transform(String)

/* ----------------------------- auth ----------------------------- */

export const sessionUserSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  email: z.string(),
  role: userRoleSchema,
  name: z.string().nullable(),
})
export type SessionUser = z.infer<typeof sessionUserSchema>

export const authResponseSchema = z.object({
  user: sessionUserSchema,
  accessToken: z.string(),
})
export type AuthResponse = z.infer<typeof authResponseSchema>

export const registerResponseSchema = authResponseSchema.extend({
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    isActive: z.boolean(),
  }),
})
export type RegisterResponse = z.infer<typeof registerResponseSchema>

/* ----------------------------- planes ----------------------------- */

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  priceAmount: decimalString,
  priceCurrency: z.string(),
  billingInterval: billingIntervalSchema,
  maxProperties: z.number(),
  maxUsers: z.number(),
  maxStorageMb: z.number(),
  isActive: z.boolean(),
})
export type Plan = z.infer<typeof planSchema>

export const plansResponseSchema = z.object({ plans: z.array(planSchema) })
export const planResponseSchema = z.object({ plan: planSchema })

/* --------------------------- inmobiliarias --------------------------- */

const tenantSubscriptionSchema = z.object({
  id: z.string(),
  status: subscriptionStatusSchema,
  plan: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
})

export const tenantListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  contactEmail: z.string().nullable(),
  createdAt: z.string(),
  // El backend devuelve solo la suscripción vigente (take: 1).
  subscriptions: z.array(tenantSubscriptionSchema),
  _count: z.object({ properties: z.number(), users: z.number() }),
})
export type TenantListItem = z.infer<typeof tenantListItemSchema>

export const tenantListResponseSchema = z.object({
  items: z.array(tenantListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type TenantListResponse = z.infer<typeof tenantListResponseSchema>

// PATCH /admin/tenants/:id devuelve el tenant crudo, sin subscriptions ni _count.
export const tenantUpdateResponseSchema = z.object({
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    isActive: z.boolean(),
  }),
})

export const tenantProvisionResponseSchema = z.object({
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    isActive: z.boolean(),
  }),
  user: z.object({
    id: z.string(),
    tenantId: z.string(),
    email: z.string(),
    role: userRoleSchema,
    name: z.string().nullable(),
  }),
})

/* --------------------------- suscripción --------------------------- */

const resourceUsageSchema = z.object({ used: z.number(), limit: z.number() })

export const subscriptionStatusResponseSchema = z.object({
  subscription: z.object({
    id: z.string(),
    status: subscriptionStatusSchema,
    currentPeriodStart: z.string().nullable(),
    currentPeriodEnd: z.string().nullable(),
    cancelAtPeriodEnd: z.boolean(),
    plan: planSchema.omit({ isActive: true }),
  }),
  usage: z.object({
    users: resourceUsageSchema,
    properties: resourceUsageSchema,
    storageMb: resourceUsageSchema,
  }),
})
export type SubscriptionStatusResponse = z.infer<typeof subscriptionStatusResponseSchema>

/* ------------------------- entradas (forms) ------------------------- */

// Mismas reglas que backend/src/modules/**/**.schemas.ts: el usuario ve el
// error antes de que salga el request, y el backend igual vuelve a validar.

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'El slug debe tener al menos 3 caracteres')
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug inválido: usá minúsculas, números y guiones')

export const emailSchema = z.string().trim().toLowerCase().email('Email inválido')
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')

export const loginFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})
export type LoginForm = z.infer<typeof loginFormSchema>

export const registerFormSchema = z.object({
  tenantName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(255),
  slug: slugSchema,
  name: z.string().trim().min(2, 'Ingresá tu nombre').max(255).optional().or(z.literal('')),
  email: emailSchema,
  password: passwordSchema,
})
export type RegisterForm = z.infer<typeof registerFormSchema>

export const tenantFormSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(255),
  slug: slugSchema,
  planId: z.string().uuid('Elegí un plan'),
})
export type TenantForm = z.infer<typeof tenantFormSchema>

export const newTenantFormSchema = tenantFormSchema.omit({ planId: true }).extend({
  adminEmail: emailSchema,
  adminPassword: passwordSchema,
  adminName: z.string().trim().min(2).max(255).optional().or(z.literal('')),
})
export type NewTenantForm = z.infer<typeof newTenantFormSchema>

const positiveInt = (label: string) =>
  z.coerce.number().int(`${label} debe ser un número entero`).positive(`${label} debe ser mayor a 0`)

export const planFormSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  slug: slugSchema,
  priceAmount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Monto inválido: usá formato decimal, ej. 29999.99'),
  maxProperties: positiveInt('El máximo de propiedades'),
  maxUsers: positiveInt('El máximo de usuarios'),
  maxStorageMb: positiveInt('El almacenamiento'),
})
export type PlanForm = z.infer<typeof planFormSchema>
