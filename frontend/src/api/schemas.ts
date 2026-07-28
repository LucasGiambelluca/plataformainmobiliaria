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
    }),
  ),
})
export type PublicPlan = z.infer<typeof publicPlansResponseSchema>['plans'][number]

export const checkoutResponseSchema = z.object({ redirectUrl: z.string().url() })

export const publicCitiesResponseSchema = z.object({
  cities: z.array(z.object({ city: z.string(), count: z.number() })),
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
  city: z.string().trim().max(120).optional().or(z.literal('')),
  state: z.string().trim().max(120).optional().or(z.literal('')),
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
})
export type PlanForm = z.infer<typeof planFormSchema>
