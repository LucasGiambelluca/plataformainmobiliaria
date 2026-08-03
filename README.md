# Plataforma Inmobiliaria Multitenant

SaaS para inmobiliarias. Cada una tiene su panel, su catálogo y su web propia
—con carrusel, colores y dominio propio con SSL automático—, sobre una única
base de datos aislada por `tenant_id`.

**Stack:** Node.js + Express + TypeScript + Prisma + PostgreSQL 16 (backend),
Vite + React 18 + Tailwind (frontend), MinIO para multimedia, Caddy en el borde.

```
backend/    API REST, multitenancy, suscripciones, pagos, multimedia
frontend/   Portal público, panel de inmobiliaria y panel de super admin
deploy/     Caddyfile de producción
docs/       Arquitectura, guía de despliegue y estado del proyecto
```

---

## Levantarlo en local

Hacen falta las dos mitades. Primero el backend:

```bash
cd backend
cp .env.example .env          # JWT_SECRET y JWT_REFRESH_SECRET: mínimo 32 chars
docker compose up -d          # PostgreSQL 16 + MinIO
node scripts/init-bucket.cjs  # crea el bucket y lo deja de lectura pública
npm install
npm run prisma:migrate
npm run prisma:seed           # 3 planes + super admin
npm run dev                   # http://localhost:3000
```

Después el frontend, en otra terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

**Sin Docker** (es el caso de la PC de desarrollo), Postgres y MinIO corren
desde binarios portables:

```bash
cd backend
.\scripts\pg.ps1 start
.\scripts\minio.ps1 start
```

No instalan servicios de Windows ni tocan el registro: para desinstalar alcanza
con borrar las carpetas del perfil del usuario.

---

## Comandos

| | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Desarrollo | `npm run dev` | `npm run dev` |
| Tests | `npm test` | `npm test` |
| Un archivo | `npx jest tests/unit/auth.service.test.ts` | `npx vitest run tests/unit/api.test.ts` |
| Typecheck | `npm run typecheck` | `npm run build` |
| Lint | `npm run lint` | `npm run lint` |
| Build | `npm run build` | `npm run build` |

Los tests unitarios no necesitan base: mockean los repositorios.

Migraciones: `npm run prisma:migrate` en desarrollo, `npm run prisma:deploy` en
producción. `npm run db:reset` destruye los datos.

---

## Producción

VPS único con Docker Compose:

```bash
cp .env.production.example .env.production   # completar secretos
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

El paso a paso completo —DNS, certificados, seed, backups y qué mirar cuando
algo falla— está en **[docs/deploy.md](docs/deploy.md)**.

---

## Cómo está armado

Cuatro decisiones que explican casi todo el código:

**Aislamiento por `tenant_id`.** Toda query de negocio pasa por
`BaseRepository`, que exige el tenant. No existe un `findAll` sin él, y buscar
por id filtra por `{ id, tenantId }`: un recurso ajeno responde 404, sin
revelar que existe. La única excepción es el catálogo público, que cruza
inmobiliarias a propósito y lo compensa con una constante de visibilidad
obligatoria en cada consulta.

**Servicios externos detrás de una interfaz.** Storage, pagos, correo y DNS
tienen su contrato y una implementación falsa. La plataforma arranca y se
testea sin cuenta de MercadoPago, sin servidor de correo y sin storage.

**Un dominio propio se activa por DNS, nunca por un botón.** El backend
consulta el CNAME real contra el target de la plataforma y solo entonces lo
sirve. No hay forma de marcarlo activo a mano, tampoco para el super admin:
sería regalar el dominio de un tercero.

**El plan sube cuando el pago se confirma, no cuando se abre el checkout.** El
webhook verifica la firma HMAC antes de mirar el cuerpo y le pregunta el estado
real a la pasarela, porque el cuerpo lo puede escribir cualquiera que conozca
la URL.

El diseño completo está en [docs/arquitectura.md](docs/arquitectura.md); el
plan por fases en [plan_estrategico.md](plan_estrategico.md); el avance real,
tarea por tarea, en [docs/tablero-estado.html](docs/tablero-estado.html).

---

## Idioma

Código, comentarios y mensajes de error en español, identificadores en inglés.
