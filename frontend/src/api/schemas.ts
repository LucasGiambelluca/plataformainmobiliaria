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

// ── Equipo de la inmobiliaria (agentes y administradores) ──────────

/** super_admin nunca se crea desde acá: es de la plataforma, no del tenant. */
export const tenantRoleSchema = z.enum(['tenant_admin', 'agent'])
export type TenantRole = z.infer<typeof tenantRoleSchema>

export const tenantUserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string(),
  role: tenantRoleSchema,
  name: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
})
export type TenantUser = z.infer<typeof tenantUserSchema>

export const usersResponseSchema = z.object({ users: z.array(tenantUserSchema) })
export const userResponseSchema = z.object({ user: tenantUserSchema })

/** Espejo de createUserSchema del backend. */
export const agentFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(255),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  role: tenantRoleSchema,
})
export type AgentForm = z.infer<typeof agentFormSchema>

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
  maxDomains: z.number(),
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

/**
 * Sesión de soporte sobre una inmobiliaria. No trae refresh token: la cookie
 * httpOnly sigue siendo la del super admin, y volver a ser él es pedirle al
 * backend un token nuevo con esa cookie.
 */
export const impersonationResponseSchema = z.object({
  accessToken: z.string(),
  expiresAt: z.string(),
  user: sessionUserSchema,
  tenant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
})
export type ImpersonationResponse = z.infer<typeof impersonationResponseSchema>

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
    domains: resourceUsageSchema,
  }),
})
export type SubscriptionStatusResponse = z.infer<typeof subscriptionStatusResponseSchema>

/* --------------------------- propiedades --------------------------- */

export const propertyTypeSchema = z.enum([
  'apartment',
  'house',
  'land',
  'office',
  'warehouse',
  'commercial',
])
export type PropertyType = z.infer<typeof propertyTypeSchema>

export const operationTypeSchema = z.enum(['sale', 'rent', 'temporary_rental'])
export type OperationType = z.infer<typeof operationTypeSchema>

export const propertyStatusSchema = z.enum(['draft', 'published', 'paused', 'featured'])
export type PropertyStatus = z.infer<typeof propertyStatusSchema>

export const mediaTypeSchema = z.enum(['image', 'video'])
export const mediaStatusSchema = z.enum(['processing', 'ready', 'failed'])
export type MediaStatus = z.infer<typeof mediaStatusSchema>

export const propertyMediaSchema = z.object({
  id: z.string(),
  type: mediaTypeSchema,
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  /** Solo en video: lo mide el navegador al subirlo. */
  durationSec: z.number().nullable(),
  sizeBytes: z.number(),
  sortOrder: z.number(),
  isCover: z.boolean(),
  status: mediaStatusSchema,
})
export type PropertyMedia = z.infer<typeof propertyMediaSchema>

// Campos comunes al listado y al detalle.
const propertyBase = {
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  propertyType: propertyTypeSchema,
  operationType: operationTypeSchema,
  price: decimalString,
  currency: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  lat: decimalString.nullable(),
  lng: decimalString.nullable(),
  areaM2: decimalString.nullable(),
  rooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  parking: z.number().nullable(),
  floor: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  status: propertyStatusSchema,
  viewsCount: z.number(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}

export const propertyDetailSchema = z.object({
  ...propertyBase,
  features: z.array(z.string()),
  media: z.array(propertyMediaSchema),
})
export type PropertyDetail = z.infer<typeof propertyDetailSchema>

export const propertyListItemSchema = z.object({
  ...propertyBase,
  coverUrl: z.string().nullable(),
  mediaCount: z.number(),
})
export type PropertyListItem = z.infer<typeof propertyListItemSchema>

export const propertyListResponseSchema = z.object({
  items: z.array(propertyListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type PropertyListResponse = z.infer<typeof propertyListResponseSchema>

export const propertyResponseSchema = z.object({ property: propertyDetailSchema })
export const mediaListResponseSchema = z.object({ media: z.array(propertyMediaSchema) })
export const mediaResponseSchema = z.object({ media: propertyMediaSchema })

export const signedUploadResponseSchema = z.object({
  media: propertyMediaSchema,
  upload: z.object({
    uploadUrl: z.string(),
    // El navegador DEBE mandar exactamente este Content-Type: va en la firma.
    contentType: z.string(),
    expiresAt: z.string(),
  }),
})
export type SignedUploadResponse = z.infer<typeof signedUploadResponseSchema>

/* --------------------------- sitio público --------------------------- */

const publicAgencySchema = z.object({
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
})

export const publicPropertyCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  propertyType: propertyTypeSchema,
  operationType: operationTypeSchema,
  price: decimalString,
  currency: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  rooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  areaM2: decimalString.nullable(),
  featured: z.boolean(),
  coverUrl: z.string().nullable(),
  agency: publicAgencySchema,
})
export type PublicPropertyCard = z.infer<typeof publicPropertyCardSchema>

export const publicCatalogResponseSchema = z.object({
  items: z.array(publicPropertyCardSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type PublicCatalogResponse = z.infer<typeof publicCatalogResponseSchema>

export const publicPropertyDetailSchema = publicPropertyCardSchema.extend({
  description: z.string().nullable(),
  country: z.string().nullable(),
  lat: decimalString.nullable(),
  lng: decimalString.nullable(),
  parking: z.number().nullable(),
  floor: z.number().nullable(),
  yearBuilt: z.number().nullable(),
  viewsCount: z.number(),
  createdAt: z.string(),
  features: z.array(z.string()),
  media: z.array(
    z.object({
      id: z.string(),
      type: mediaTypeSchema,
      url: z.string(),
      thumbnailUrl: z.string().nullable(),
    }),
  ),
  agencyContact: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    description: z.string().nullable(),
  }),
})
export type PublicPropertyDetail = z.infer<typeof publicPropertyDetailSchema>

export const publicPropertyResponseSchema = z.object({
  property: publicPropertyDetailSchema,
})

export const publicAgenciesResponseSchema = z.object({
  agencies: z.array(
    publicAgencySchema.extend({
      id: z.string(),
      description: z.string().nullable(),
      contactEmail: z.string().nullable(),
      contactPhone: z.string().nullable(),
      propertiesCount: z.number(),
      /** Localidades donde publica, de la que más tiene a la que menos. */
      cities: z.array(z.string()),
      /** Sin la web publicada no se ofrece el enlace: daría 404. */
      hasPublishedSite: z.boolean(),
    }),
  ),
})
export type PublicAgency = z.infer<
  typeof publicAgenciesResponseSchema
>['agencies'][number]

export const publicPlansResponseSchema = z.object({
  plans: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      priceAmount: decimalString,
      priceCurrency: z.string(),
      billingInterval: z.string(),
      maxProperties: z.number(),
      maxUsers: z.number(),
      maxStorageMb: z.number(),
      maxDomains: z.number(),
    }),
  ),
})
export type PublicPlan = z.infer<typeof publicPlansResponseSchema>['plans'][number]

export const checkoutResponseSchema = z.object({ redirectUrl: z.string().url() })

export const publicCitiesResponseSchema = z.object({
  cities: z.array(z.object({ city: z.string(), count: z.number() })),
})

/**
 * Catálogo de localidades donde opera la plataforma.
 *
 * Distinto de `cities`: eso son las localidades que hoy tienen propiedades
 * publicadas, con su conteo, y sirve para filtrar. Esto es la lista completa y
 * es la que llena los desplegables del alta de propiedad y del formulario de
 * tasación, donde hay que poder elegir una localidad en la que todavía no
 * publicó nadie.
 *
 * La lista no se escribe de este lado a propósito: el backend valida contra la
 * suya y rechaza cualquier otra cosa, así que una copia acá que se desactualice
 * ofrecería opciones que el servidor contesta con 422.
 */
export const publicLocalidadesResponseSchema = z.object({
  localidades: z.array(z.string()),
})

/* ----------------------- web de la inmobiliaria ----------------------- */

export const carouselImageSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  linkUrl: z.string().nullable(),
  caption: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
})
export type CarouselImage = z.infer<typeof carouselImageSchema>

const siteAppearanceSchema = z.object({
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  heroTitle: z.string().nullable(),
  heroSubtitle: z.string().nullable(),
  aboutText: z.string().nullable(),
  socialFacebook: z.string().nullable(),
  socialInstagram: z.string().nullable(),
  socialWhatsapp: z.string().nullable(),
  showFeaturedOnly: z.boolean(),
  template: z.string().nullable(),
})

export const publicSiteSchema = z.object({
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    logoUrl: z.string().nullable(),
    description: z.string().nullable(),
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
  }),
  site: siteAppearanceSchema,
  carousel: z.array(carouselImageSchema),
})
export type PublicSite = z.infer<typeof publicSiteSchema>

/** Config propia: agrega los campos que solo ve la inmobiliaria. */
export const ownSiteSchema = siteAppearanceSchema.extend({
  id: z.string(),
  tenantId: z.string(),
  // El slug no viaja en el JWT: viene con la config para armar el enlace.
  slug: z.string(),
  tenantName: z.string(),
  isPublished: z.boolean(),
  carousel: z.array(carouselImageSchema),
})
export type OwnSite = z.infer<typeof ownSiteSchema>

export const ownSiteResponseSchema = z.object({ site: ownSiteSchema })
export const carouselImageResponseSchema = z.object({ image: carouselImageSchema })
export const carouselListResponseSchema = z.object({
  carousel: z.array(carouselImageSchema),
})

export const carouselUploadResponseSchema = z.object({
  image: carouselImageSchema,
  upload: z.object({
    uploadUrl: z.string(),
    contentType: z.string(),
    expiresAt: z.string(),
  }),
})

export const siteFormSchema = z.object({
  heroTitle: z.string().trim().max(160).optional().or(z.literal('')),
  heroSubtitle: z.string().trim().max(240).optional().or(z.literal('')),
  aboutText: z.string().trim().max(4000).optional().or(z.literal('')),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Usá formato #RRGGBB')
    .optional()
    .or(z.literal('')),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Usá formato #RRGGBB')
    .optional()
    .or(z.literal('')),
  socialFacebook: z.string().trim().url('URL inválida').optional().or(z.literal('')),
  socialInstagram: z.string().trim().url('URL inválida').optional().or(z.literal('')),
  socialWhatsapp: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{6,30}$/, 'Teléfono inválido')
    .optional()
    .or(z.literal('')),
  showFeaturedOnly: z.boolean().optional(),
})
export type SiteForm = z.infer<typeof siteFormSchema>

/* ---------------------------- consultas ---------------------------- */

export const inquiryStatusSchema = z.enum(['new', 'contacted', 'closed'])
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>

export const inquirySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  propertyId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  message: z.string(),
  status: inquiryStatusSchema,
  createdAt: z.string(),
  propertyTitle: z.string().nullable(),
})
export type Inquiry = z.infer<typeof inquirySchema>

export const inquiryListResponseSchema = z.object({
  items: z.array(inquirySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  newCount: z.number(),
})
export type InquiryListResponse = z.infer<typeof inquiryListResponseSchema>

export const inquiryResponseSchema = z.object({ inquiry: inquirySchema })

/** El alta pública responde lo mínimo: confirma y nada más. */
export const inquiryCreatedSchema = z.object({ ok: z.boolean() })

export const contactFormSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá tu nombre').max(255),
  // Inline y no `emailSchema`: esa constante se declara más abajo en el
  // archivo, y usarla acá rompería por temporal dead zone al cargar el módulo.
  email: z.string().trim().toLowerCase().email('Email inválido').max(255),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  message: z
    .string()
    .trim()
    .min(10, 'Contanos un poco más (mínimo 10 caracteres)')
    .max(2000, 'El mensaje es demasiado largo'),
  // Campo trampa, oculto por CSS. Un humano nunca lo completa.
  website: z.string().max(200).optional(),
})
export type ContactForm = z.infer<typeof contactFormSchema>

/* --------------------------- métricas --------------------------- */

export const platformMetricsSchema = z.object({
  tenants: z.object({ total: z.number(), active: z.number(), suspended: z.number() }),
  subscriptions: z.object({
    active: z.number(),
    trialing: z.number(),
    pastDue: z.number(),
    canceled: z.number(),
  }),
  mrr: decimalString,
  revenueLast6Months: decimalString,
  properties: z.object({ total: z.number(), published: z.number() }),
  inquiriesLast30Days: z.number(),
  revenueSeries: z.array(z.object({ month: z.string(), amount: decimalString })),
  topAgencies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      properties: z.number(),
    }),
  ),
})
export type PlatformMetrics = z.infer<typeof platformMetricsSchema>

export const tenantMetricsSchema = z.object({
  properties: z.object({
    total: z.number(),
    published: z.number(),
    draft: z.number(),
    featured: z.number(),
  }),
  viewsTotal: z.number(),
  inquiries: z.object({ total: z.number(), new: z.number(), last30Days: z.number() }),
  topProperties: z.array(
    z.object({ id: z.string(), title: z.string(), viewsCount: z.number() }),
  ),
})
export type TenantMetrics = z.infer<typeof tenantMetricsSchema>

export const platformMetricsResponseSchema = z.object({ metrics: platformMetricsSchema })
export const tenantMetricsResponseSchema = z.object({ metrics: tenantMetricsSchema })

/* --------------------------- auditoría --------------------------- */

export const auditRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  tenantName: z.string().nullable(),
  userId: z.string().nullable(),
  userEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  metadata: z.unknown(),
  createdAt: z.string(),
})
export type AuditRecord = z.infer<typeof auditRecordSchema>

export const auditListResponseSchema = z.object({
  items: z.array(auditRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type AuditListResponse = z.infer<typeof auditListResponseSchema>

export const auditActionsResponseSchema = z.object({ actions: z.array(z.string()) })

/* --------------------------- dominios --------------------------- */

export const domainStatusSchema = z.enum(['pending', 'verifying', 'active', 'failed'])
export type DomainStatus = z.infer<typeof domainStatusSchema>

export const customDomainSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  domain: z.string(),
  status: domainStatusSchema,
  dnsTarget: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type CustomDomain = z.infer<typeof customDomainSchema>

export const domainListResponseSchema = z.object({
  domains: z.array(customDomainSchema),
  // Adónde hay que apuntar el DNS. Viaja siempre, incluso sin dominios
  // cargados: es lo que el panel muestra en las instrucciones.
  dnsTarget: z.string(),
})

export const domainResponseSchema = z.object({ domain: customDomainSchema })

/** La verificación devuelve el porqué cuando no pasó, para mostrarlo tal cual. */
export const domainVerifyResponseSchema = z.object({
  domain: customDomainSchema,
  detail: z.string().nullable(),
})
export type DomainVerifyResult = z.infer<typeof domainVerifyResponseSchema>

/** Vista del super admin: el dominio más de quién es. */
export const adminDomainSchema = customDomainSchema.extend({
  tenantName: z.string(),
  tenantSlug: z.string(),
})
export type AdminDomain = z.infer<typeof adminDomainSchema>

export const adminDomainListResponseSchema = z.object({
  items: z.array(adminDomainSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})
export type AdminDomainListResponse = z.infer<typeof adminDomainListResponseSchema>

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

// Mismas reglas que backend/src/modules/properties/properties.schemas.ts.
// Los numéricos llegan como string desde los <input>, de ahí el coerce; los
// vacíos se normalizan a undefined para no mandar 0 donde el usuario no cargó.
const optionalInt = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), {
      message: `${label} tiene que ser un número entero`,
    })
    .optional()

export const propertyFormSchema = z.object({
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(255),
  description: z.string().trim().max(20_000).optional().or(z.literal('')),
  propertyType: propertyTypeSchema,
  operationType: operationTypeSchema,
  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Precio inválido: usá formato decimal, ej. 185000.00'),
  currency: z.enum(['USD', 'ARS']),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  // Obligatoria y del catálogo del backend: sin localidad la propiedad no sale
  // en el filtro del portal ni cuenta para el reparto de tasaciones.
  city: z.string().trim().min(1, 'Elegí una localidad'),
  // La provincia no se carga: sale de `PROVINCIA` en lib/localidades.ts, porque
  // todas las localidades del catálogo son de Entre Ríos.
  areaM2: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null ? undefined : Number(v)))
    .refine((v) => v === undefined || v > 0, { message: 'La superficie debe ser mayor a 0' })
    .optional(),
  rooms: optionalInt('Los ambientes'),
  bathrooms: optionalInt('Los baños'),
  parking: optionalInt('Las cocheras'),
  floor: optionalInt('El piso'),
  yearBuilt: optionalInt('El año'),
  // Se escriben separadas por coma en un solo campo.
  features: z.string().trim().max(1000).optional().or(z.literal('')),
})
export type PropertyForm = z.infer<typeof propertyFormSchema>

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
  // 0 es válido: un plan de entrada no incluye dominio propio.
  maxDomains: z.coerce
    .number()
    .int('El máximo de dominios debe ser un número entero')
    .nonnegative('El máximo de dominios no puede ser negativo'),
})
export type PlanForm = z.infer<typeof planFormSchema>

// Mismas reglas que backend/src/modules/domains/domains.schemas.ts: se acepta
// que peguen la URL entera del navegador y se limpia acá antes de mandarla.
const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,}$/

export const domainFormSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, ''))
    .refine((v) => v.length <= 253, 'El dominio es demasiado largo')
    .refine((v) => HOSTNAME.test(v), 'Dominio inválido. Ejemplo: midominio.com.ar'),
})
export type DomainForm = z.infer<typeof domainFormSchema>

/* ------------------------------ calculadoras ------------------------------ */

// Espejo de backend/src/modules/calculators/. Los índices son públicos y
// nacionales: no hay tenant en ninguno de estos contratos.

/**
 * Una serie es lo que el backend diga que es.
 *
 * Acá no hay lista: `catalogo.ts` del backend es la única fuente de verdad y
 * `GET /calculators/indices` la devuelve entera con su metadata. Copiarla de
 * este lado —como estaba— hacía que retirar una serie rompiera el parse de Zod
 * y matara la pantalla entera en vez de degradar a las que sí quedan, que es
 * exactamente el motivo por el que el catálogo de localidades tampoco se
 * duplica.
 */
export type Serie = string

const estadoSerieSchema = z.object({
  desde: z.string(),
  hasta: z.string(),
  /** Null si nunca se pudo bajar la serie del organismo oficial. */
  sincronizadoEn: z.string().nullable(),
  /** Lo que dice el botón. Sale del catálogo del backend, no de una lista de acá. */
  etiqueta: z.string(),
  nombre: z.string(),
  organismo: z.string(),
  frecuencia: z.enum(['diaria', 'mensual']),
})
export type EstadoSerie = z.infer<typeof estadoSerieSchema>

/**
 * Mapa de series, sin claves fijas.
 *
 * El backend omite las series que no pudo resolver, así que la respuesta es
 * parcial por diseño: si el INDEC está caído para el IPIM, llegan las otras
 * cinco y la calculadora funciona con esas. Exigir las seis por nombre —como
 * estaba— convertía la caída de un organismo en una pantalla rota.
 */
export const indicesResponseSchema = z.record(z.string(), estadoSerieSchema)
export type Indices = z.infer<typeof indicesResponseSchema>

const tramoSchema = z.object({
  numero: z.number(),
  fecha: z.string(),
  indice: z.number(),
  /** Fracción, no porcentaje: 0.3047 son 30,47 %. */
  aumento: z.number(),
  valor: z.number(),
})
export type Tramo = z.infer<typeof tramoSchema>

export const cronogramaResultSchema = z.object({
  serie: z.string(),
  // Al menos uno: el backend tira 422 antes de devolver un cronograma vacío, y
  // la pantalla lee el último tramo sin preguntar. Fijarlo acá hace que una
  // respuesta vacía sea un error de red y no un TypeError en pleno render.
  tramos: z.array(tramoSchema).min(1),
  sincronizadoEn: z.string().nullable(),
})
export type CronogramaResult = z.infer<typeof cronogramaResultSchema>

// El monto llega como string desde el input y sale como number para el body.
const montoContrato = z
  .string()
  .trim()
  .min(1, 'Ingresá el monto del contrato')
  .regex(/^\d+(?:[.,]\d{1,2})?$/, 'Monto inválido: usá solo números, ej. 250000')
  .transform((v) => Number(v.replace(',', '.')))
  .refine((v) => v > 0, 'El monto tiene que ser mayor a cero')

const fechaContrato = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí una fecha')

export const cronogramaFormSchema = z.object({
  montoInicial: montoContrato,
  fechaInicio: fechaContrato,
  mesesPeriodo: z.coerce.number().int().min(1).max(12),
  // Qué series valen lo decide el backend: acá solo se exige haber elegido una.
  serie: z.string().min(1, 'Elegí un índice'),
})
export type CronogramaForm = z.infer<typeof cronogramaFormSchema>

/* ------------------------------- tasaciones ------------------------------- */

// Espejo de backend/src/modules/appraisals/. La solicitud la manda un
// propietario sin cuenta; la bandeja la lee la inmobiliaria asignada.

export const APPRAISAL_PROPERTY_TYPES = [
  'house', 'apartment', 'ph', 'duplex', 'commercial', 'office',
  'warehouse', 'land', 'farm', 'country_house', 'ranch', 'other',
] as const

export const APPRAISAL_PURPOSES = ['sale', 'rent', 'sale_and_rent', 'other'] as const

export const APPRAISAL_CONDITIONS = [
  'excellent', 'very_good', 'good', 'fair', 'to_renovate',
] as const

export const APPRAISAL_REASONS = [
  'sale', 'rent', 'inheritance', 'division', 'investment', 'moving', 'other',
] as const

export const APPRAISAL_TIMEFRAMES = [
  'immediate', 'within_30_days', '1_to_3_months', '3_to_6_months', 'just_curious',
] as const

export const APPRAISAL_STATUSES = [
  'unassigned', 'new', 'contacted', 'completed', 'discarded',
] as const

export type AppraisalStatus = (typeof APPRAISAL_STATUSES)[number]
export type AppraisalPropertyType = (typeof APPRAISAL_PROPERTY_TYPES)[number]
export type AppraisalPurpose = (typeof APPRAISAL_PURPOSES)[number]
export type AppraisalCondition = (typeof APPRAISAL_CONDITIONS)[number]

export const appraisalAgencySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
})
export type AppraisalAgency = z.infer<typeof appraisalAgencySchema>

export const appraisalParticipantsResponseSchema = z.object({
  agencies: z.array(appraisalAgencySchema),
})

export const appraisalCreatedResponseSchema = z.object({
  ok: z.boolean(),
  /** false = ninguna inmobiliaria participaba en esa localidad. */
  assigned: z.boolean(),
})
export type AppraisalCreated = z.infer<typeof appraisalCreatedResponseSchema>

export const appraisalSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  city: z.string(),
  neighborhood: z.string().nullable(),
  address: z.string(),
  propertyType: z.enum(APPRAISAL_PROPERTY_TYPES),
  purpose: z.enum(APPRAISAL_PURPOSES),
  areaM2: z.string().nullable(),
  rooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  condition: z.enum(APPRAISAL_CONDITIONS).nullable(),
  comments: z.string().nullable(),
  details: z.unknown().nullable(),
  status: z.enum(APPRAISAL_STATUSES),
  assignedAutomatically: z.boolean(),
  assignedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type Appraisal = z.infer<typeof appraisalSchema>

export const appraisalListResponseSchema = z.object({
  items: z.array(appraisalSchema),
  total: z.number(),
})
export type AppraisalListResponse = z.infer<typeof appraisalListResponseSchema>

export const appraisalResponseSchema = z.object({ appraisal: appraisalSchema })

export const appraisalUploadUrlResponseSchema = z.object({
  draftId: z.string(),
  mediaId: z.string(),
  uploadUrl: z.string(),
  contentType: z.string(),
  expiresAt: z.string(),
})
export type AppraisalUploadUrl = z.infer<typeof appraisalUploadUrlResponseSchema>

// Los <input> devuelven string siempre: un opcional vacío tiene que quedar en
// undefined y no en 0 ni en NaN, o el backend recibiría un dato inventado.
const numeroOpcional = (etiqueta: string) =>
  z
    .union([z.literal(''), z.string().regex(/^\d+(?:[.,]\d{1,2})?$/, `${etiqueta} inválido`)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : Number(String(v).replace(',', '.'))))

const enteroOpcional = (etiqueta: string) =>
  z
    .union([z.literal(''), z.string().regex(/^\d{1,3}$/, `${etiqueta} inválido`)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : Number(v)))

const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined))

export const appraisalFormSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá tu nombre y apellido').max(255),
  phone: z.string().trim().min(6, 'Ingresá un teléfono de contacto').max(50),
  email: z.string().trim().email('Correo inválido').max(255),

  city: z.string().trim().min(1, 'Elegí una localidad'),
  // Honeypot: el backend ya lo chequeaba, pero el formulario nunca lo dibujaba,
  // así que no había nada que un bot pudiera llenar y la trampa no atrapaba a
  // nadie. Va acá para que el valor llegue al body.
  website: z.string().max(200).optional(),
  neighborhood: textoOpcional(120),
  address: z.string().trim().min(3, 'Ingresá la dirección').max(255),
  propertyType: z.enum(APPRAISAL_PROPERTY_TYPES, {
    errorMap: () => ({ message: 'Elegí un tipo de propiedad' }),
  }),
  purpose: z.enum(APPRAISAL_PURPOSES, {
    errorMap: () => ({ message: 'Elegí el destino de la tasación' }),
  }),

  areaM2: numeroOpcional('La superficie'),
  rooms: enteroOpcional('Los dormitorios'),
  bathrooms: enteroOpcional('Los baños'),
  condition: z.enum(APPRAISAL_CONDITIONS).optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  comments: textoOpcional(2000),

  tenantId: z.string().optional().transform((v) => (v ? v : undefined)),

  // literal(true): un checkbox sin tildar no pasa.
  declaredAccurate: z.literal(true, {
    errorMap: () => ({ message: 'Confirmá que los datos son correctos' }),
  }),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Tenés que aceptar los términos y la política de privacidad' }),
  }),
})
export type AppraisalForm = z.infer<typeof appraisalFormSchema>

// ── Credenciales de la pasarela (super admin) ──────────────────────

export const paymentModeSchema = z.enum(['sandbox', 'production'])
export type PaymentMode = z.infer<typeof paymentModeSchema>

/** El backend nunca devuelve los secretos: solo si están y sus últimos 4. */
const credentialStatusSchema = z.object({
  configured: z.boolean(),
  last4: z.string().nullable(),
})

export const paymentSettingsSchema = z.object({
  activeMode: paymentModeSchema,
  credentials: z.object({
    sandbox: credentialStatusSchema,
    production: credentialStatusSchema,
  }),
  // Sale del backend y no se arma acá: es la URL que el provider manda como
  // notification_url, y si divergieran el super admin copiaría a MercadoPago
  // una dirección que nunca recibe nada.
  webhookUrl: z.string(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
})
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>

export const saveCredentialsResponseSchema = z.object({
  verified: z.boolean(),
  last4: z.string(),
})

export const activateModeResponseSchema = z.object({
  activeMode: paymentModeSchema,
  orphanedSubscriptions: z.number(),
})
export type ActivateModeResponse = z.infer<typeof activateModeResponseSchema>

export const paymentCredentialsFormSchema = z.object({
  accessToken: z.string().trim().min(10, 'El access token es demasiado corto'),
  webhookSecret: z.string().trim().min(8, 'El webhook secret es demasiado corto'),
})
export type PaymentCredentialsForm = z.infer<typeof paymentCredentialsFormSchema>
