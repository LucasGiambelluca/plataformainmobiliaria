# Documento Técnico Arquitectónico
# Plataforma Inmobiliaria Multi-Tenant

> Versión 0.3 — Alineada al Plan Estratégico v1.0 (6 jun 2026).
> Cambios respecto a v0.2: se incorporan las funcionalidades confirmadas que el Plan v1.0 sumó sobre el presupuesto original — **web propia por inmobiliaria** (templates, carrousel, branding), **dominio propio por inmobiliaria** con **SSL automático**, reverse proxy migrado de **Nginx a Caddy** (On-Demand TLS para dominios dinámicos), tercera vía de resolución de tenant por `Host` header, módulos `sites` y `domains`, y decisión explícita de cola de jobs in-process (node-cron) para v1. Alcance ajustado a 1 dev / ~3.5 meses / 470h.
> Cambios respecto a v0.1: se añadió el núcleo de negocio (suscripciones, pagos, límites por plan), soporte de video y pipeline multimedia, notificaciones por email, leads/consultas, perfil público de inmobiliaria, estados de publicación, auditoría y dashboard de métricas.

---

## 1. Visión General

### 1.1 Propósito
Plataforma **SaaS multitenancy por suscripción** para inmobiliarias. Cada inmobiliaria (tenant) opera de forma aislada con sus propiedades, agentes y configuración, bajo una infraestructura compartida. El negocio se monetiza mediante planes de suscripción con límites por plan.

### 1.2 Objetivos Arquitectónicos
- **Multi-tenancy**: N inmobiliarias independientes con aislamiento de datos.
- **Modelo de suscripción**: planes, pagos recurrentes y límites aplicados (enforcement).
- **Escalabilidad**: capacidad de crecer horizontalmente cuando el volumen lo exija.
- **Mantenibilidad**: código modular, archivos pequeños, convenciones claras.
- **Seguridad**: aislamiento estricto entre tenants en cada query.
- **Performance**: multimedia optimizada y tiempos de respuesta bajos.

### 1.3 Alcance v1 (lo que entra) vs Futuro
- **v1 (Plan v1.0)**: monolito modular Node/Express + PostgreSQL + React, suscripciones, multimedia con almacenamiento en cloud (S3/Cloudinary), email transaccional, **web propia por inmobiliaria** (carrousel + propiedades + branding), **dominio propio por inmobiliaria con SSL automático** (Caddy + Let's Encrypt), deploy single-node (Docker Compose + Caddy) en servidor del cliente o cloud.
- **Futuro (no cotizado)**: Kubernetes, Redis distribuido (cache + cola BullMQ), read replicas, CDN propio, app móvil nativa. Ver §12 y §15.

---

## 2. Modelo Multi-Tenant

### 2.1 Estrategia de Aislamiento — **Shared Database, Shared Schema**
Una sola base de datos, un solo schema, columna `tenant_id` en todas las tablas de negocio.

**Por qué esta estrategia (y no schema-per-tenant):**
- Menor overhead operativo: una migración, un pool de conexiones, un backup.
- Reportes cross-tenant triviales para el Super Admin (ingresos, suscripciones activas).
- Escala mejor en **cantidad** de inmobiliarias chicas/medianas, que es el caso de uso del presupuesto.
- Schema-per-tenant se reserva como camino de migración futuro si un tenant enterprise exige aislamiento físico.

**Costo a mitigar:** el aislamiento depende de disciplina en queries. Se mitiga con §2.4.

### 2.2 Identificación del Tenant
Tres vías combinadas:
```
Subdominio público (acme.plataforma.com) ──┐
Dominio custom (www.inmobiliaria-acme.com) ─┤
   (resuelto por Host header)               ├─→ resuelve tenant_id
Slug en URL (/api/public/:tenantSlug/*)  ───┤
JWT (claim tenant) en rutas autenticadas ──┘
```
- **Rutas públicas** (catálogo, perfil, web propia): tenant resuelto por **subdominio, slug** o **dominio custom** (lookup del `Host` header contra `tenant_domains`).
- **Rutas autenticadas** (paneles): tenant tomado del **claim `tenant` del JWT**.
- **Dominio custom**: el middleware lee `req.headers.host`, busca en `tenant_domains` un registro `active` y resuelve `tenant_id`. Cache en memoria del mapa host→tenant para evitar query por request (invalidado al cambiar estado del dominio).
- El Super Admin no tiene `tenant_id` fijo; opera cross-tenant con autorización explícita.

Ver §5b para el ciclo completo de alta y verificación de dominios custom + SSL.

### 2.3 Diagrama de Flujo de Datos (v1)
```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                     │
│   React + Vite  —  catálogo + paneles + webs inmobiliarias   │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│            Caddy (reverse proxy + SSL automático)            │
│   Wildcard *.plataforma.com  +  dominios custom dinámicos    │
│   On-Demand TLS → pregunta al backend qué dominios autorizar │
└─────────────────────┬───────────────────────────────────────┘
                      │  (también: GET /api/caddy/ask?domain=…)
                      ▼
            ┌────────────────────┐        ┌──────────────────────┐
            │  Backend Node/Expr │ ─────→ │  Storage cloud        │
            │  (monolito modular)│        │  (S3 / Cloudinary)    │
            │  + node-cron jobs  │ ─────→ │  Email (SendGrid/     │
            │   (DNS verify,     │        │   Resend)            │
            │    media async)    │ ─────→ │  Pasarela pago        │
            │                    │        │  (Mercado Pago/Stripe)│
            └─────────┬──────────┘        └──────────────────────┘
                      ▼
            ┌────────────────────┐
            │    PostgreSQL      │
            │  schema único +    │
            │  tenant_id         │
            └────────────────────┘
```
> Redis (cola distribuida), load balancer multi-instancia y K8s: ver §12 (Futuro). No en v1.
> Cola de jobs v1: in-process con node-cron + procesamiento async (ver §6.1). Limitación: no sobrevive a múltiples instancias — aceptable en deploy single-node.

### 2.4 Garantías de Aislamiento (defensa en capas)
1. **Middleware** inyecta `req.tenantId` y lo hace obligatorio en rutas privadas.
2. **Repository base** que exige `tenantId` en toda lectura/escritura; ningún repo de negocio expone un `findAll` sin tenant.
3. **Validación de pertenencia**: toda operación por `:id` filtra `WHERE id = ? AND tenant_id = ?`; si no existe → 404 (no 403, para no filtrar existencia).
4. **Tests** de aislamiento: un tenant nunca lee/escribe recursos de otro.

---

## 3. Arquitectura de Capas

### 3.1 Estructura del Backend
```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts          # Prisma client
│   │   ├── env.ts               # Variables validadas con Zod
│   │   └── logger.ts            # Logger estructurado (pino)
│   │
│   ├── modules/                 # Un dominio por carpeta
│   │   ├── auth/                # Login, refresh, registro
│   │   ├── tenants/             # Inmobiliarias (Super Admin)
│   │   ├── subscriptions/       # Planes, suscripciones, límites
│   │   ├── billing/             # Pasarela de pago + webhooks
│   │   ├── users/               # Usuarios internos por tenant
│   │   ├── properties/          # Propiedades + estados de publicación
│   │   ├── media/               # Imágenes y videos + pipeline
│   │   ├── inquiries/           # Leads / consultas por propiedad
│   │   ├── sites/               # Config web propia: branding, carrousel, tema
│   │   ├── domains/             # Dominios custom + verificación DNS + Caddy
│   │   ├── notifications/       # Email transaccional
│   │   ├── audit/               # Logs de acciones y accesos
│   │   └── analytics/           # Métricas dashboard (tenant y global)
│   │
│   ├── shared/
│   │   ├── middleware/          # auth, tenant, errores, rate-limit
│   │   ├── repository/          # BaseRepository (tenant-aware)
│   │   ├── services/            # email, storage, payment (interfaces)
│   │   ├── errors/              # AppError, NotFound, Forbidden, etc.
│   │   └── utils/
│   │
│   ├── routes/                  # Composición de rutas por módulo
│   ├── types/
│   └── app.ts                   # Entry point
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docker-compose.yml
├── Dockerfile
└── package.json
```

Cada módulo sigue la misma forma: `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.schema.ts` (Zod/DTO), `*.routes.ts`.

### 3.2 Estructura del Frontend
```
frontend/
├── src/
│   ├── api/                     # Axios + interceptors (token, tenant)
│   ├── components/
│   │   ├── common/              # Button, Input, Modal, etc.
│   │   ├── layout/              # Header, Sidebar, Footer
│   │   ├── properties/          # Cards, formularios, galería multimedia
│   │   ├── site-builder/        # Editor visual de web propia + carrousel
│   │   └── billing/             # Selector de plan, estado de suscripción
│   │
│   ├── pages/
│   │   ├── public/              # Landing, catálogo, ficha, perfil inmobiliaria
│   │   ├── tenant-site/         # Web propia renderizada (slug/subdominio/dominio custom)
│   │   ├── auth/                # Login, registro
│   │   ├── super-admin/         # Dashboard global, tenants, planes, dominios
│   │   ├── tenant/              # Dashboard, propiedades, agentes, suscripción, mi-sitio, dominio
│   │   └── settings/
│   │
│   ├── stores/                  # Zustand: auth, tenant, ui
│   ├── hooks/
│   ├── utils/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── Dockerfile
└── package.json
```

---

## 4. Diseño de Base de Datos

### 4.1 Entidades principales y relaciones
```
plans ──1:N── subscriptions ──N:1── tenants ──1:N── users
                                       │
                                       ├──1:N── properties ──1:N── property_media
                                       │                 └──1:N── property_features
                                       │                 └──1:N── inquiries
                                       ├──1:N── inquiries
                                       ├──1:N── tenant_domains
                                       ├──1:1── tenant_site_config ──1:N── site_carousel_images
                                       └──1:N── audit_logs

payments ──N:1── subscriptions
```

### 4.2 Tablas

**plans** (catálogo de planes — global, gestionado por Super Admin)
- id: UUID (PK)
- name: VARCHAR(100)            -- "Básico", "Pro", "Enterprise"
- slug: VARCHAR(50) UNIQUE
- price_amount: DECIMAL(12,2)
- price_currency: VARCHAR(3)
- billing_interval: ENUM('monthly','yearly')
- max_properties: INTEGER       -- límite duro del plan
- max_users: INTEGER
- max_storage_mb: INTEGER
- is_active: BOOLEAN
- created_at / updated_at

**tenants** (Inmobiliarias)
- id: UUID (PK)
- name: VARCHAR(255)
- slug: VARCHAR(100) UNIQUE      -- subdominio / perfil público
- logo_url: TEXT
- description: TEXT              -- para perfil público
- contact_email / contact_phone
- is_active: BOOLEAN
- created_at / updated_at

**subscriptions** (suscripción vigente de cada tenant)
- id: UUID (PK)
- tenant_id: UUID (FK)
- plan_id: UUID (FK)
- status: ENUM('trialing','active','past_due','canceled','suspended')
- current_period_start: TIMESTAMP
- current_period_end: TIMESTAMP
- cancel_at_period_end: BOOLEAN
- external_ref: TEXT            -- id de suscripción en la pasarela
- created_at / updated_at

**payments** (historial de cobros)
- id: UUID (PK)
- subscription_id: UUID (FK)
- tenant_id: UUID (FK)          -- desnormalizado para reportes
- amount: DECIMAL(12,2)
- currency: VARCHAR(3)
- status: ENUM('pending','paid','failed','refunded')
- provider: ENUM('mercadopago','stripe')
- external_payment_id: TEXT
- paid_at: TIMESTAMP NULL
- created_at

**users** (usuarios internos del tenant)
- id: UUID (PK)
- tenant_id: UUID (FK NULL)     -- NULL solo para super_admin
- email: VARCHAR(255)           -- UNIQUE global, además de (tenant_id, email)
- password_hash: TEXT
- role: ENUM('super_admin','tenant_admin','agent')
- name / phone / avatar_url
- is_active: BOOLEAN
- created_at / updated_at

> Nota de roles: el "Cliente" del presupuesto NO es un usuario interno con login,
> es un visitante público que genera leads (ver tabla `inquiries`). No requiere
> cuenta en v1.

**properties** (propiedades)
- id: UUID (PK)
- tenant_id: UUID (FK)
- title / description
- property_type: ENUM('apartment','house','land','office','warehouse','commercial')
- operation_type: ENUM('sale','rent','temporary_rental')
- price: DECIMAL(15,2)
- currency: VARCHAR(3)
- address / city / state / country
- lat: DECIMAL(10,8) / lng: DECIMAL(11,8)
- area_m2 / rooms / bathrooms / parking / floor / year_built
- status: ENUM('draft','published','paused','featured')   -- estados de publicación
- views_count: INTEGER DEFAULT 0
- created_by: UUID (FK users)
- created_at / updated_at

> `status` reemplaza los booleanos sueltos `is_public`/`is_featured`. "Publicada" y
> "destacada" son estados; "destacada" implica publicada. El catálogo público
> muestra `published` y `featured`.

**property_media** (imágenes Y videos)
- id: UUID (PK)
- property_id: UUID (FK)
- tenant_id: UUID (FK)          -- desnormalizado para enforcement de storage
- type: ENUM('image','video')
- url: TEXT                     -- original en storage
- thumbnail_url: TEXT           -- generado por el pipeline
- size_bytes: BIGINT            -- para sumar contra max_storage_mb
- duration_sec: INTEGER NULL    -- solo video
- sort_order: INTEGER
- is_cover: BOOLEAN
- status: ENUM('processing','ready','failed')   -- pipeline async
- created_at

**property_features**
- id: UUID (PK)
- property_id: UUID (FK)
- feature: VARCHAR(100)

**inquiries** (leads / consultas públicas — reemplaza `contracts`)
- id: UUID (PK)
- tenant_id: UUID (FK)
- property_id: UUID (FK NULL)   -- consulta general si NULL
- name / email / phone
- message: TEXT
- status: ENUM('new','contacted','closed')
- created_at

**tenant_domains** (dominios custom por inmobiliaria — Fase 1/4)
- id: UUID (PK)
- tenant_id: UUID (FK)
- domain: VARCHAR(253) UNIQUE    -- "www.inmobiliaria-acme.com" (un dominio = un solo tenant)
- status: ENUM('pending','verifying','active','failed')
- verification_token: TEXT       -- para verificación por registro TXT (opcional)
- dns_target: VARCHAR(253)       -- CNAME/A que el cliente debe apuntar
- last_checked_at: TIMESTAMP NULL -- última corrida del job de verificación DNS
- verified_at: TIMESTAMP NULL    -- cuándo pasó a active (habilita On-Demand TLS)
- created_at / updated_at

> `domain` es UNIQUE global: garantiza que el lookup por `Host` header resuelve a un único tenant.
> Solo dominios en estado `active` son autorizados por el endpoint On-Demand TLS de Caddy (§5b).

**tenant_site_config** (config de la web propia — 1:1 con tenant — Fase 3)
- id: UUID (PK)
- tenant_id: UUID (FK UNIQUE)    -- una config por inmobiliaria
- primary_color / secondary_color: VARCHAR(7)   -- hex, tema dinámico
- hero_title / hero_subtitle: TEXT
- about_text: TEXT
- social_facebook / social_instagram / social_whatsapp: TEXT
- show_featured_only: BOOLEAN     -- qué propiedades muestra la home del sitio
- template: VARCHAR(50)           -- id de template/layout elegido
- is_published: BOOLEAN           -- web propia visible o no
- created_at / updated_at

**site_carousel_images** (carrousel hero de la web propia — Fase 3)
- id: UUID (PK)
- tenant_id: UUID (FK)            -- desnormalizado para enforcement/filtrado directo
- site_config_id: UUID (FK)
- image_url: TEXT
- link_url: TEXT NULL             -- destino opcional al click
- caption: VARCHAR(255) NULL
- sort_order: INTEGER
- is_active: BOOLEAN
- created_at

**audit_logs** (auditoría — Fase 2)
- id: UUID (PK)
- tenant_id: UUID (FK NULL)     -- NULL para acciones de super_admin globales
- user_id: UUID (FK NULL)
- action: VARCHAR(100)          -- "property.create", "auth.login", "domain.verify", etc.
- entity_type / entity_id
- ip_address: VARCHAR(45)
- metadata: JSONB
- created_at

### 4.3 Índices clave
- `properties (tenant_id, status)` — listados de panel y catálogo.
- `properties (status)` parcial donde `status IN ('published','featured')` — catálogo público cross-filtro.
- `users (email)` UNIQUE global, y `users (tenant_id, email)` UNIQUE. El global no es redundante: el login resuelve el usuario por email sin saber la inmobiliaria, así que dos filas con el mismo email dejarían a una persona sin poder entrar nunca.
- `property_media (property_id)`, `inquiries (tenant_id, status)`.
- `subscriptions (tenant_id)`, `payments (tenant_id, status)`.
- `tenant_domains (domain)` UNIQUE — lookup por `Host` header en cada request público de dominio custom.
- `tenant_domains (status)` parcial donde `status = 'active'` — endpoint On-Demand TLS de Caddy.
- `tenant_site_config (tenant_id)` UNIQUE, `site_carousel_images (tenant_id, sort_order)`.

---

## 5. Suscripciones, Planes y Límites (núcleo de negocio)

### 5.1 Ciclo de vida de la suscripción
```
registro inmobiliaria
   └─→ trialing (opcional) ─→ active ─┬─→ past_due (cobro falló) ─→ suspended
                                      ├─→ canceled (al fin de período)
                                      └─→ active (renovación ok)
```
Transiciones disparadas por: alta manual (Super Admin), webhooks de la pasarela, o jobs de vencimiento.

### 5.2 Enforcement de límites
El plan define `max_properties`, `max_users`, `max_storage_mb`. Se aplica en el **service layer**, no en el controller, vía un guard reutilizable:
```typescript
// pseudocódigo
async function assertWithinLimit(tenantId, resource) {
  const { plan } = await subscriptionService.getActive(tenantId)
  const used = await usageService.count(tenantId, resource) // properties|users|storage
  if (used >= plan[`max_${resource}`]) {
    throw new LimitExceededError(resource, plan)
  }
}
```
- `properties`: se chequea antes de crear propiedad.
- `users`: antes de invitar/crear usuario.
- `storage`: suma `property_media.size_bytes` del tenant antes de aceptar upload.
- Tenant `suspended` o `past_due`: se bloquea creación/edición; lectura y catálogo público siguen disponibles (configurable).

### 5.3 Integración de pago (abstracción)
Interfaz `PaymentProvider` con implementaciones intercambiables (Mercado Pago, Stripe):
```typescript
interface PaymentProvider {
  createSubscription(tenant, plan): Promise<ExternalRef>
  cancelSubscription(ref): Promise<void>
  handleWebhook(payload, signature): Promise<PaymentEvent>
}
```
- **Webhooks** (`POST /api/billing/webhook/:provider`): única fuente de verdad del estado de pago. Verifican firma, son idempotentes, actualizan `subscriptions`/`payments`.
- Costos de la pasarela: a cargo del cliente (ver Exclusiones del presupuesto). La plataforma solo integra.

---

## 5b. Webs Propias y Dominios Custom (núcleo del Plan v1.0)

### 5b.1 Web propia por inmobiliaria
Cada tenant tiene un sitio público propio (distinto del catálogo general de la plataforma), construido desde `tenant_site_config` + `site_carousel_images` + sus `properties` publicadas.
- **Branding dinámico**: colores (`primary_color`/`secondary_color`), textos hero, redes, template. El frontend aplica el tema en runtime según el tenant resuelto.
- **Carrousel hero**: imágenes ordenadas (`sort_order`), editables desde el panel (Fase 3, tareas 3.12-3.13).
- **Contenido**: home con carrousel + grilla de propiedades (todas o solo `featured`, según `show_featured_only`) + perfil/contacto.
- **Acceso**: el mismo sitio se sirve por **slug** (`/sitio/:slug`), **subdominio** (`acme.plataforma.com`) y **dominio custom** (`www.acme.com`). Las tres vías resuelven el mismo `tenant_id` (§2.2).

### 5b.2 Dominios custom — ciclo de vida
```
tenant agrega dominio en el panel
   └─→ tenant_domains status='pending', se le muestran instrucciones DNS
        └─→ cliente apunta CNAME/A a dns_target
             └─→ job node-cron (periódico) verifica resolución DNS → status='verifying'→'active'
                  └─→ dominio 'active' habilita On-Demand TLS en Caddy
                       └─→ primer request HTTPS al dominio → Caddy pide cert a Let's Encrypt
                            └─→ web propia del tenant servida con SSL
```
- Estados: `pending` (recién creado) → `verifying` (DNS detectado, validando) → `active` (resuelve correcto, SSL habilitado) | `failed` (no resuelve tras N intentos).
- **Fallback**: si el dominio custom falla, el tenant sigue operativo por subdominio `*.plataforma.com` (mitigación de riesgo del Plan).

### 5b.3 SSL automático con Caddy (On-Demand TLS)
Caddy gestiona certificados sin configuración manual por dominio:
- **Wildcard** `*.plataforma.com`: cert único para todos los subdominios de tenants (DNS challenge).
- **Dominios custom**: **On-Demand TLS**. Antes de emitir un cert, Caddy consulta al backend qué dominios están autorizados:
```
GET /api/caddy/ask?domain=www.acme.com
   → 200 si existe tenant_domains.domain = 'www.acme.com' AND status='active'
   → 403 en cualquier otro caso  (evita que Caddy pida certs de dominios no verificados)
```
Endpoint público sin auth, idempotente, solo lectura. Protege contra abuso de emisión de certificados (un atacante apuntando dominios arbitrarios a la IP no obtiene cert salvo que exista registro `active`).

> Caddy se configura una sola vez (Caddyfile + On-Demand TLS apuntando al endpoint `ask`). No requiere reload por cada dominio nuevo — la autorización es dinámica vía el backend. Esta es la razón de elegir Caddy sobre Nginx (Nginx exigiría regenerar config + reload por cada dominio).

---

## 6. Multimedia (imágenes y video)

### 6.1 Pipeline de carga
```
cliente pide URL de subida
   └─→ backend valida límite de storage + tipo/tamaño
        └─→ upload directo a S3/Cloudinary (presigned URL)
             └─→ registro property_media status='processing'
                  └─→ procesamiento async:
                        imagen → compресión + thumbnail
                        video  → thumbnail + (opcional) transcode
                  └─→ status='ready' (o 'failed')
```
- **Imágenes**: compresión optimizada + generación de thumbnail.
- **Video**: thumbnail (frame) + opción de transcode a resolución web. Transcode pesado puede delegarse al proveedor (Cloudinary) para no cargar el backend en v1.
- **Procesamiento async**: en v1, cola **in-process** (ver §6.2). Una cola externa (Redis/BullMQ) queda para Futuro si el volumen lo exige.
- El frontend muestra estado `processing` hasta que el media esté `ready`.

### 6.2 Cola de jobs v1 (decisión)
v1 corre sobre **single-node**, sin Redis. Los trabajos async se manejan in-process:
- **node-cron**: jobs periódicos — verificación DNS de `tenant_domains` (§5b.2), barridos de vencimiento de suscripciones (§5.1).
- **Procesamiento puntual** (thumbnails de imagen, disparo de transcode, envío de email): ejecutado fuera del ciclo request con `setImmediate`/promesas no bloqueantes; el transcode de video pesado se delega al provider (Cloudinary) para no cargar el proceso Node.
- **Limitación aceptada**: estos jobs viven en el proceso del backend. Con múltiples instancias se duplicarían — por eso v1 es single-instance. Al escalar horizontalmente (§12) se migra a Redis + BullMQ con locking distribuido.
- **Tolerancia a fallos**: estados persistidos en DB (`property_media.status`, `tenant_domains.status`) permiten reintento idempotente si el proceso reinicia.

---

## 7. Stack Tecnológico

### 7.1 Backend
| Componente | Tecnología | Versión |
|------------|------------|---------|
| Runtime | Node.js | 20.x LTS |
| Framework | Express.js | 5.x |
| Lenguaje | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| DB | PostgreSQL | 16.x |
| Validación | Zod | 3.x |
| Auth | JWT + bcrypt | - |
| Email | SendGrid / Resend (cliente) | - |
| Pago | Mercado Pago / Stripe (cliente) | - |
| Storage | S3 / Cloudinary (cliente) | - |
| Jobs | node-cron (in-process) | 3.x |
| Docs | Swagger/OpenAPI | - |
| Tests | Jest + Supertest | - |

### 7.2 Frontend
| Componente | Tecnología | Versión |
|------------|------------|---------|
| Framework | React | 18.x |
| Build | Vite | 5.x |
| Routing | React Router | 6.x |
| Estado | Zustand | 4.x |
| UI | Tailwind CSS | 3.x |
| HTTP | Axios | 1.x |
| Forms | React Hook Form + Zod | 7.x |
| Icons | Lucide React | - |

### 7.3 Infraestructura v1
| Componente | Tecnología |
|------------|------------|
| Contenedores | Docker + Docker Compose |
| Reverse proxy / TLS | **Caddy** (SSL automático + On-Demand TLS para dominios custom) |
| Storage | S3 / Cloudinary (provisto por cliente) |
| Deploy | Single-node (servidor del cliente o cloud) |

> **Caddy reemplaza a Nginx** (v0.2): su On-Demand TLS permite emitir certificados para dominios custom dinámicos sin reload de config (§5b.3). Es el habilitador de la feature "dominio propio por inmobiliaria" del Plan v1.0.
> Kubernetes, Redis, CDN propio y read replicas: ver §12 (escalabilidad futura), no incluidos en v1.

---

## 8. Autenticación, Autorización y Roles

### 8.1 Flujo de Autenticación
```
1. Usuario envía email + password.
2. Backend resuelve tenant (por subdominio o por email único global de super_admin).
3. Valida password con bcrypt (cost 12).
4. Emite access token JWT (15 min) + refresh token (rotación).
   payload: { sub: user_id, tenant: tenant_id|null, role, exp }
5. Frontend guarda access token en memoria; refresh token en cookie httpOnly.
6. Requests privadas → Authorization: Bearer <access_token>.
```
> Cambio de seguridad: refresh token en **cookie httpOnly**, no en localStorage,
> para reducir superficie XSS. El access token de vida corta vive en memoria.

### 8.2 Roles y Permisos
| Rol | Permisos |
|-----|----------|
| super_admin | Gestiona todas las inmobiliarias, planes, métricas globales, suspensiones. Sin tenant fijo. |
| tenant_admin | Gestiona su inmobiliaria: usuarios/agentes, suscripción, todas sus propiedades, perfil público. |
| agent | CRUD de propiedades de su tenant, gestión de leads asignados. |

"Cliente" (público) no es un rol con login: genera `inquiries`. Ver §4.2.

### 8.3 Middleware
```typescript
const authenticate = (req, res, next) => {
  const token = extractToken(req.headers.authorization)
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    req.tenantId = decoded.tenant
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' })
  next()
}

// Garantiza tenant presente en rutas de tenant (rechaza super_admin sin contexto)
const requireTenant = (req, res, next) => {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant context required' })
  next()
}
```

---

## 9. API Endpoints

### 9.1 Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Alta de inmobiliaria + admin (self-serve) |
| POST | /api/auth/refresh | Renovar access token |
| POST | /api/auth/logout | Logout (revoca refresh) |

### 9.2 Super Admin
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/admin/tenants | Listar inmobiliarias |
| POST | /api/admin/tenants | Crear inmobiliaria |
| PATCH | /api/admin/tenants/:id | Editar / suspender / asignar plan |
| GET | /api/admin/plans | Listar planes |
| POST/PATCH | /api/admin/plans/:id? | Crear / editar plan y precios |
| GET | /api/admin/metrics | Métricas globales (tenants, suscripciones, ingresos) |
| GET | /api/admin/audit | Logs de auditoría |
| GET | /api/admin/domains | Dominios de todas las inmobiliarias + estados + override manual |

### 9.3 Suscripción y Billing (tenant)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/subscription | Estado de suscripción + uso vs límites |
| POST | /api/subscription/checkout | Iniciar/cambiar plan (devuelve URL de pago) |
| POST | /api/subscription/cancel | Cancelar al fin de período |
| POST | /api/billing/webhook/:provider | Webhook de pasarela (sin auth, firma verificada) |

### 9.4 Propiedades
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/properties | Listar (panel, filtrado por tenant) |
| GET | /api/properties/:id | Ver |
| POST | /api/properties | Crear (chequea límite) |
| PATCH | /api/properties/:id | Actualizar |
| DELETE | /api/properties/:id | Eliminar |
| PATCH | /api/properties/:id/status | Cambiar estado (draft/published/paused/featured) |

### 9.5 Multimedia
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/media/sign | Pedir presigned URL (valida límite/tipo) |
| POST | /api/media | Confirmar media subido (crea registro) |
| PATCH | /api/media/:id | Reordenar / marcar portada |
| DELETE | /api/media/:id | Eliminar (libera storage) |

### 9.6 Usuarios (tenant)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/users | Listar usuarios del tenant |
| POST | /api/users | Crear/invitar (chequea límite) |
| PATCH | /api/users/:id | Actualizar |
| DELETE | /api/users/:id | Desactivar |

### 9.7 Leads / Consultas
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | /api/public/inquiries | Crear consulta (público, por slug de tenant) |
| GET | /api/inquiries | Listar leads del tenant |
| PATCH | /api/inquiries/:id | Cambiar estado (new/contacted/closed) |

### 9.8 Público (sin auth, tenant por slug/subdominio/dominio custom)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/public/:tenantSlug/properties | Catálogo con filtros (ubicación, tipo, precio, ambientes) |
| GET | /api/public/:tenantSlug/properties/:id | Ficha (galería, video, mapa) |
| GET | /api/public/:tenantSlug/profile | Perfil público de la inmobiliaria |
| GET | /api/public/:tenantSlug/site | Config de web propia (branding, tema, carrousel) para render del sitio |

> Cuando el request entra por **dominio custom**, el middleware resuelve el tenant por `Host` header (§2.2) e inyecta el `tenantSlug` equivalente; el frontend de la web propia consume los mismos endpoints públicos.

### 9.9 Mi Sitio Web (tenant, autenticado)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/site | Config actual de la web propia del tenant |
| PUT | /api/site | Actualizar branding, textos, tema, template, publicado |
| POST | /api/site/carousel | Agregar imagen al carrousel |
| PATCH | /api/site/carousel/:id | Reordenar / activar / editar imagen |
| DELETE | /api/site/carousel/:id | Eliminar imagen del carrousel |

### 9.10 Dominios Custom (tenant, autenticado)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/domains | Listar dominios del tenant + estado + instrucciones DNS |
| POST | /api/domains | Agregar dominio (status='pending', devuelve dns_target) |
| POST | /api/domains/:id/verify | Forzar verificación DNS manual |
| DELETE | /api/domains/:id | Eliminar dominio |

### 9.11 Caddy On-Demand TLS (sin auth, consumido por Caddy)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | /api/caddy/ask?domain=… | 200 si el dominio existe y está `active`; 403 si no (§5b.3) |

> Gestión global de dominios para Super Admin: ver §9.2 (`/api/admin/domains` — listado, estados, override manual).

---

## 10. Patrones de Diseño

### 10.1 BaseRepository tenant-aware
```typescript
abstract class BaseRepository<T> {
  // toda lectura/escritura exige tenantId; no hay método sin él
  protected abstract model
  findMany(tenantId: string, where = {}) {
    return this.model.findMany({ where: { tenantId, ...where } })
  }
  findById(id: string, tenantId: string) {
    return this.model.findFirst({ where: { id, tenantId } })
  }
}
```

### 10.2 Service Layer (con enforcement)
```typescript
class PropertyService {
  constructor(private repo: PropertyRepository, private limits: LimitService) {}
  async create(data: CreatePropertyDTO, tenantId: string, userId: string) {
    await this.limits.assert(tenantId, 'properties')   // límite por plan
    return this.repo.create({ ...data, tenantId, createdBy: userId, status: 'draft' })
  }
  async changeStatus(id: string, tenantId: string, status: PropertyStatus) {
    const p = await this.repo.findById(id, tenantId)
    if (!p) throw new NotFoundError()
    return this.repo.update(id, { status })
  }
}
```

### 10.3 DTOs con Zod
```typescript
const CreatePropertySchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().optional(),
  propertyType: z.enum(['apartment','house','land','office','warehouse','commercial']),
  operationType: z.enum(['sale','rent','temporary_rental']),
  price: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  address: z.string().optional(),
  city: z.string().optional(),
})
type CreatePropertyDTO = z.infer<typeof CreatePropertySchema>
```

---

## 11. Notificaciones por Email
- Servicio `EmailService` con interfaz por proveedor (SendGrid/Resend; credenciales del cliente).
- Eventos que disparan email:
  - **Registro** de inmobiliaria / usuario (verificación o bienvenida).
  - **Suscripción**: cobro exitoso, cobro fallido, próxima renovación, cancelación.
  - **Lead/consulta**: aviso al tenant cuando llega una consulta por propiedad.
- Plantillas versionadas; envío async tolerante a fallos (no bloquea la request principal).

---

## 12. Escalabilidad (Futuro — fuera de v1)
Documentado como camino, no implementado en este presupuesto:
- **Backend horizontal**: múltiples instancias detrás de load balancer; estado en DB (stateless).
- **Redis**: cache + cola de jobs (BullMQ) para procesamiento multimedia y email.
- **Read replicas**: para listados intensivos del catálogo público.
- **Particionamiento** por `tenant_id` si el volumen lo exige.
- **CDN** para servir multimedia.
- **Kubernetes** para orquestación.

---

## 13. Seguridad
- Passwords con bcrypt (cost 12).
- Access token JWT corto (15 min) + refresh token rotativo en cookie httpOnly.
- Rate limiting en login, registro, webhooks y endpoints públicos.
- Validación de input con Zod en todo endpoint.
- Prevención de SQL injection vía Prisma.
- Helmet.js para headers; CORS por ambiente.
- **Webhooks de pago**: verificación de firma + idempotencia.
- **Aislamiento de tenant**: ver §2.4 (defensa en capas + tests).
- Subida de multimedia: validación de tipo MIME, tamaño y límite de storage antes de aceptar.
- **Dominios custom / On-Demand TLS**: el endpoint `/api/caddy/ask` solo autoriza dominios `active` en `tenant_domains` (§5b.3) — impide emisión abusiva de certificados Let's Encrypt por dominios apuntados sin verificar.
- **Resolución por `Host` header**: el dominio se valida contra `tenant_domains` (UNIQUE); un Host desconocido no resuelve tenant (404), no expone datos cross-tenant.

---

## 14. Ambiente de Desarrollo

### 14.1 Docker Compose (v1)
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: devpassword
      POSTGRES_DB: realestate
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on: [postgres]

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [backend]

volumes:
  pgdata:
```
> Dev usa Vite dev server directo (puerto 5173). Caddy se incorpora en el compose de **producción** (§14.3).
> Redis se agrega solo cuando se incorpore la cola de jobs distribuida (Futuro, §12). En v1 los jobs corren in-process (node-cron, §6.2).

### 14.3 Docker Compose producción (v1)
Añade **Caddy** como reverse proxy + TLS frente a backend y frontend (build estático):
```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data        # certificados persistentes (Let's Encrypt)
      - caddy_config:/config
    depends_on: [backend, frontend]

  postgres:   { image: postgres:16, volumes: ["pgdata:/var/lib/postgresql/data"] }
  backend:    { build: ./backend, depends_on: [postgres] }
  frontend:   { build: ./frontend, depends_on: [backend] }   # build estático servido por Caddy

volumes:
  pgdata:
  caddy_data:      # CRÍTICO: persistir o se re-emiten certs en cada deploy (rate-limit LE)
  caddy_config:
```
**Caddyfile (esquema):**
```caddyfile
# Wildcard subdominios de la plataforma (DNS challenge)
*.plataforma.com, plataforma.com {
    reverse_proxy backend:3000
}
# Dominios custom dinámicos — On-Demand TLS autorizado por el backend
{
    on_demand_tls {
        ask http://backend:3000/api/caddy/ask
    }
}
:443 {
    tls { on_demand }
    reverse_proxy backend:3000
}
```
> `caddy_data` DEBE persistir entre deploys: contiene los certificados emitidos. Sin volumen, cada redeploy re-solicita certs y puede chocar con el rate limit de Let's Encrypt.

### 14.2 Variables de Entorno (backend)
```env
# DB
DATABASE_URL=postgresql://user:pass@localhost:5432/db
# JWT
JWT_SECRET=...
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=...
# Storage (cliente)
STORAGE_PROVIDER=cloudinary        # o s3
CLOUDINARY_URL=...                 # o AWS_S3_BUCKET / AWS_REGION / keys
# Email (cliente)
EMAIL_PROVIDER=resend              # o sendgrid
EMAIL_API_KEY=...
# Pago (cliente)
PAYMENT_PROVIDER=mercadopago       # o stripe
PAYMENT_API_KEY=...
PAYMENT_WEBHOOK_SECRET=...
# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
# Multitenancy / dominios
PLATFORM_DOMAIN=plataforma.com     # base para subdominios *.plataforma.com
CUSTOM_DOMAIN_TARGET=plataforma.com # CNAME/A que el cliente apunta (dns_target)
```

---

## 15. Mapa Arquitectura ↔ Fases del Presupuesto
| Fase | Entregable | Componentes de este doc |
|------|-----------|-------------------------|
| 0 | Diseño + arquitectura | Este documento, modelo de datos §4, design system, diseño web propia §5b.1 |
| 1 | Backend core, auth, suscripciones | §3.1, §5, §8, módulos auth/tenants/subscriptions/billing/users + base módulos sites/domains (§5b, §9.9-9.11) + resolución tenant por Host (§2.2) |
| 2 | Panel Super Admin | §9.2, módulos analytics/audit, métricas globales, gestión global de dominios (`/api/admin/domains`) |
| 3 | Panel inmobiliaria + publicaciones | módulos properties/media/inquiries, §6, estados §4.2, "Mi Sitio Web" (§5b.1, §9.9), config dominio (§9.10) |
| 4 | Frontend público + webs inmobiliarias | §9.8, catálogo, perfil público, web propia con carrousel+branding (§5b.1), routing slug/subdominio/dominio custom, integración Caddy (§5b.3) |
| 5 | Testing + deploy | §13, §14.3 (Caddy prod), tests de aislamiento + E2E dominio custom→SSL, optimización multimedia |

**Total: 470h / ~15 semanas (Plan v1.0).** Las features web propia + dominios custom + SSL automático son el delta sobre el presupuesto v0.1 original (360h).

---

## 16. Próximos Pasos
1. Inicializar monorepo (backend + frontend) y Docker Compose.
2. Definir `schema.prisma` con las tablas de §4 y correr primera migración.
3. Auth JWT + refresh + middleware de tenant y autorización.
4. Módulos de negocio: tenants → subscriptions/billing → properties → media → inquiries → sites/domains.
5. Frontend: paneles (super-admin, tenant), sitio público y webs propias de inmobiliarias.
6. Integraciones externas (storage, email, pago, Caddy On-Demand TLS) detrás de interfaces.
7. Tests (unit + integración + aislamiento de tenant + E2E dominio custom→SSL) y documentación Swagger.
8. Deploy single-node con Caddy a staging y luego producción.

---

## 17. Glosario
- **Tenant**: inmobiliaria registrada.
- **Multi-tenancy**: arquitectura donde múltiples clientes comparten infraestructura con datos aislados.
- **Enforcement de límites**: aplicación de los topes del plan (propiedades, usuarios, storage).
- **Lead / inquiry**: consulta de un cliente público sobre una propiedad.
- **Web propia**: sitio público de cada inmobiliaria con branding, carrousel y propiedades, distinto del catálogo general de la plataforma.
- **Dominio custom**: dominio del cliente (`www.acme.com`) apuntado a la plataforma, resuelto por `Host` header.
- **On-Demand TLS**: emisión dinámica de certificados SSL por Caddy, autorizada por el backend (§5b.3), sin reload de config por dominio.
- **JWT / DTO / ORM / Middleware**: estándares de auth, transferencia de datos, mapeo de DB y procesamiento de requests, respectivamente.
