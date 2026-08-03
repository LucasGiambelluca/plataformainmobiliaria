# Fase 5 — Testing de integración, aislamiento y CI

> **Para agentes:** SUB-SKILL REQUERIDO: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para el seguimiento.

**Objetivo:** cerrar las tareas 5.2 y 5.3 del plan estratégico —tests de integración y de aislamiento entre inquilinos contra una base PostgreSQL real— y dejar un CI que los corra solo, para poder encarar el deploy (5.7) sabiendo que el código funciona.

**Arquitectura:** Jest pasa a tener dos *projects*: `unit` (lo que ya existe, con Prisma mockeado) e `integration` (nuevo, contra `realestate_test` en el Postgres portable). Los tests de integración levantan la app real con `createApp()` y la manejan con supertest, sin mockear nada salvo los proveedores externos —storage, pagos, correo y DNS ya tienen implementaciones fake detrás de una interfaz—. Cada test arranca con la base truncada y siembra solo lo que necesita.

**Stack:** Jest 29 + ts-jest, supertest (ya instalados), Prisma contra PostgreSQL 16 portable (`scripts/pg.ps1`), GitHub Actions con el servicio `postgres:16`.

---

## Por qué este orden, y qué necesita el VPS

El deploy (5.7) va **después** de esta fase, no antes. La configuración de producción nunca corrió: si se ejecuta antes de tener los tests de integración, cualquier falla obliga a depurar dos cosas nuevas al mismo tiempo —el código sin probar contra base real y una infra sin estrenar— sin saber cuál de las dos rompió.

De la fase 5, esto es lo único que **sí** necesita el servidor y por lo tanto queda fuera de este plan:

| Tarea | Por qué necesita el VPS |
|---|---|
| 5.4 E2E de dominio propio hasta el SSL | Let's Encrypt valida por HTTP-01 contra un host público; no hay forma de emitir un certificado real desde localhost |
| 5.7 Deploy en el servidor | — |
| 5.12 Smoke testing en producción | Depende del deploy |

Las tareas 5.5 (performance), 5.10 (manual de usuario) y 5.11 (capacitación) tampoco están acá: no son testing. Van en un plan aparte, después de este.

## Lo que este plan NO cubre a propósito

- **E2E de navegador (Playwright).** Se descartó en la decisión de alcance. Los tests de acá llegan hasta la API: verifican que el backend hace lo correcto, no que el formulario de React manda lo correcto. El circuito por navegador se sigue probando a mano.
- **Pruebas de carga.** Medir concurrencia en la PC de desarrollo no predice el VPS.
- **Frontend.** Sus 68 pruebas ya cubren el cliente HTTP, la sesión y las transformaciones. No se tocan.

## Reglas que valen para todas las tareas

1. **TDD de verdad.** Escribir el test, verlo fallar por el motivo correcto, recién ahí tocar el código. En este plan casi ningún test necesita código nuevo —el backend ya está construido— así que **el test tiene que pasar en verde a la primera**. Si pasa a la primera, está bien.

   **Si falla, primero preguntate si el test está mal.** El código de los tests de este plan se escribió leyendo el repo pero sin ejecutarlo: una afirmación puede estar equivocada sobre lo que un endpoint devuelve. Comprobá contra el router y el servicio reales antes de tocar producción. Cambiar el backend para satisfacer un test mal escrito es peor que no tener el test —y en un caso concreto, agregarle un campo a la respuesta de `/me` significaría una consulta a la base en cada request autenticado—. Recién cuando el test dice la verdad y el código no la cumple, encontraste un bug real: ese es el punto de la fase.
2. **Un test, una afirmación de negocio.** El nombre del test dice la regla en castellano, como en las suites que ya existen.
3. **Nada de `sleep`.** Si un test necesita esperar, está mal diseñado.
4. **Ojo con los ceros de la plata.** Postgres devuelve un `Decimal` normalizado: se guarda `"150000.00"` y se lee `"150000"`. Los decimales significativos sí sobreviven (`"189500.55"` vuelve igual). Escribí en la afirmación lo que la base devuelve, no lo que insertaste.
5. **Commit por tarea**, con los tests en verde.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `backend/scripts/test-db.ps1` | Crea `realestate_test` y le aplica las migraciones. Idempotente. |
| `backend/tests/integration/helpers/db.ts` | Conexión de tests, `truncateAll()` y el guardarraíl que impide truncar una base que no sea de test. |
| `backend/tests/integration/helpers/factories.ts` | Alta de planes, inmobiliarias, usuarios y propiedades para armar escenarios. |
| `backend/tests/integration/helpers/auth.ts` | Login por API y armado del header `Authorization`. |
| `backend/tests/integration/setup-db.ts` | `beforeEach` global: trunca. `afterAll`: desconecta. |
| `backend/tests/integration/auth.test.ts` | Registro, login, rotación de refresh y detección de reuso. |
| `backend/tests/integration/isolation.test.ts` | **El más importante.** Un tenant no ve ni toca nada de otro. |
| `backend/tests/integration/properties.test.ts` | CRUD, transiciones de estado y límite del plan. |
| `backend/tests/integration/public.test.ts` | Visibilidad del catálogo abierto contra datos reales. |
| `backend/tests/integration/inquiries.test.ts` | Alta pública de consultas, honeypot y origen del tenantId. |
| `backend/tests/integration/billing.test.ts` | Webhook: firma, y que el plan suba solo al confirmarse el pago. |
| `backend/tests/integration/domains.test.ts` | Alta de dominio, verificación por DNS y el endpoint que autoriza a Caddy. |
| `.github/workflows/ci.yml` | typecheck + unit + integración + build del frontend en cada push. |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `backend/jest.config.js` | Pasa a `projects: [unit, integration]`. |
| `backend/package.json` | Scripts `test:unit`, `test:integration`, `test:db`. |
| `backend/tests/setup-env.ts` | Agrega los proveedores fake que faltan (`PAYMENT_PROVIDER`, `EMAIL_PROVIDER`, `DNS_RESOLVER`). |

---

## Tarea 1: Infraestructura de la base de test

**Archivos:**
- Crear: `backend/scripts/test-db.ps1`
- Crear: `backend/tests/integration/helpers/db.ts`
- Crear: `backend/tests/integration/setup-db.ts`
- Modificar: `backend/jest.config.js`
- Modificar: `backend/tests/setup-env.ts`
- Modificar: `backend/package.json`

- [ ] **Paso 1: Script que crea la base de test**

Crear `backend/scripts/test-db.ps1`:

```powershell
# Base de datos para los tests de integración.
#
# Vive en el mismo cluster portable que la base de desarrollo pero es OTRA base:
# los tests la truncan entera antes de cada caso, así que apuntarlos a
# `realestate` borraría los datos con los que trabajás.
#
#   .\scripts\test-db.ps1          crea la base si no existe y aplica migraciones
#   .\scripts\test-db.ps1 -Reset   la borra y la vuelve a crear desde cero

param([switch]$Reset)

$ErrorActionPreference = "Stop"

$Bin = Join-Path $env:USERPROFILE "pgsql16\pgsql\bin"
$Db = "realestate_test"
$Url = "postgresql://app:devpassword@localhost:5432/$Db`?schema=public"

if (-not (Test-Path (Join-Path $Bin "psql.exe"))) {
  Write-Error "No encuentro los binarios en $Bin. Corré .\scripts\pg.ps1 status primero."
}

$env:PGPASSWORD = "devpassword"

if ($Reset) {
  & "$Bin\psql.exe" -U app -h localhost -d postgres -c "DROP DATABASE IF EXISTS $Db"
}

# `createdb` falla si ya existe: se consulta antes para que el script sea idempotente.
$existe = & "$Bin\psql.exe" -U app -h localhost -d postgres -tAc `
  "SELECT 1 FROM pg_database WHERE datname = '$Db'"

if ($existe -ne "1") {
  & "$Bin\createdb.exe" -U app -h localhost $Db
  Write-Host "Base $Db creada."
}

# migrate deploy y no migrate dev: no genera migraciones nuevas ni pide confirmación.
$env:DATABASE_URL = $Url
& npx prisma migrate deploy

Write-Host "Base de test lista en $Url"
```

- [ ] **Paso 2: Correr el script y verificar**

```powershell
.\scripts\pg.ps1 start
.\scripts\test-db.ps1
```

Esperado: `Base realestate_test creada.` seguido de `X migrations found` y `All migrations have been successfully applied.`

- [ ] **Paso 3: Helper de base con guardarraíl**

Crear `backend/tests/integration/helpers/db.ts`:

```typescript
import { prisma, disconnectDatabase } from "@/config/database";

export { prisma };

/**
 * Se reusa el cliente Prisma de la app y no uno propio a propósito: los tests
 * y el código bajo prueba tienen que ver la MISMA base y compartir el pool de
 * conexiones. Con dos clientes, un dato escrito por el test podría no verse
 * desde el endpoint, y Postgres se queda sin conexiones a la tercera suite.
 */

/**
 * Vacía todas las tablas de negocio.
 *
 * TRUNCATE ... CASCADE y no DELETE: es más rápido y no pelea con las claves
 * foráneas. `_prisma_migrations` queda afuera — borrarla haría que Prisma crea
 * que la base está sin migrar.
 */
export async function truncateAll(): Promise<void> {
  guardarBaseDeTest();

  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tablas.length === 0) return;

  const lista = tablas.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  await disconnectDatabase();
}

/**
 * Cortafuegos: si por un error de configuración DATABASE_URL apunta a la base
 * de desarrollo, truncar la borraría entera. Preferible que la suite no arranque.
 */
function guardarBaseDeTest(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/realestate_test/.test(url)) {
    throw new Error(
      `Los tests de integración solo corren contra realestate_test. DATABASE_URL apunta a: ${url}`,
    );
  }
}
```

- [ ] **Paso 4: Hook global de limpieza**

Crear `backend/tests/integration/setup-db.ts`:

```typescript
import { closeDb, truncateAll } from "./helpers/db";

// Antes de CADA test, no después: si un test se cuelga o se corre uno solo con
// -t, la base igual arranca limpia. Limpiar después deja basura cuando algo falla.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});
```

- [ ] **Paso 5: Proveedores fake en el entorno de test**

Modificar `backend/tests/setup-env.ts`, agregando al final:

```typescript
// Los tests de integración levantan la app entera: sin esto, el módulo de
// cobros intentaría hablar con MercadoPago y el de dominios haría consultas DNS
// reales. Cada proveedor tiene su implementación fake detrás de la interfaz.
process.env.PAYMENT_PROVIDER ??= "fake";
process.env.EMAIL_PROVIDER ??= "fake";
process.env.DNS_RESOLVER ??= "fake";

// El endpoint que autoriza los certificados de Caddy rechaza TODO cuando el
// token está vacío, que es el default de env.ts. Sin esto, sus tests no podrían
// distinguir "host no autorizado" de "token sin configurar".
process.env.CADDY_ASK_TOKEN ??= "token-de-test-para-caddy";
```

- [ ] **Paso 6: Partir Jest en dos projects**

Reemplazar `backend/jest.config.js` entero:

```javascript
/** @type {import('ts-jest').JestConfigWithTsJest} */
const base = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  clearMocks: true,
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: "unit",
      // Mockean Prisma: corren en cualquier lado, sin base.
      roots: ["<rootDir>/src", "<rootDir>/tests/unit"],
    },
    {
      ...base,
      displayName: "integration",
      // Exigen Postgres con realestate_test migrada (scripts/test-db.ps1).
      roots: ["<rootDir>/tests/integration"],
      setupFilesAfterEnv: ["<rootDir>/tests/integration/setup-db.ts"],
      // La app tarda en levantar el pool en el primer test de cada suite.
      testTimeout: 20_000,
    },
  ],
};
```

- [ ] **Paso 7: Scripts de npm**

Modificar `backend/package.json`, reemplazando la línea de `"test"`:

```json
    "test": "jest --runInBand",
    "test:unit": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration --runInBand",
    "test:db": "powershell -ExecutionPolicy Bypass -File scripts/test-db.ps1",
```

> `--runInBand` en integración no es opcional: los tests comparten una sola base y truncan antes de cada caso. En paralelo se borrarían los datos entre ellos.

- [ ] **Paso 8: Verificar que los unitarios siguen andando**

```bash
npm run test:unit
```

Esperado: `Tests: 329 passed, 329 total`. Si bajó el número, el `roots` del project `unit` quedó mal.

- [ ] **Paso 9: Verificar que integración arranca vacío**

```bash
npm run test:integration
```

Esperado: `No tests found` — todavía no hay ninguno. Que **no** tire el error del guardarraíl.

- [ ] **Paso 10: Commit**

```bash
git add backend/jest.config.js backend/package.json backend/scripts/test-db.ps1 backend/tests/setup-env.ts backend/tests/integration/
git commit -m "test: split jest into unit and integration projects"
```

---

## Tarea 2: Fábricas de datos y helper de autenticación

**Archivos:**
- Crear: `backend/tests/integration/helpers/factories.ts`
- Crear: `backend/tests/integration/helpers/auth.ts`
- Crear: `backend/tests/integration/smoke.test.ts`

- [ ] **Paso 1: Fábricas**

Crear `backend/tests/integration/helpers/factories.ts`:

```typescript
import bcrypt from "bcryptjs";
import type { PropertyStatus, UserRole } from "@prisma/client";
import { prisma } from "./db";

/**
 * Altas mínimas para armar escenarios. Cada fábrica pide solo lo que el test
 * necesita nombrar y completa el resto: un test sobre aislamiento no tiene por
 * qué elegir el año de construcción de una propiedad.
 */

export const PASSWORD = "password-de-test";

/**
 * El alta self-serve exige que exista el plan "basico" (DEFAULT_PLAN_SLUG).
 * Por eso llamarla dos veces sin `slug` rompe el unique: pasale uno.
 */
export async function crearPlan(
  overrides: Partial<{
    slug: string;
    name: string;
    priceAmount: string;
    maxProperties: number;
    maxUsers: number;
    maxStorageMb: number;
    maxDomains: number;
  }> = {},
) {
  const slug = overrides.slug ?? "basico";
  return prisma.plan.create({
    data: {
      name: overrides.name ?? "Básico",
      slug,
      priceAmount: overrides.priceAmount ?? "0",
      maxProperties: overrides.maxProperties ?? 10,
      maxUsers: overrides.maxUsers ?? 2,
      maxStorageMb: overrides.maxStorageMb ?? 500,
      maxDomains: overrides.maxDomains ?? 0,
    },
  });
}

export async function crearTenant(
  slug: string,
  overrides: Partial<{ name: string; isActive: boolean }> = {},
) {
  return prisma.tenant.create({
    data: {
      name: overrides.name ?? `Inmobiliaria ${slug}`,
      slug,
      isActive: overrides.isActive ?? true,
      contactEmail: `hola@${slug}.test`,
    },
  });
}

export async function crearUsuario(
  tenantId: string | null,
  overrides: Partial<{ email: string; role: UserRole; name: string }> = {},
) {
  const email = overrides.email ?? `user-${crypto.randomUUID()}@test.com`;
  return prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4), // coste bajo: son tests
      role: overrides.role ?? "tenant_admin",
      name: overrides.name ?? "Usuario de prueba",
    },
  });
}

export async function crearSuscripcion(tenantId: string, planId: string) {
  return prisma.subscription.create({
    data: { tenantId, planId, status: "active" },
  });
}

export async function crearPropiedad(
  tenantId: string,
  overrides: Partial<{
    title: string;
    status: PropertyStatus;
    city: string;
    price: string;
  }> = {},
) {
  return prisma.property.create({
    data: {
      tenantId,
      title: overrides.title ?? "Casa de prueba",
      propertyType: "house",
      operationType: "sale",
      // Sin decimales de relleno a propósito: Postgres devuelve "150000.00"
      // como "150000", y un default con ceros invita a assertions que fallan.
      price: overrides.price ?? "150000",
      currency: "USD",
      city: overrides.city ?? "Paraná",
      status: overrides.status ?? "published",
    },
  });
}

/**
 * Inmobiliaria completa y lista para operar: plan, tenant, suscripción y admin.
 *
 * El admin queda como `admin@<slug>.test` y el plan como `plan-<slug>`: las
 * suites escriben esos strings a mano para loguearse, así que son parte del
 * contrato, no un detalle interno.
 */
export async function crearInmobiliariaCompleta(
  slug: string,
  opciones: {
    planSlug?: string;
    maxProperties?: number;
    maxUsers?: number;
    maxDomains?: number;
    isActive?: boolean;
  } = {},
) {
  // Los límites pasan crudos: quien tiene el default es crearPlan, repetirlo
  // acá haría que cambiar uno solo desincronizara los dos caminos.
  const { planSlug, isActive, ...limites } = opciones;
  const plan = await crearPlan({ slug: planSlug ?? `plan-${slug}`, ...limites });
  const tenant = await crearTenant(slug, { isActive });
  const subscription = await crearSuscripcion(tenant.id, plan.id);
  const admin = await crearUsuario(tenant.id, {
    email: `admin@${slug}.test`,
    role: "tenant_admin",
  });
  return { plan, tenant, subscription, admin };
}
```

- [ ] **Paso 2: Helper de autenticación**

Crear `backend/tests/integration/helpers/auth.ts`:

```typescript
import request from "supertest";
import type { Express } from "express";
import { PASSWORD } from "./factories";

/**
 * Login por la API real y no un JWT firmado a mano.
 *
 * Firmarlo a mano saltearía justo lo que se quiere probar: que el login existe,
 * valida la contraseña y emite un token que el resto de los endpoints acepta.
 */
export async function loguear(app: Express, email: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: PASSWORD });

  if (res.status !== 200) {
    throw new Error(`Login fallido para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

/** Azúcar para no repetir el Bearer en cada pedido. */
export function comoUsuario(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}
```

- [ ] **Paso 3: Test de humo que prueba el arnés**

Crear `backend/tests/integration/smoke.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearTenant } from "./helpers/factories";

const app = createApp();

describe("arnés de integración", () => {
  it("la app responde /health contra la base real", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.env).toBe("test");
  });

  it("escribe y lee de la base de verdad", async () => {
    await crearTenant("humo");

    const encontrado = await prisma.tenant.findUnique({ where: { slug: "humo" } });
    expect(encontrado?.name).toBe("Inmobiliaria humo");
  });

  // Dos veces el mismo test a propósito: cada uno afirma que arranca vacío y
  // deja una fila. El segundo solo puede pasar si el truncate corrió.
  it.each([1, 2])("cada test arranca con la base vacía (%i)", async () => {
    expect(await prisma.tenant.count()).toBe(0);
    await crearTenant("humo");
  });
});
```

- [ ] **Paso 4: Correr**

```bash
npm run test:integration
```

Esperado: `Tests: 4 passed`. Si el tercero falla, `setupFilesAfterEnv` no se está aplicando.

- [ ] **Paso 5: Commit**

```bash
git add backend/tests/integration/
git commit -m "test: add integration fixtures and smoke test"
```

---

## Tarea 3: Aislamiento entre inquilinos (tarea 5.3)

Es la tarea más importante del plan. `baseRepository.test.ts` ya verifica que el repositorio arma el `where` correcto, pero lo hace con Prisma mockeado: comprueba la intención, no el resultado. Acá se comprueba contra una base con datos de dos inmobiliarias.

**Archivos:**
- Crear: `backend/tests/integration/isolation.test.ts`

- [ ] **Paso 1: Escribir la suite completa**

Crear `backend/tests/integration/isolation.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPropiedad } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * El riesgo crítico del proyecto: que una inmobiliaria vea o toque datos de
 * otra. Todo lo de acá corre contra la base real, con dos inmobiliarias
 * cargadas de verdad.
 *
 * La regla que se verifica en cada caso es la misma: pedir un recurso ajeno
 * devuelve 404, no 403. Un 403 confirmaría que el recurso existe, y saber que
 * la propiedad X existe ya es filtrar información de la competencia.
 */
describe("aislamiento entre inquilinos", () => {
  let tokenNorte: string;
  let propiedadDeSur: string;
  let tenantSurId: string;

  beforeEach(async () => {
    const norte = await crearInmobiliariaCompleta("norte");
    const sur = await crearInmobiliariaCompleta("sur");
    tenantSurId = sur.tenant.id;

    await crearPropiedad(norte.tenant.id, { title: "Casa del norte" });
    const ajena = await crearPropiedad(sur.tenant.id, { title: "Casa del sur" });
    propiedadDeSur = ajena.id;

    tokenNorte = await loguear(app, "admin@norte.test");
  });

  it("el listado solo trae las propiedades propias", async () => {
    const res = await request(app)
      .get("/api/properties")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("Casa del norte");
  });

  it("leer una propiedad ajena devuelve 404, no 403", async () => {
    const res = await request(app)
      .get(`/api/properties/${propiedadDeSur}`)
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(404);
  });

  it("editar una propiedad ajena devuelve 404 y no la modifica", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadDeSur}`)
      .set(...comoUsuario(tokenNorte))
      .send({ title: "Secuestrada" });

    expect(res.status).toBe(404);

    const enBase = await prisma.property.findUnique({ where: { id: propiedadDeSur } });
    expect(enBase?.title).toBe("Casa del sur");
  });

  it("cambiar el estado de una propiedad ajena devuelve 404", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadDeSur}/status`)
      .set(...comoUsuario(tokenNorte))
      .send({ status: "paused" });

    expect(res.status).toBe(404);

    const enBase = await prisma.property.findUnique({ where: { id: propiedadDeSur } });
    expect(enBase?.status).toBe("published");
  });

  it("borrar una propiedad ajena devuelve 404 y la deja viva", async () => {
    const res = await request(app)
      .delete(`/api/properties/${propiedadDeSur}`)
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(404);
    expect(await prisma.property.findUnique({ where: { id: propiedadDeSur } })).not.toBeNull();
  });

  it("mandar el tenantId de otro en el body no cambia dónde se crea", async () => {
    // El tenantId sale del JWT: si el body pudiera pisarlo, cualquiera
    // publicaría en la web de la competencia.
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(tokenNorte))
      .send({
        tenantId: tenantSurId,
        title: "Intento de intrusión",
        propertyType: "house",
        operationType: "sale",
        price: "100000.00",
      });

    expect(res.status).toBe(201);

    const creada = await prisma.property.findFirst({
      where: { title: "Intento de intrusión" },
    });
    expect(creada?.tenantId).not.toBe(tenantSurId);
  });

  it("la bandeja de consultas solo muestra las propias", async () => {
    await prisma.inquiry.create({
      data: {
        tenantId: tenantSurId,
        propertyId: propiedadDeSur,
        name: "Consulta ajena",
        email: "alguien@test.com",
        message: "Me interesa la casa del sur.",
      },
    });

    const res = await request(app)
      .get("/api/inquiries")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("el equipo solo lista usuarios de la propia inmobiliaria", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    // Este endpoint devuelve `users`, no `items` como los paginados.
    for (const u of res.body.users) {
      expect(u.email).not.toContain("@sur.test");
    }
  });

  it("la configuración del sitio que se lee es la propia", async () => {
    const res = await request(app)
      .get("/api/site")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    expect(res.body.site.slug).toBe("norte");
  });
});
```

- [ ] **Paso 2: Correr**

```bash
npx jest --selectProjects integration -t "aislamiento" --runInBand
```

Esperado: 9 tests en verde. **Si alguno falla, no lo ajustes: encontraste una fuga de datos real.** Anotala, arreglá el código de producción y volvé a correr.

> Los nombres de los campos de respuesta están verificados contra los routers: los listados paginados (`/api/properties`, `/api/inquiries`) devuelven `{ items, total, page, pageSize }`; `/api/users` devuelve `{ users }`; `/api/site` devuelve `{ site }` con `slug` adentro. Si algo falla por un campo inexistente, revisá el router antes de suponer que hay una fuga.

- [ ] **Paso 3: Commit**

```bash
git add backend/tests/integration/isolation.test.ts
git commit -m "test: verify tenant isolation against a real database"
```

---

## Tarea 4: Autenticación de punta a punta

**Archivos:**
- Crear: `backend/tests/integration/auth.test.ts`

- [ ] **Paso 1: Escribir la suite**

Crear `backend/tests/integration/auth.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { REFRESH_COOKIE } from "@/modules/auth/auth.router";
import { prisma } from "./helpers/db";
import { crearPlan } from "./helpers/factories";

const app = createApp();

/** El alta self-serve exige que exista el plan por defecto. */
beforeEach(async () => {
  await crearPlan({ slug: "basico" });
});

const ALTA = {
  tenantName: "Inmobiliaria Nueva",
  slug: "nueva",
  email: "admin@nueva.test",
  password: "una-clave-larga",
  name: "Ana",
};

/** Extrae la cookie de refresh de la respuesta, para poder reusarla o pisarla. */
function cookieDeRefresh(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = (cookies ?? []).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error("La respuesta no trajo cookie de refresh");
  return cookie.split(";")[0];
}

describe("alta self-serve", () => {
  it("crea la inmobiliaria, el admin y deja la sesión abierta", async () => {
    const res = await request(app).post("/api/auth/register").send(ALTA);

    expect(res.status).toBe(201);
    expect(res.body.tenant.slug).toBe("nueva");
    expect(res.body.accessToken).toEqual(expect.any(String));

    // La contraseña nunca se guarda en claro ni vuelve en la respuesta.
    const user = await prisma.user.findFirst({ where: { email: ALTA.email } });
    expect(user?.passwordHash).not.toBe(ALTA.password);
    expect(JSON.stringify(res.body)).not.toContain(ALTA.password);
  });

  it("el refresh viaja en cookie httpOnly, no en el cuerpo", async () => {
    // Si el refresh token quedara accesible desde JavaScript, un XSS se lo
    // llevaría y la rotación no serviría de nada.
    const res = await request(app).post("/api/auth/register").send(ALTA);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    expect(refresh).toContain("HttpOnly");
    expect(res.body.refreshToken).toBeUndefined();
  });

  it("el alta nace con suscripción al plan básico", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const sub = await prisma.subscription.findFirst({
      where: { tenant: { slug: "nueva" } },
      include: { plan: true },
    });
    expect(sub?.plan.slug).toBe("basico");
  });

  it("un slug repetido devuelve 409 y no crea nada a medias", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ALTA, email: "otro@nueva.test" });

    expect(res.status).toBe(409);
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("un email ya registrado devuelve 409 sin dejar el tenant huérfano", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ALTA, slug: "otra-mas" });

    expect(res.status).toBe(409);
    // Lo que se prueba es que la transacción no dejó el tenant creado con el
    // usuario sin crear: sería una inmobiliaria a la que nadie puede entrar.
    expect(await prisma.tenant.count()).toBe(1);
  });
});

describe("login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(ALTA);
  });

  it("con las credenciales correctas devuelve access token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("con la contraseña equivocada devuelve 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: "cualquier-otra" });

    expect(res.status).toBe(401);
  });

  it("un email inexistente devuelve el mismo 401 que una clave mala", async () => {
    // Mensajes distintos permitirían enumerar qué emails están registrados.
    const inexistente = await request(app)
      .post("/api/auth/login")
      .send({ email: "nadie@test.com", password: ALTA.password });
    const claveMala = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: "cualquier-otra" });

    expect(inexistente.status).toBe(claveMala.status);
    expect(inexistente.body.error.message).toBe(claveMala.body.error.message);
  });

  it("un usuario dado de baja no puede entrar", async () => {
    await prisma.user.updateMany({
      where: { email: ALTA.email },
      data: { isActive: false },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });

    expect(res.status).toBe(401);
  });
});

describe("rotación de refresh tokens", () => {
  it("cada refresh devuelve una cookie nueva y revoca la anterior", async () => {
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const primera = cookieDeRefresh(alta);

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", primera);
    expect(refresh.status).toBe(200);

    const segunda = cookieDeRefresh(refresh);
    expect(segunda).not.toBe(primera);
  });

  it("reusar un refresh ya rotado revoca TODAS las sesiones del usuario", async () => {
    // Es la defensa contra el robo de token: si el atacante lo usa, el legítimo
    // se cae también, y el dueño se entera porque tiene que volver a entrar.
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const primera = cookieDeRefresh(alta);

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", primera);
    const segunda = cookieDeRefresh(refresh);

    // El atacante reusa la vieja.
    const reuso = await request(app).post("/api/auth/refresh").set("Cookie", primera);
    expect(reuso.status).toBe(401);

    // Y la del usuario legítimo también quedó muerta.
    const legitima = await request(app).post("/api/auth/refresh").set("Cookie", segunda);
    expect(legitima.status).toBe(401);

    const vivos = await prisma.refreshToken.count({ where: { revokedAt: null } });
    expect(vivos).toBe(0);
  });

  it("logout revoca el refresh y borra la cookie", async () => {
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const cookie = cookieDeRefresh(alta);

    const salida = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(salida.status).toBeLessThan(300);

    const despues = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(despues.status).toBe(401);
  });

  it("sin cookie, refresh devuelve 401", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("/me", () => {
  it("sin token devuelve 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("con un token inventado devuelve 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer no.es.un.jwt");
    expect(res.status).toBe(401);
  });

  it("con token válido devuelve el usuario sin el hash de contraseña", async () => {
    const alta = await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${alta.body.accessToken}`);

    expect(res.status).toBe(200);
    // `/me` devuelve lo que trae el access token —id, tenant y rol— y nada más.
    // NO esperes el email acá: agregárselo obligaría a pegarle a la base en
    // cada request autenticado. El email sí viaja en /register y /login.
    expect(res.body.user.id).toBe(alta.body.user.id);
    expect(res.body.user.role).toBe("tenant_admin");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});
```

- [ ] **Paso 2: Correr**

```bash
npx jest --selectProjects integration auth --runInBand
```

Esperado: 15 tests en verde.

- [ ] **Paso 3: Commit**

```bash
git add backend/tests/integration/auth.test.ts
git commit -m "test: cover the auth flow end to end"
```

---

## Tarea 5: Propiedades, estados y límite del plan

**Archivos:**
- Crear: `backend/tests/integration/properties.test.ts`

- [ ] **Paso 1: Escribir la suite**

Crear `backend/tests/integration/properties.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import {
  crearInmobiliariaCompleta,
  crearPropiedad,
  crearUsuario,
} from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

const NUEVA = {
  title: "Departamento 2 ambientes",
  propertyType: "apartment",
  operationType: "rent",
  price: "350000.00",
  currency: "ARS",
  city: "Paraná",
  rooms: 2,
};

describe("alta de propiedades", () => {
  let token: string;
  let tenantId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    tenantId = tenant.id;
    token = await loguear(app, "admin@norte.test");
  });

  it("nace en borrador aunque no se pida", async () => {
    // Publicar es una acción explícita: si el alta publicara sola, una carga a
    // medio terminar aparecería en el catálogo público.
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(201);
    const creada = await prisma.property.findFirst({ where: { tenantId } });
    expect(creada?.status).toBe("draft");
  });

  it("el precio se guarda como decimal exacto, sin pasar por float", async () => {
    await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send({ ...NUEVA, price: "189500.55" });

    const creada = await prisma.property.findFirst({ where: { tenantId } });
    expect(creada?.price.toString()).toBe("189500.55");
  });

  it("rechaza un precio con formato de float", async () => {
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send({ ...NUEVA, price: 189500.55 });

    expect(res.status).toBe(422);
  });

  it("sin token devuelve 401", async () => {
    const res = await request(app).post("/api/properties").send(NUEVA);
    expect(res.status).toBe(401);
  });
});

describe("transiciones de estado", () => {
  let token: string;
  let propiedadId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    const prop = await crearPropiedad(tenant.id, { status: "draft" });
    propiedadId = prop.id;
    token = await loguear(app, "admin@norte.test");
  });

  it("publicar un borrador lo hace visible", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}/status`)
      .set(...comoUsuario(token))
      .send({ status: "published" });

    expect(res.status).toBe(200);
    const enBase = await prisma.property.findUnique({ where: { id: propiedadId } });
    expect(enBase?.status).toBe("published");
  });

  it("un estado inventado devuelve 422", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}/status`)
      .set(...comoUsuario(token))
      .send({ status: "vendida" });

    expect(res.status).toBe(422);
  });
});

describe("límite de propiedades del plan", () => {
  it("al llegar al tope el alta se rechaza", async () => {
    // Es la regla que sostiene el modelo de negocio: sin esto, cualquiera
    // publica mil propiedades con el plan gratuito.
    const { tenant } = await crearInmobiliariaCompleta("tope", { maxProperties: 2 });
    const token = await loguear(app, "admin@tope.test");

    await crearPropiedad(tenant.id);
    await crearPropiedad(tenant.id);

    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(403);
    expect(await prisma.property.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  it("borrar una propiedad libera el cupo", async () => {
    const { tenant } = await crearInmobiliariaCompleta("tope", { maxProperties: 1 });
    const token = await loguear(app, "admin@tope.test");
    const primera = await crearPropiedad(tenant.id);

    await request(app)
      .delete(`/api/properties/${primera.id}`)
      .set(...comoUsuario(token));

    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(201);
  });
});

describe("permisos por rol", () => {
  it("un agente puede cargar propiedades", async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    await crearUsuario(tenant.id, { email: "agente@norte.test", role: "agent" });
    const token = await loguear(app, "agente@norte.test");

    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(201);
  });

  it("un agente no puede tocar la configuración del sitio", async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    await crearUsuario(tenant.id, { email: "agente@norte.test", role: "agent" });
    const token = await loguear(app, "agente@norte.test");

    const res = await request(app)
      .patch("/api/site")
      .set(...comoUsuario(token))
      .send({ heroTitle: "Cambiado por un agente" });

    expect(res.status).toBe(403);
  });

  it("un tenant_admin no entra al panel global", async () => {
    await crearInmobiliariaCompleta("norte");
    const token = await loguear(app, "admin@norte.test");

    const res = await request(app)
      .get("/api/admin/tenants")
      .set(...comoUsuario(token));

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Paso 2: Correr y commitear**

```bash
npx jest --selectProjects integration properties --runInBand
git add backend/tests/integration/properties.test.ts
git commit -m "test: cover property CRUD, status transitions and plan limits"
```

---

## Tarea 6: Catálogo público y visibilidad

Es el complemento real de `public.repository.test.ts`: aquel verifica que el `where` lleve el filtro; este verifica que, con datos cargados, no se escape nada.

**Archivos:**
- Crear: `backend/tests/integration/public.test.ts`

- [ ] **Paso 1: Escribir la suite**

Crear `backend/tests/integration/public.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPropiedad } from "./helpers/factories";

const app = createApp();

describe("catálogo público", () => {
  let idBorrador: string;
  let idDeSuspendida: string;

  beforeEach(async () => {
    const activa = await crearInmobiliariaCompleta("activa");
    const suspendida = await crearInmobiliariaCompleta("suspendida", { isActive: false });

    await crearPropiedad(activa.tenant.id, { title: "Publicada", status: "published" });
    await crearPropiedad(activa.tenant.id, { title: "Destacada", status: "featured" });
    idBorrador = (
      await crearPropiedad(activa.tenant.id, { title: "Borrador", status: "draft" })
    ).id;
    await crearPropiedad(activa.tenant.id, { title: "Pausada", status: "paused" });
    idDeSuspendida = (
      await crearPropiedad(suspendida.tenant.id, {
        title: "De suspendida",
        status: "published",
      })
    ).id;
  });

  it("solo lista publicadas y destacadas de inmobiliarias activas", async () => {
    const res = await request(app).get("/api/public/properties");

    expect(res.status).toBe(200);
    const titulos = res.body.items.map((p: { title: string }) => p.title).sort();
    expect(titulos).toEqual(["Destacada", "Publicada"]);
  });

  it("no responde sin login pero tampoco filtra borradores", async () => {
    const res = await request(app).get(`/api/public/properties/${idBorrador}`);
    expect(res.status).toBe(404);
  });

  it("una propiedad de inmobiliaria suspendida da el mismo 404", async () => {
    // Suspender por falta de pago tiene que bajar la web al instante.
    const res = await request(app).get(`/api/public/properties/${idDeSuspendida}`);
    expect(res.status).toBe(404);
  });

  it("no se puede pedir un estado por query", async () => {
    // Si el filtro de estado se expusiera, ?status=draft listaría los borradores
    // de todas las inmobiliarias de la plataforma.
    const res = await request(app).get("/api/public/properties?status=draft");

    expect(res.status).toBe(200);
    const titulos = res.body.items.map((p: { title: string }) => p.title);
    expect(titulos).not.toContain("Borrador");
  });

  it("el total coincide con lo que devuelve la página", async () => {
    // Si el count usara otro where que la consulta, el paginado mentiría.
    const res = await request(app).get("/api/public/properties");
    expect(res.body.total).toBe(res.body.items.length);
  });

  it("ver una ficha suma una vista", async () => {
    const visible = await prisma.property.findFirst({ where: { title: "Publicada" } });

    await request(app).get(`/api/public/properties/${visible!.id}`);

    // La vista se cuenta sin bloquear la respuesta: se espera a que el
    // contador llegue en vez de leerlo de una.
    await expect(
      esperarA(async () => {
        const p = await prisma.property.findUnique({ where: { id: visible!.id } });
        return p!.viewsCount === 1;
      }),
    ).resolves.toBe(true);
  });

  it("el directorio no lista inmobiliarias suspendidas", async () => {
    const res = await request(app).get("/api/public/agencies");

    const slugs = res.body.agencies.map((a: { slug: string }) => a.slug);
    expect(slugs).toContain("activa");
    expect(slugs).not.toContain("suspendida");
  });

  it("las localidades del directorio salen solo de propiedades visibles", async () => {
    await crearPropiedad(
      (await prisma.tenant.findUnique({ where: { slug: "activa" } }))!.id,
      { title: "Oculta en Colón", status: "draft", city: "Colón" },
    );

    const res = await request(app).get("/api/public/agencies");
    const activa = res.body.agencies.find((a: { slug: string }) => a.slug === "activa");

    expect(activa.cities).not.toContain("Colón");
  });

  it("el sitemap del portal no incluye borradores", async () => {
    const res = await request(app).get("/sitemap.xml").set("Host", "plataforma.com");

    expect(res.status).toBe(200);
    expect(res.text).not.toContain(idBorrador);
    expect(res.text).not.toContain(idDeSuspendida);
  });
});

/**
 * Reintenta una condición hasta que se cumple o se acaban los intentos.
 * Se usa para lo que el backend hace sin await a propósito, como el contador de
 * vistas: dormir un tiempo fijo haría el test lento y frágil por igual.
 */
async function esperarA(
  condicion: () => Promise<boolean>,
  intentos = 40,
): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    if (await condicion()) return true;
    await new Promise((r) => setImmediate(r));
  }
  return false;
}
```

- [ ] **Paso 2: Correr y commitear**

```bash
npx jest --selectProjects integration public --runInBand
git add backend/tests/integration/public.test.ts
git commit -m "test: verify public catalog visibility with real data"
```

---

## Tarea 7: Consultas públicas (leads)

**Archivos:**
- Crear: `backend/tests/integration/inquiries.test.ts`

- [ ] **Paso 1: Escribir la suite**

Crear `backend/tests/integration/inquiries.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPropiedad } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

const CONSULTA = {
  name: "Juan Pérez",
  email: "juan@test.com",
  phone: "0343 400-0000",
  message: "Me interesa la propiedad, ¿sigue disponible?",
};

describe("alta pública de consultas", () => {
  let propiedadVisible: string;
  let propiedadBorrador: string;
  let tenantId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    tenantId = tenant.id;
    propiedadVisible = (await crearPropiedad(tenant.id, { status: "published" })).id;
    propiedadBorrador = (await crearPropiedad(tenant.id, { status: "draft" })).id;
  });

  it("guarda la consulta sin login", async () => {
    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send(CONSULTA);

    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(1);
  });

  it("el tenantId sale de la propiedad, nunca del body", async () => {
    // Si viniera del body, cualquiera llenaría la bandeja de la competencia.
    const otra = await crearInmobiliariaCompleta("sur");

    await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send({ ...CONSULTA, tenantId: otra.tenant.id });

    const guardada = await prisma.inquiry.findFirst();
    expect(guardada?.tenantId).toBe(tenantId);
  });

  it("no se puede consultar por una propiedad en borrador", async () => {
    const res = await request(app)
      .post(`/api/public/properties/${propiedadBorrador}/inquiries`)
      .send(CONSULTA);

    expect(res.status).toBe(404);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it("el honeypot responde 201 al bot pero no guarda nada", async () => {
    // 201 y no 422 a propósito: un 422 le avisaría al bot qué campo lo delató.
    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send({ ...CONSULTA, website: "http://spam.test" });

    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it("un mensaje demasiado corto devuelve 422", async () => {
    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send({ ...CONSULTA, message: "hola" });

    expect(res.status).toBe(422);
  });

  it("una consulta se guarda aunque el correo falle", async () => {
    // El proveedor fake no falla, así que se fuerza el fallo. La regla es que
    // un correo caído nunca puede hacer perder un lead: es plata del cliente.
    const { notifier } = await import("@/modules/notifications/notifications.service");
    const spy = jest
      .spyOn(notifier, "leadRecibido")
      .mockRejectedValue(new Error("proveedor de correo caído"));

    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send(CONSULTA);

    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(1);
    spy.mockRestore();
  });
});

describe("bandeja de la inmobiliaria", () => {
  it("el agente ve las consultas y puede cambiarles el estado", async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    const prop = await crearPropiedad(tenant.id, { status: "published" });
    await request(app).post(`/api/public/properties/${prop.id}/inquiries`).send(CONSULTA);

    const token = await loguear(app, "admin@norte.test");

    const lista = await request(app)
      .get("/api/inquiries")
      .set(...comoUsuario(token));
    expect(lista.body.items).toHaveLength(1);

    const id = lista.body.items[0].id;
    const cambio = await request(app)
      .patch(`/api/inquiries/${id}`)
      .set(...comoUsuario(token))
      .send({ status: "contacted" });

    expect(cambio.status).toBe(200);
  });
});
```

- [ ] **Paso 2: Correr y commitear**

```bash
npx jest --selectProjects integration inquiries --runInBand
git add backend/tests/integration/inquiries.test.ts
git commit -m "test: cover public inquiry intake and inbox"
```

---

## Tarea 8: Cobros — el upgrade diferido

Las dos reglas del CLAUDE.md son: (1) la firma se verifica antes de mirar el cuerpo, y (2) el plan sube solo al confirmarse el pago.

**La regla (1) NO se puede probar acá y es importante entender por qué.** Con `PAYMENT_PROVIDER=fake`, `FakePaymentProvider.verifyWebhook()` devuelve `true` siempre —está escrito así a propósito, la firma no aporta nada en un proveedor simulado—. Un test de integración que mandara una firma inventada y esperara un rechazo **pasaría en verde por el motivo equivocado o fallaría sin que haya nada roto**. La verificación real de HMAC ya está cubierta por `tests/unit/mercadopago.provider.test.ts`, que ejercita el provider verdadero con un secreto conocido. Ahí es donde vive esa prueba y ahí tiene que quedarse.

Lo que sí cubre esta tarea es la regla (2), que es de flujo y necesita la base: `pendingPlanId` al abrir el checkout, y `planId` recién cuando el proveedor confirma.

**Archivos:**
- Crear: `backend/tests/integration/billing.test.ts`

- [ ] **Paso 1: Escribir la suite**

Crear `backend/tests/integration/billing.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPlan, crearUsuario } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

describe("checkout", () => {
  it("abrir el checkout deja el plan caro en pendingPlanId, NUNCA en planId", async () => {
    // La regla más cara del sistema: si el upgrade se aplicara al abrir el
    // checkout, alcanzaría con abrirlo y abandonarlo para tener el plan premium
    // gratis para siempre.
    const { tenant } = await crearInmobiliariaCompleta("norte", { planSlug: "basico-norte" });
    const caro = await crearPlan({ slug: "enterprise", priceAmount: "79999", maxProperties: 1000 });
    const token = await loguear(app, "admin@norte.test");

    const res = await request(app)
      .post("/api/billing/checkout")
      .set(...comoUsuario(token))
      .send({ planId: caro.id });

    expect(res.status).toBe(200);

    const sub = await prisma.subscription.findFirst({ where: { tenantId: tenant.id } });
    expect(sub?.pendingPlanId).toBe(caro.id);
    expect(sub?.planId).not.toBe(caro.id);
  });

  it("un agente no puede contratar un plan", async () => {
    // Contratar es una decisión de plata: la toma el admin, no cualquiera del
    // equipo que tenga la sesión abierta.
    const { tenant } = await crearInmobiliariaCompleta("norte");
    const caro = await crearPlan({ slug: "enterprise" });
    await crearUsuario(tenant.id, { email: "agente@norte.test", role: "agent" });
    const token = await loguear(app, "agente@norte.test");

    const res = await request(app)
      .post("/api/billing/checkout")
      .set(...comoUsuario(token))
      .send({ planId: caro.id });

    expect(res.status).toBe(403);
  });
});

describe("webhook de la pasarela", () => {
  /**
   * Registra en el proveedor simulado qué va a devolver `fetchEvent` para un id.
   * Es la única manera de simular "el proveedor confirma el pago" sin red: el
   * servicio NUNCA arma el evento con el cuerpo del webhook, lo va a buscar.
   */
  function fingirEvento(
    dataId: string,
    evento: Partial<PaymentEvent> & { externalReference: string },
  ): void {
    (paymentProvider as FakePaymentProvider).pretendEvent(dataId, {
      externalPaymentId: `pago-${dataId}`,
      externalSubscriptionId: null,
      status: "approved",
      amount: "79999.00",
      currency: "ARS",
      paidAt: new Date("2026-08-03T12:00:00Z"),
      ...evento,
    });
  }

  it("un pago aprobado aplica el plan pendiente y limpia pendingPlanId", async () => {
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    const caro = await crearPlan({ slug: "enterprise", priceAmount: "79999" });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { pendingPlanId: caro.id },
    });

    // La referencia que se manda al crear el checkout es nuestro subscription.id.
    fingirEvento("evt-1", { externalReference: sub.id });

    const res = await request(app)
      .post("/api/billing/webhook?type=payment&data.id=evt-1")
      .send({});

    expect(res.status).toBeLessThan(300);

    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.planId).toBe(caro.id);
    expect(despues.pendingPlanId).toBeNull();
  });

  it("un pago rechazado NO aplica el plan pendiente", async () => {
    // Es la mitad que más importa: si un rechazo aplicara el upgrade, alcanzaría
    // con una tarjeta sin fondos para quedarse con el plan caro.
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    const caro = await crearPlan({ slug: "enterprise", priceAmount: "79999" });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { pendingPlanId: caro.id },
    });

    fingirEvento("evt-2", { externalReference: sub.id, status: "rejected" });

    await request(app).post("/api/billing/webhook?type=payment&data.id=evt-2").send({});

    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.planId).not.toBe(caro.id);
    expect(despues.pendingPlanId).toBe(caro.id);
  });

  it("una notificación de un pago que no es nuestro se ignora sin romper", async () => {
    // La pasarela reintenta indefinidamente lo que responde error: un 500 acá
    // se convierte en un bucle de notificaciones.
    const res = await request(app)
      .post("/api/billing/webhook?type=payment&data.id=id-que-no-registramos")
      .send({});

    expect(res.status).toBeLessThan(300);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("el pago aprobado queda registrado en la tabla de pagos", async () => {
    const { tenant, subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });

    fingirEvento("evt-3", { externalReference: sub.id });
    await request(app).post("/api/billing/webhook?type=payment&data.id=evt-3").send({});

    const pago = await prisma.payment.findFirst({ where: { tenantId: tenant.id } });
    expect(pago?.externalPaymentId).toBe("pago-evt-3");
    expect(pago?.amount.toString()).toBe("79999");
  });
});
```

Los imports que suma esta suite, arriba del archivo:

```typescript
import {
  paymentProvider,
  type FakePaymentProvider,
  type PaymentEvent,
} from "@/shared/services/payments";
```

- [ ] **Paso 2: Correr y commitear**

```bash
npx jest --selectProjects integration billing --runInBand
git add backend/tests/integration/billing.test.ts
git commit -m "test: verify the plan upgrade only lands on a confirmed payment"
```

---

## Tarea 9: Dominios propios y el endpoint que autoriza a Caddy

Es lo más cerca que se puede llegar de la tarea 5.4 sin un servidor público: cubre todo el camino menos la emisión del certificado.

**Archivos:**
- Crear: `backend/tests/integration/domains.test.ts`

- [ ] **Paso 1: Escribir la suite**

Crear `backend/tests/integration/domains.test.ts`:

```typescript
import request from "supertest";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

describe("alta de dominio propio", () => {
  it("el plan decide cuántos entran; con maxDomains 0 no entra ninguno", async () => {
    // El plan básico se sirve solo por slug y subdominio: el dominio propio es
    // parte de lo que se paga.
    // maxDomains 0 explícito aunque sea el default de la fábrica: lo que este
    // test afirma es el 0, y dejarlo implícito lo volvería verde por accidente
    // si mañana el default cambiara.
    await crearInmobiliariaCompleta("basica", { maxDomains: 0 });
    const token = await loguear(app, "admin@basica.test");

    const res = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(token))
      .send({ domain: "basica.com.ar" });

    expect(res.status).toBe(403);
  });

  it("un dominio nace en verifying, nunca en active", async () => {
    // Activarlo sin comprobar el DNS haría que resolveTenant sirva la web de
    // esa inmobiliaria en un host que puede no ser suyo.
    await crearInmobiliariaCompleta("pro", { maxDomains: 1 });
    const token = await loguear(app, "admin@pro.test");

    const res = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(token))
      .send({ domain: "inmobiliariapro.com.ar" });

    expect(res.status).toBe(201);
    const guardado = await prisma.tenantDomain.findFirst();
    expect(guardado?.status).toBe("verifying");
  });

  it("no hay endpoint para marcarlo activo a mano", async () => {
    await crearInmobiliariaCompleta("pro", { maxDomains: 1 });
    const token = await loguear(app, "admin@pro.test");

    const alta = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(token))
      .send({ domain: "inmobiliariapro.com.ar" });

    const res = await request(app)
      .patch(`/api/domains/${alta.body.domain.id}`)
      .set(...comoUsuario(token))
      .send({ status: "active" });

    expect([403, 404, 405, 422]).toContain(res.status);
    const guardado = await prisma.tenantDomain.findFirst();
    expect(guardado?.status).not.toBe("active");
  });

  it("un dominio ya reclamado por otra inmobiliaria devuelve 409", async () => {
    await crearInmobiliariaCompleta("pro", { maxDomains: 1 });
    await crearInmobiliariaCompleta("otra", { maxDomains: 1 });

    const tokenPro = await loguear(app, "admin@pro.test");
    await request(app)
      .post("/api/domains")
      .set(...comoUsuario(tokenPro))
      .send({ domain: "disputado.com.ar" });

    const tokenOtra = await loguear(app, "admin@otra.test");
    const res = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(tokenOtra))
      .send({ domain: "disputado.com.ar" });

    expect(res.status).toBe(409);
  });
});

describe("endpoint que autoriza los certificados de Caddy", () => {
  const ask = (host: string, token = env.CADDY_ASK_TOKEN) =>
    request(app).get(`/api/internal/caddy/ask?token=${token}&domain=${host}`);

  it("un host que no es de nadie no recibe certificado", async () => {
    // Sin esto, cualquiera apunta su dominio a la IP del VPS y consume la cuota
    // de emisión de Let's Encrypt hasta dejar sin renovar a los clientes reales.
    const res = await ask("dominio-de-un-tercero.com");
    expect(res.status).toBe(403);
  });

  it("un dominio verificado sí lo recibe", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "active" },
    });

    const res = await ask("inmobiliariapro.com.ar");
    expect(res.status).toBe(200);
  });

  it("sin el token compartido no responde, aunque el dominio exista", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "active" },
    });

    const res = await ask("inmobiliariapro.com.ar", "token-equivocado");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
  });
});

describe("resolución por Host", () => {
  it("un dominio propio verificado sirve la web de su inmobiliaria", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantSiteConfig.create({
      data: { tenantId: tenant.id, isPublished: true },
    });
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "active" },
    });

    const res = await request(app)
      .get("/api/public/sites/current")
      .set("Host", "inmobiliariapro.com.ar");

    expect(res.status).toBe(200);
    expect(res.body.tenant.slug).toBe("pro");
  });

  it("un dominio sin verificar NO sirve ninguna web", async () => {
    // La regla dura: si no está verificado en tenant_domains, no hay web, ni
    // siquiera si el slug coincide con el dominio.
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "verifying" },
    });

    const res = await request(app)
      .get("/api/public/sites/current")
      .set("Host", "inmobiliariapro.com.ar");

    expect(res.status).toBe(404);
  });

  it("una web sin publicar responde 404 igual que una inexistente", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantSiteConfig.create({
      data: { tenantId: tenant.id, isPublished: false },
    });

    const res = await request(app).get("/api/public/sites/pro");
    expect(res.status).toBe(404);
  });
});
```

> El endpoint `ask` responde con el cuerpo vacío a propósito: 200 autoriza y cualquier otra cosa rechaza. No hay nada que assertear más allá del código de estado, y está bien así — un mensaje le confirmaría a quien sondee qué dominios existen en la plataforma.

- [ ] **Paso 2: Correr y commitear**

```bash
npx jest --selectProjects integration domains --runInBand
git add backend/tests/integration/domains.test.ts
git commit -m "test: cover custom domains, caddy authorization and host resolution"
```

---

## Tarea 10: CI en GitHub Actions

**Archivos:**
- Crear: `.github/workflows/ci.yml`

- [ ] **Paso 1: Escribir el workflow**

Crear `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# Un push nuevo cancela la corrida anterior de la misma rama: no tiene sentido
# esperar el resultado de un commit que ya quedó viejo.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  backend:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: app
          POSTGRES_PASSWORD: devpassword
          POSTGRES_DB: realestate_test
        ports:
          - 5432:5432
        # Sin el healthcheck, los tests arrancan antes de que Postgres acepte
        # conexiones y fallan de forma intermitente.
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://app:devpassword@localhost:5432/realestate_test?schema=public

    defaults:
      run:
        working-directory: backend

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - run: npm ci

      - run: npx prisma generate

      - name: Aplicar migraciones
        run: npx prisma migrate deploy

      - run: npm run typecheck

      - name: Tests unitarios
        run: npm run test:unit

      - name: Tests de integración
        run: npm run test:integration

  frontend:
    runs-on: ubuntu-latest

    defaults:
      run:
        working-directory: frontend

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci

      - run: npm test

      # `npm run build` es `tsc -b && vite build`: typechequea src y tests.
      - run: npm run build
```

- [ ] **Paso 2: Verificar la sintaxis antes de pushear**

```bash
npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML OK"
```

Esperado: `YAML OK`.

- [ ] **Paso 3: Commit y comprobar la primera corrida**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run typecheck, unit and integration tests on every push"
git push
gh run watch
```

Esperado: los dos jobs en verde. Si `integration` falla en CI pero pasa local, casi siempre es que `setup-env.ts` está pisando `DATABASE_URL` con `??=` — en CI ya viene del entorno, así que debería respetarla.

---

## Tarea 11: Cerrar la fase en el tablero

**Archivos:**
- Modificar: `docs/tablero-estado.html`

- [ ] **Paso 1: Actualizar las tareas 5.2, 5.3 y el inventario**

En el array `TASKS`, poner `s:'done'` con su `p:` correspondiente en `5.2` y `5.3`, y actualizar la evidencia con el número real de tests. En `INVENTORY`, cambiar `{ s:'todo', n:'CI', ...}` y `{ s:'todo', n:'Tests de integración', ...}` a `done`. En `GAPS`, borrar la brecha "Tests de integración y de aislamiento contra una base real".

- [ ] **Paso 2: Republicar el artifact**

Publicar `docs/tablero-estado.html` sobre la URL existente (`https://claude.ai/code/artifact/371634db-c13f-4588-a978-db94b3305c10`), no crear uno nuevo.

- [ ] **Paso 3: Commit**

```bash
git add docs/tablero-estado.html
git commit -m "docs: mark integration and isolation testing as done"
```

---

## Después de este plan

Con los tests en verde y el CI corriendo, el orden que sigue es:

1. **5.7 Deploy en el VPS.** Recién acá se estrena `docker-compose.prod.yml`. Guía completa en `docs/deploy.md`.
2. **5.4 E2E de dominio propio hasta el SSL.** Necesita el paso 1 hecho y los registros DNS cargados.
3. **5.12 Smoke testing en producción.** La lista de verificación ya está escrita en `docs/deploy.md` §5.
4. **5.5 Performance** y **5.10 Manual de usuario.** No dependen de nada de lo anterior; se pueden hacer en paralelo al deploy.
