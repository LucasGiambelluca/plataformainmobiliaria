# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Plataforma SaaS multitenant para inmobiliarias. Monorepo: `backend/` (Express + TypeScript + Prisma + PostgreSQL) y `frontend/` (Vite + React 18 + Tailwind 3). El roadmap completo está en `plan_estrategico.md` (6 fases) y el diseño técnico detallado en `docs/arquitectura.md` — consultarlos antes de decisiones de arquitectura.

## Comandos

Todo el backend se corre desde `backend/`:

```bash
docker compose up -d          # PostgreSQL 16 (contenedor inmobiliaria_pg, puerto 5432)
npm run dev                   # tsx watch, servidor en http://localhost:3000
npm run typecheck             # tsc --noEmit
npm run lint                  # eslint src/
npm test                      # jest --runInBand
npx jest tests/unit/baseRepository.test.ts   # un solo archivo de test
npx jest -t "nombre del test"                # un solo test por nombre
npm run prisma:migrate        # prisma migrate dev
npm run prisma:seed           # siembra 3 planes + super admin (admin@plataforma.com)
npm run db:reset              # prisma migrate reset --force (destruye datos)
```

Frontend desde `frontend/`:

```bash
npm run dev                   # Vite en http://localhost:5173
npm run build                 # tsc -b && vite build
```

Requiere `backend/.env` (copiar de `.env.example`). `src/config/env.ts` valida con Zod y **aborta el proceso** si falta algo: `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` (mínimo 32 chars) son obligatorias.

## Arquitectura

### Multitenancy — la regla central

Shared database con `tenant_id` en toda tabla de negocio. El aislamiento se garantiza en `backend/src/shared/repository/BaseRepository.ts`: **toda query exige `tenantId`**, no existe `findAll` sin tenant, y las operaciones por id filtran por `{ id, tenantId }` devolviendo NotFound si no pertenece (no se revela existencia de recursos ajenos). Todo repositorio nuevo debe extender `BaseRepository`; nunca usar `prisma.<model>` directo para datos de negocio con tenant.

### Backend (`backend/src/`)

- `app.ts` monta helmet, cors, rate limit y el router raíz; `server.ts` levanta y conecta Prisma.
- `routes/index.ts` es el router raíz de la API (`/api`). Los módulos de negocio (auth, tenants, subscriptions…) se montan ahí como sub-routers — hoy están comentados, se construyen en Fase 1. Convención de módulos: `src/modules/<nombre>/` con router + service + repository.
- `shared/middleware/`: `authenticate` (verifica JWT access), `authorize` (roles: enum `UserRole` — super_admin, tenant_admin, agent), `requireTenant`, `rateLimit`, `error` (handler global con `AppError`).
- Auth: JWT access de 15min + refresh token en cookie httpOnly (secrets separados). `shared/services/jwt.service.ts` ya implementado.
- Errores: tirar subclases de `AppError` (`shared/errors/`); el middleware `error.ts` las serializa a JSON `{ error: { code, message } }`.
- Path alias `@/` → `src/` (tsconfig + tsc-alias en build).
- Schema Prisma (`prisma/schema.prisma`): Plan, Tenant, Subscription, Payment, User, Property, PropertyMedia, PropertyFeature, Inquiry, TenantDomain, TenantSiteConfig, SiteCarouselImage, AuditLog.

### Resolución de tenant (diseño, parcialmente implementado)

Cada inmobiliaria tiene web propia accesible por slug, subdominio (`*.plataforma.com`) y dominio custom con SSL automático (Caddy + Let's Encrypt). El middleware de resolución por subdominio/slug/`Host` header es tarea de Fase 1. Env vars: `PLATFORM_DOMAIN`, `CUSTOM_DOMAIN_TARGET`.

### Frontend (`frontend/src/`)

**Estado actual: UI completa pero 100% mock, sin conexión al backend.** Datos hardcodeados en `src/data/mock.ts`, `panelMock.ts`, `adminMock.ts`. Sin axios/zustand/react-hook-form/zod todavía (previstos en el plan). Al conectar un módulo al backend, reemplazar el mock correspondiente.

- Tres áreas: sitio público (`/`), panel inmobiliaria (`/panel/*`, layout `PanelLayout`), panel super admin (`/admin/*`, layout `AdminLayout`). `PanelLayout` y `AdminLayout` comparten `DashShell` (sidebar + header); `Sidebar` es parametrizable.
- Theming multitenant: todos los colores en CSS variables en `src/index.css` (`--brand` teal #0F766E, `--accent` amber #F59E0B, `--topbar`…). No hardcodear colores — el re-tematizado por inmobiliaria depende de esas variables. Fuente Poppins. Reglas de diseño en `screenshotsUI/reglas_diseno.md`.
- Precios siempre en ARS con el helper `formatARS`.

### Decisiones técnicas fijadas (ver plan_estrategico.md)

- Proveedor de pagos detrás de interfaz `PaymentProvider` (MercadoPago primero, Stripe intercambiable).
- Multimedia por presigned URLs directo a Cloudinary/S3 — nunca pasa por el backend.
- Validación con Zod en backend y frontend (schemas compartibles).
- Reverse proxy Caddy (no Nginx) por SSL automático para dominios dinámicos.

## Idioma

Código, comentarios y mensajes de error del repo en español (identificadores en inglés). Mantener esa convención.
