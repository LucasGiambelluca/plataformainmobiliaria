# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Plataforma SaaS multitenant para inmobiliarias. Monorepo: `backend/` (Express + TypeScript + Prisma + PostgreSQL) y `frontend/` (Vite + React 18 + Tailwind 3). El roadmap completo está en `plan_estrategico.md` (6 fases) y el diseño técnico detallado en `docs/arquitectura.md` — consultarlos antes de decisiones de arquitectura.

## Comandos

Todo el backend se corre desde `backend/`:

```bash
docker compose up -d          # PostgreSQL 16 (inmobiliaria_pg :5432) + MinIO (inmobiliaria_minio :9000, consola :9001)
.\scripts\pg.ps1 start        # alternativa sin Docker: Postgres portable (start|stop|status|psql)
.\scripts\minio.ps1 start     # alternativa sin Docker: MinIO portable (start|stop|status|init)
node scripts/init-bucket.cjs  # crea el bucket y le pone lectura pública (idempotente)
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
npm run build                 # tsc -b && vite build (typechequea src/ y tests/)
npm test                      # vitest run
npm run test:watch            # vitest en watch
npx vitest run tests/unit/api.test.ts   # un solo archivo
```

El frontend habla con el backend, así que para levantarlo hace falta el backend corriendo (`docker compose up -d` + `npm run dev` en `backend/`) y `frontend/.env` con `VITE_API_URL` (copiar de `.env.example`). El backend solo acepta credenciales desde su `FRONTEND_URL`.

Requiere `backend/.env` (copiar de `.env.example`). `src/config/env.ts` valida con Zod y **aborta el proceso** si falta algo: `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` (mínimo 32 chars) son obligatorias.

**La PC de desarrollo no tiene Docker.** Postgres y MinIO corren desde binarios portables en el perfil del usuario (`%USERPROFILE%\pgsql16` + cluster en `pgdata16`; `%USERPROFILE%\minio` + datos en `miniodata`), manejados por `backend/scripts/pg.ps1` y `backend/scripts/minio.ps1`. No hay servicios de Windows ni entradas de registro: para desinstalar alcanza con borrar esas carpetas. En el VPS va PostgreSQL como servicio y MinIO por `docker-compose.yml`, que sigue siendo la referencia. Ojo: existe un directorio huérfano en `C:\Program Files\PostgreSQL\16\data` de una instalación vieja **sin binarios** — no es el cluster que usamos, no tocarlo.

Los tests unitarios no necesitan base: mockean los repositorios.

## Arquitectura

### Multitenancy — la regla central

Shared database con `tenant_id` en toda tabla de negocio. El aislamiento se garantiza en `backend/src/shared/repository/BaseRepository.ts`: **toda query exige `tenantId`**, no existe `findAll` sin tenant, y las operaciones por id filtran por `{ id, tenantId }` devolviendo NotFound si no pertenece (no se revela existencia de recursos ajenos). Todo repositorio nuevo debe extender `BaseRepository`; nunca usar `prisma.<model>` directo para datos de negocio con tenant.

### Backend (`backend/src/`)

- `app.ts` monta helmet, cors, rate limit y el router raíz; `server.ts` levanta y conecta Prisma.
- `routes/index.ts` es el router raíz de la API (`/api`). Convención de módulos: `src/modules/<nombre>/` con router + service + repository + schemas. Cada router exporta una factory (`createXRouter(service)`) más una instancia con el wiring por defecto: los tests inyectan un service falso por la factory.
- Módulos construidos: `auth`, `tenants`, `users`, `subscriptions`, `properties`, `media`. Faltan `sites`, `domains`, `billing`, `notifications`, `inquiries`, `audit`.
- `media` se monta anidado bajo `properties` (`/api/properties/:propertyId/media`), por eso su router usa `mergeParams` y repite `authorize`/`requireTenant` en vez de confiar en dónde lo montan.
- Subida de multimedia en dos pasos: `POST .../media/upload-url` firma la URL y reserva el cupo con el tamaño **declarado**; `POST .../media/:id/confirm` contrasta contra el tamaño **real** del objeto (`head`) y ajusta. Sin ese contraste, declarar 1 byte y subir 4 GB saltearía el límite del plan.
- **El presigner necesita `signableHeaders: new Set(["content-type"])` sí o sí.** Sin eso firma solo el host y el storage acepta cualquier Content-Type en el PUT (verificado contra MinIO). Como el bucket es de lectura pública, permitiría alojar HTML arbitrario en el dominio del CDN. `confirm` además vuelve a contrastar el Content-Type almacenado contra el que corresponde a la extensión de la clave.
- `shared/middleware/`: `authenticate` (verifica JWT access), `authorize` (roles: enum `UserRole` — super_admin, tenant_admin, agent), `requireTenant`, `rateLimit`, `error` (handler global con `AppError`).
- Auth: JWT access de 15min + refresh token en cookie httpOnly (secrets separados). `shared/services/jwt.service.ts` ya implementado.
- Errores: tirar subclases de `AppError` (`shared/errors/`); el middleware `error.ts` las serializa a JSON `{ error: { code, message } }`.
- Storage de multimedia: `shared/services/storage/` con interfaz `StorageProvider` (mismo patrón que `PaymentProvider`). Implementación S3-compatible contra el MinIO del docker-compose; `FakeStorageProvider` para tests y para arrancar sin storage. `STORAGE_PROVIDER=s3` exige las `S3_*` — `env.ts` no deja arrancar sin ellas.
- **La clave del objeto no se guarda**: se deriva de `url` con `keyFromPublicUrl`. Si cambia `S3_PUBLIC_URL` las URLs viejas dejan de resolver a una clave y sus archivos quedan huérfanos. Al migrar de dominio hay que reescribir las `url` guardadas.
- Serialización: los `Decimal` de Prisma se pasan a string y los `BigInt` a number **en el repositorio**. `res.json()` tira una excepción con BigInt.
- Path alias `@/` → `src/` (tsconfig + tsc-alias en build).
- Schema Prisma (`prisma/schema.prisma`): Plan, Tenant, Subscription, Payment, User, Property, PropertyMedia, PropertyFeature, Inquiry, TenantDomain, TenantSiteConfig, SiteCarouselImage, AuditLog.

### Resolución de tenant (diseño, parcialmente implementado)

Cada inmobiliaria tiene web propia accesible por slug, subdominio (`*.plataforma.com`) y dominio custom con SSL automático (Caddy + Let's Encrypt). El middleware de resolución por subdominio/slug/`Host` header es tarea de Fase 1. Env vars: `PLATFORM_DOMAIN`, `CUSTOM_DOMAIN_TARGET`.

### Frontend (`frontend/src/`)

**Estado actual: parcialmente conectado.** Auth, inmobiliarias, planes y suscripción usan el backend real; el resto sigue con datos hardcodeados en `src/data/mock.ts`, `panelMock.ts`, `adminMock.ts` porque todavía no existe el módulo backend correspondiente (propiedades, leads, dominios, auditoría). Al conectar un módulo, reemplazar el mock correspondiente.

- Capa de acceso a datos: `src/lib/api.ts` (cliente axios con `withCredentials`, refresh automático ante 401 y helpers `getJson`/`postJson`/`patchJson` que validan la respuesta con Zod), `src/api/*` (un archivo por módulo del backend), `src/api/schemas.ts` (espejo de los contratos y schemas de formularios). Errores normalizados en `src/lib/apiError.ts` como `ApiError`.
- Sesión: `src/store/auth.ts` (Zustand). El access token vive **solo en memoria** (`src/lib/session.ts`), nunca en localStorage; la sesión sobrevive al F5 por la cookie httpOnly de refresh. El refresh es single-flight a propósito: el backend rota los refresh tokens y trata la reutilización como robo, revocando todas las sesiones.
- Rutas privadas con `RequireAuth` (por rol). `VITE_API_URL` configura la API (ver `.env.example`).
- Fetching en pantallas con `useResource` (`src/hooks/useResource.ts`): estados `loading`/`error`/`reload`, sin caché. Si hace falta caché compartida, el reemplazo natural es TanStack Query.
- Tests con Vitest en `frontend/tests/` (config propia en `vitest.config.ts`, entorno `node`). Las peticiones se interceptan con un adapter falso de axios (`tests/helpers/mockServer.ts`) instalado desde `tests/setup.ts` **antes** de que `lib/api.ts` cree sus instancias — por eso no hace falta exportar el cliente interno del refresh. Los interceptores corren de verdad. `src/lib/api.ts` y `src/lib/session.ts` guardan estado a nivel de módulo (token y refresh en vuelo): resetearlo en `beforeEach`.
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
