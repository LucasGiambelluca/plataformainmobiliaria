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
- Módulos construidos: `auth`, `tenants`, `users`, `subscriptions`, `properties`, `media`, `public`, `sites`, `inquiries`, `billing`, `notifications`, `audit`, `analytics`, `domains`, `seo`. Están todos los del diseño.
- `seo` es la única excepción a que todo cuelgue de `/api`: `sitemap.xml` y `robots.txt` se montan en la raíz porque es donde los busca un crawler, y Caddy los reenvía al backend antes de servir los estáticos. Sus consultas viven en `public.repository.ts` a propósito, para que el filtro de visibilidad siga estando en un solo archivo.
- Correo en `shared/services/email/` (interfaz + Resend + fake) y `modules/notifications/` decide qué se manda y cuándo: lead recibido, bienvenida, pago confirmado y pago rechazado. **Un correo nunca puede romper la operación que lo disparó**: `NotificationsService` se traga sus propios errores y loguea. Si el proveedor está caído, la consulta se guarda igual y el pago se acredita igual.
- Las plantillas escapan todo lo que viene del usuario: el nombre y el mensaje de una consulta los escribe cualquiera desde el formulario público.
- Pagos en `shared/services/payments/`: interfaz `PaymentProvider` + MercadoPago (modelo **preapproval**, débito recurrente) + `FakePaymentProvider` para dev y tests. `PAYMENT_PROVIDER=mercadopago` exige access token y webhook secret; sin secret no se puede verificar la firma.
- **Dos reglas del cobro que no se negocian.** (1) El webhook verifica la firma HMAC ANTES de mirar nada, y consulta el estado real al proveedor en vez de creerle al cuerpo: el cuerpo lo puede escribir cualquiera que conozca la URL. (2) Abrir el checkout deja el plan en `pendingPlanId`, **nunca** en `planId`. El upgrade se concede solo al confirmarse el pago — si se aplicara antes, bastaba con abrir el checkout y abandonarlo para quedarse con el plan caro gratis.
- Cancelar una suscripción corta el débito en la pasarela además de marcarlo en la base. `subscriptions.router` recibe el canceller inyectado para no arrastrar el repositorio real de billing a sus tests.
- El alta de consultas es pública y escribe en la base sin login: el `tenantId` sale **siempre** de la propiedad, nunca del body, y la propiedad tiene que ser visible (mismas dos condiciones que el catálogo). Lleva rate limit propio, más estricto que el público general, y un honeypot que responde 201 al bot en vez de 422 para no avisarle que lo detectamos.
- Resolución de tenant en `shared/middleware/resolveTenant.ts` (tareas 1.7 y 1.21): slug de ruta → subdominio de `PLATFORM_DOMAIN` → `Host` contra `tenant_domains`. Las tres vías están implementadas de punta a punta —backend, Caddy y frontend (`src/lib/host.ts` decide qué pantalla monta la raíz)—; lo único que falta para que un subdominio o un dominio propio funcionen es cargar los registros DNS del VPS. Un dominio propio **nunca** se resuelve por slug: si no está verificado en `tenant_domains`, no hay web. `www.midominio.com` cae al dominio pelado si no está cargado aparte: nadie carga las dos variantes y cada fila cuesta un cupo del plan.
- **El estado de un dominio propio sale siempre del DNS, nunca de un botón.** `modules/domains/` consulta el CNAME (o el registro A, porque un dominio pelado no admite CNAME) contra `CUSTOM_DOMAIN_TARGET` y solo entonces lo pasa a `active`. No hay endpoint para marcarlo activo a mano, tampoco para el super admin: un dominio activo hace que `resolveTenant` sirva la web de esa inmobiliaria en ese host, así que activarlo sin comprobar a dónde apunta sería regalar el dominio de un tercero. Sin registros → `verifying` (propagando); apuntando a otro lado → `failed`; DNS caído → 503 y el estado queda como estaba, que el problema es nuestro.
- La resolución DNS vive detrás de la interfaz `DnsResolver` (`shared/services/dns/`), mismo patrón que `StorageProvider` y `PaymentProvider`: implementación con `node:dns/promises` contra resolvers públicos (evita el caché del SO, que le mostraría al usuario su configuración vieja) más `FakeDnsResolver` para tests y para desarrollo local. `DNS_RESOLVER=fake` no verifica nada.
- Reclamar un dominio solo exige que el nombre esté libre, así que alguien podría pedir uno ajeno y dejarlo bloqueado. La salida es la baja desde `/api/admin/domains`, no un chequeo extra en el alta.
- Cuántos dominios propios entran lo decide `Plan.maxDomains`, con el mismo `LimitService` que usuarios, propiedades y storage. Puede ser 0: el plan Básico se sirve solo por slug y subdominio.
- Un sitio sin `isPublished` responde 404 igual que uno inexistente: desde afuera no se distingue.
- **`public` es la única excepción a la regla de `BaseRepository`**: el catálogo abierto lee a través de todos los tenants a propósito, que es justo lo que `BaseRepository` prohíbe. Lo que reemplaza al aislamiento es la constante `visibilidad` de `public.repository.ts` — solo `published`/`featured` de tenants activos — que **toda** consulta del archivo tiene que incluir. Si una query nueva la olvida, se filtran borradores o propiedades de una inmobiliaria suspendida. `tests/unit/public.repository.test.ts` mockea Prisma justamente para verificar que ningún `where` salga sin ella.
- El catálogo público no expone filtro de estado: qué es visible lo decide el servidor. `onlyFeatured` restringe dentro de lo visible, nunca lo amplía.
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

**Estado actual: todo conectado.** Usan el backend real auth, inmobiliarias, planes, suscripción, propiedades con carga de fotos, el sitio público, leads, mi sitio, dominios, auditoría, los dashboards y el directorio de inmobiliarias. De `src/data/mock.ts` solo queda la publicidad (`ads`, que alimenta `AdSlot`): está fuera del alcance del plan, así que no hay módulo de backend del que leerla. `panelMock.ts`, `adminMock.ts` y `src/types.ts` ya no existen, y `formatARS` se mudó a `src/lib/format.ts`. Al conectar un módulo, borrar el mock correspondiente en vez de dejarlo huérfano.

**SEO (tarea 4.9).** `src/lib/seo.ts` arma las etiquetas y el JSON-LD; el hook `useSeo` las vuelca en el `<head>` de la pantalla montada. La aplicación es una SPA sin SSR: Google ejecuta JS y las ve, pero **los previsualizadores de WhatsApp, Facebook y X leen el HTML crudo y no**. Arreglar eso pide prerender o SSR. `applySeo` borra siempre lo que escribió antes en vez de actualizar en el lugar: si actualizara, pasar de una propiedad con foto a una sin foto dejaría el `og:image` viejo pegado a la nueva. El `sitemap.xml` y el `robots.txt` los sirve el backend desde la raíz (`modules/seo/`), no la SPA, y **dependen del host**: en el portal listan a todas las inmobiliarias, en el dominio propio de una solo sus propiedades.

**Qué host es cuál (`src/lib/host.ts`).** El bundle es uno solo para todos los dominios, así que la SPA tiene que saber si está sirviendo el portal o la web de una inmobiliaria: en el segundo caso la raíz muestra `AgencySite` y no `Home`. Es el espejo en el navegador de `resolveTenant`, incluida la lista de subdominios reservados — **si las dos listas divergen, la SPA pide un sitio que el backend nunca va a resolver**. Sale de `VITE_PLATFORM_DOMAIN`, que Vite congela en el bundle: cambiarlo obliga a reconstruir la imagen del frontend. Sin definir (desarrollo), todo host es el portal.

Los estados de carga de las pantallas públicas van con los esqueletos de `src/components/common/Skeleton.tsx`, no con `Spinner`: dibujan la forma de lo que viene y el layout no salta. El `Spinner` queda para acciones puntuales (guardar, subir un archivo), donde no hay forma que anticipar.

Las etiquetas en español de los enums del backend viven en `src/lib/propertyLabels.ts` y `src/lib/domainLabels.ts`, no en un componente: las comparten el panel, el catálogo, la ficha y el panel global.

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
