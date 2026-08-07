# Suplantación de inmobiliaria — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el super admin abra el panel real de una inmobiliaria en modo solo lectura, para dar soporte sin construir pantallas espejo.

**Architecture:** Un endpoint del super admin emite un access token efímero con la identidad del `tenant_admin` de esa inmobiliaria, marcado con `act` (quién suplanta) y `ro` (solo lectura). **No se emite refresh token y no se toca la cookie httpOnly**, que sigue siendo la del super admin: por eso recargar la página siempre devuelve a la identidad real. El bloqueo de escritura vive dentro de `authenticate`, que está en el camino de toda ruta autenticada.

**Tech Stack:** Express + TypeScript + Prisma + Jest/supertest (backend); React 18 + Zustand + axios + Vitest (frontend).

**Diseño aprobado:** `docs/superpowers/specs/2026-08-06-impersonation-design.md`

---

## Estructura de archivos

**Backend**

| Archivo | Responsabilidad |
|---|---|
| `src/types/auth.ts` | `act` y `ro` en `JwtPayload`; `impersonatorId` y `readOnly` en `AuthUser` |
| `src/config/env.ts` | `IMPERSONATION_EXPIRES_IN` |
| `src/shared/errors/AppError.ts` | `ReadOnlySessionError` (403, `IMPERSONATION_READ_ONLY`) |
| `src/shared/services/jwt.service.ts` | `signImpersonationToken` |
| `src/shared/middleware/authenticate.ts` | bloqueo de escritura de sesiones con `ro` |
| `src/shared/middleware/rateLimit.ts` | `impersonateLimiter` |
| `src/modules/tenants/tenants.repository.ts` | `findActiveTenantAdmin` |
| `src/modules/tenants/tenants.service.ts` | `impersonate()` |
| `src/modules/tenants/tenants.router.ts` | `POST /:id/impersonate` + auditoría |
| `src/modules/audit/audit.service.ts` | acción `impersonation.start` |

**Frontend**

| Archivo | Responsabilidad |
|---|---|
| `src/api/schemas.ts` | `impersonationResponseSchema` |
| `src/api/tenants.ts` | `impersonateTenant()` |
| `src/lib/session.ts` | bandera de suplantación + handler de fin |
| `src/lib/api.ts` | el 401 no refresca mientras se suplanta |
| `src/store/auth.ts` | `impersonation`, `startImpersonation`, `stopImpersonation` |
| `src/components/panel/DashShell.tsx` | banner y botón "Volver al admin" |
| `src/pages/admin/Tenants.tsx` | botón "Ver su panel" |

---

## Task 1: Token de suplantación

**Files:**
- Modify: `backend/src/types/auth.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/shared/services/jwt.service.ts`
- Test: `backend/tests/unit/impersonation.token.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/impersonation.token.test.ts`:

```ts
import {
  signAccessToken,
  signImpersonationToken,
  verifyAccessToken,
} from "@/shared/services/jwt.service";

describe("token de suplantación", () => {
  it("lleva la identidad del suplantado, el super admin en act y la marca ro", () => {
    const { token, expiresAt } = signImpersonationToken(
      { userId: "ta-1", tenantId: "t-1" },
      "sa-1",
    );

    expect(verifyAccessToken(token)).toMatchObject({
      sub: "ta-1",
      tenant: "t-1",
      role: "tenant_admin",
      act: "sa-1",
      ro: true,
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("un access token normal nunca lleva act ni ro", () => {
    // Que el camino normal no pueda marcar una sesión como suplantación es la
    // razón por la que las dos funciones están separadas.
    const payload = verifyAccessToken(
      signAccessToken({ sub: "u-1", tenant: "t-1", role: "tenant_admin" }),
    );

    expect(payload.act).toBeUndefined();
    expect(payload.ro).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/impersonation.token.test.ts`
Expected: FAIL — `signImpersonationToken is not a function` (o error de tipos de TS).

- [ ] **Step 3: Extender los tipos de auth**

En `backend/src/types/auth.ts`, reemplazar las dos interfaces por:

```ts
// Payload del access token JWT.
export interface JwtPayload {
  sub: string; // user id
  tenant: string | null; // tenant id (null para super_admin)
  role: UserRole;
  /**
   * id del super admin que está actuando en nombre de `sub`. Solo lo llevan
   * los tokens de suplantación. El nombre sale del claim `act` de RFC 8693,
   * que nombra exactamente esto: quién actúa en nombre de quién.
   */
  act?: string;
  /** Marca de solo lectura. Solo la llevan los tokens de suplantación. */
  ro?: true;
}

// Usuario autenticado adjunto a req.user.
export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: UserRole;
  /** id del super admin que suplanta. Ausente en sesiones normales. */
  impersonatorId?: string;
  /** true en sesiones de suplantación: no pueden escribir. */
  readOnly?: boolean;
}
```

- [ ] **Step 4: Agregar la variable de entorno**

En `backend/src/config/env.ts`, justo debajo de la línea de `JWT_REFRESH_EXPIRES_IN`, agregar:

```ts
  // Duración de una sesión de suplantación. No se puede renovar: cuando vence,
  // el super admin vuelve a su identidad. Por eso es más larga que el access
  // token normal, que sí se refresca solo.
  IMPERSONATION_EXPIRES_IN: z.string().default("30m"),
```

- [ ] **Step 5: Escribir `signImpersonationToken`**

En `backend/src/shared/services/jwt.service.ts`, agregar debajo de `signRefreshToken`:

```ts
export interface ImpersonationTarget {
  userId: string;
  tenantId: string;
}

/**
 * Token con el que el super admin abre el panel de una inmobiliaria.
 *
 * Va aparte de `signAccessToken` a propósito: mientras el camino normal no
 * tenga forma de escribir `act`, ninguna sesión común puede terminar marcada
 * como suplantación por un descuido.
 *
 * No hay refresh token asociado. La cookie httpOnly sigue siendo la del super
 * admin, así que recargar la página lo devuelve a su identidad y no existe
 * forma de quedar atrapado en la ajena.
 */
export function signImpersonationToken(
  target: ImpersonationTarget,
  actorId: string,
): { token: string; expiresAt: Date } {
  const payload: JwtPayload = {
    sub: target.userId,
    tenant: target.tenantId,
    role: "tenant_admin",
    act: actorId,
    ro: true,
  };
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.IMPERSONATION_EXPIRES_IN,
  } as SignOptions);

  // La expiración se lee del propio JWT para que el dato que ve el frontend y
  // el que hace cumplir el servidor nunca diverjan.
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(exp * 1000) };
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/impersonation.token.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 7: Verificar que no se rompió nada más**

Run: `cd backend && npm run typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add backend/src/types/auth.ts backend/src/config/env.ts backend/src/shared/services/jwt.service.ts backend/tests/unit/impersonation.token.test.ts
git commit -m "feat(auth): emitir el token de suplantacion sin refresh asociado"
```

---

## Task 2: Bloqueo de escritura en `authenticate`

**Files:**
- Modify: `backend/src/shared/errors/AppError.ts`
- Modify: `backend/src/shared/middleware/authenticate.ts`
- Test: `backend/tests/unit/impersonation.readonly.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/impersonation.readonly.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { authenticate } from "@/shared/middleware/authenticate";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import {
  signAccessToken,
  signImpersonationToken,
} from "@/shared/services/jwt.service";

const suplantado = () =>
  signImpersonationToken({ userId: "ta-1", tenantId: "t-1" }, "sa-1").token;
const normal = () =>
  signAccessToken({ sub: "ta-1", tenant: "t-1", role: "tenant_admin" });

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.get("/cosa", (req, res) => res.json({ user: req.user }));
  app.post("/cosa", (_req, res) => res.status(201).json({ ok: true }));
  app.patch("/cosa", (_req, res) => res.json({ ok: true }));
  app.delete("/cosa", (_req, res) => res.status(204).end());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("sesión de suplantación: solo lectura", () => {
  it("deja pasar un GET", async () => {
    const res = await request(makeApp())
      .get("/cosa")
      .set("Authorization", `Bearer ${suplantado()}`);
    expect(res.status).toBe(200);
  });

  it("expone al suplantador y la marca de solo lectura en req.user", async () => {
    const res = await request(makeApp())
      .get("/cosa")
      .set("Authorization", `Bearer ${suplantado()}`);
    expect(res.body.user).toMatchObject({
      id: "ta-1",
      tenantId: "t-1",
      role: "tenant_admin",
      impersonatorId: "sa-1",
      readOnly: true,
    });
  });

  it.each(["post", "patch", "delete"] as const)(
    "rechaza un %s con 403 IMPERSONATION_READ_ONLY",
    async (method) => {
      const res = await request(makeApp())
        [method]("/cosa")
        .set("Authorization", `Bearer ${suplantado()}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("IMPERSONATION_READ_ONLY");
    },
  );

  it("una sesión normal escribe igual que siempre", async () => {
    const res = await request(makeApp())
      .post("/cosa")
      .set("Authorization", `Bearer ${normal()}`);
    expect(res.status).toBe(201);
  });

  it("una sesión normal no queda marcada como suplantación", async () => {
    const res = await request(makeApp())
      .get("/cosa")
      .set("Authorization", `Bearer ${normal()}`);
    expect(res.body.user.impersonatorId).toBeUndefined();
    expect(res.body.user.readOnly).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/impersonation.readonly.test.ts`
Expected: FAIL — los POST/PATCH/DELETE responden 201/200/204 en vez de 403.

- [ ] **Step 3: Agregar el error**

En `backend/src/shared/errors/AppError.ts`, agregar al final:

```ts
/**
 * Escritura intentada desde una sesión de suplantación. Tiene code propio para
 * que el frontend lo distinga de un 403 por rol y muestre el mensaje correcto.
 */
export class ReadOnlySessionError extends AppError {
  constructor() {
    super(
      "Estás en modo soporte: la sesión es de solo lectura.",
      403,
      "IMPERSONATION_READ_ONLY",
    );
  }
}
```

- [ ] **Step 4: Hacer cumplir el solo lectura**

Reemplazar el contenido de `backend/src/shared/middleware/authenticate.ts` por:

```ts
import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/shared/services/jwt.service";
import { ReadOnlySessionError, UnauthorizedError } from "@/shared/errors";

// Métodos que no mutan nada. Todo lo demás cuenta como escritura.
const LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

// Verifica el access token JWT e inyecta req.user y req.tenantId.
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers.authorization);
  if (!token) throw new UnauthorizedError("Falta el token de autenticación");

  const payload = verifyAccessToken(token);
  req.user = {
    id: payload.sub,
    tenantId: payload.tenant,
    role: payload.role,
    ...(payload.act ? { impersonatorId: payload.act } : {}),
    ...(payload.ro ? { readOnly: true } : {}),
  };
  req.tenantId = payload.tenant;

  // El bloqueo de escritura de una sesión suplantada vive acá, y no en un
  // middleware aparte, por cobertura: authenticate está en el camino de TODA
  // ruta autenticada, mientras que un middleware suelto habría que acordarse
  // de montarlo en los quince routers. Olvidarse de uno significa escribir con
  // la identidad de otra persona, que es exactamente lo que hay que impedir.
  //
  // Mezcla autenticación con autorización. Es una impureza consciente: un
  // agujero por omisión cuesta más que una responsabilidad de más.
  if (req.user.readOnly && !LECTURA.has(req.method)) {
    throw new ReadOnlySessionError();
  }

  next();
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/impersonation.readonly.test.ts`
Expected: PASS, 7 tests (el `it.each` cuenta 3).

- [ ] **Step 6: Correr toda la suite del backend**

Run: `cd backend && npm test`
Expected: todo verde. Ninguna sesión normal lleva `ro`, así que nada previo cambia de comportamiento.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/errors/AppError.ts backend/src/shared/middleware/authenticate.ts backend/tests/unit/impersonation.readonly.test.ts
git commit -m "feat(auth): bloquear la escritura de las sesiones de suplantacion"
```

---

## Task 3: `impersonate()` en el service

**Files:**
- Modify: `backend/src/modules/tenants/tenants.service.ts`
- Modify: `backend/src/modules/tenants/tenants.repository.ts`
- Test: `backend/tests/unit/impersonation.service.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/impersonation.service.test.ts`:

```ts
import { TenantsService, type TenantsRepository } from "@/modules/tenants/tenants.service";
import { verifyAccessToken } from "@/shared/services/jwt.service";
import { NotFoundError, ValidationError } from "@/shared/errors";

const TENANT = {
  id: "t-1",
  name: "Inmobiliaria Demo",
  slug: "demo",
  isActive: true,
};

const ADMIN = { id: "ta-1", email: "ana@demo.com", name: "Ana" };

function makeService(overrides: Partial<TenantsRepository> = {}) {
  const repo = {
    findTenantById: jest.fn().mockResolvedValue(TENANT),
    findActiveTenantAdmin: jest.fn().mockResolvedValue(ADMIN),
    ...overrides,
  } as unknown as TenantsRepository;
  return { service: new TenantsService(repo), repo };
}

describe("TenantsService.impersonate", () => {
  it("emite un token con la identidad del tenant_admin y el super admin en act", async () => {
    const { service } = makeService();

    const result = await service.impersonate(TENANT.id, "sa-1");

    expect(verifyAccessToken(result.accessToken)).toMatchObject({
      sub: ADMIN.id,
      tenant: TENANT.id,
      role: "tenant_admin",
      act: "sa-1",
      ro: true,
    });
    expect(result.user).toEqual({
      id: ADMIN.id,
      email: ADMIN.email,
      name: ADMIN.name,
      tenantId: TENANT.id,
      role: "tenant_admin",
    });
    expect(result.tenant).toEqual({ id: TENANT.id, name: TENANT.name, slug: TENANT.slug });
  });

  it("404 si la inmobiliaria no existe", async () => {
    const { service } = makeService({
      findTenantById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.impersonate("no-existe", "sa-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("422 si no tiene ningún administrador activo", async () => {
    const { service } = makeService({
      findActiveTenantAdmin: jest.fn().mockResolvedValue(null),
    });

    await expect(service.impersonate(TENANT.id, "sa-1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("una inmobiliaria suspendida se puede suplantar igual", async () => {
    // Es justo cuando más falta hace mirar su panel: la suspendieron y llama
    // preguntando por qué no le funciona nada.
    const { service } = makeService({
      findTenantById: jest.fn().mockResolvedValue({ ...TENANT, isActive: false }),
    });

    await expect(service.impersonate(TENANT.id, "sa-1")).resolves.toMatchObject({
      tenant: { slug: "demo" },
    });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/impersonation.service.test.ts`
Expected: FAIL — `service.impersonate is not a function`.

- [ ] **Step 3: Agregar la consulta al repositorio**

En `backend/src/modules/tenants/tenants.service.ts`, dentro de `interface TenantsRepository`, agregar debajo de `findTenantById`:

```ts
  findActiveTenantAdmin(
    tenantId: string,
  ): Promise<{ id: string; email: string; name: string | null } | null>;
```

En `backend/src/modules/tenants/tenants.repository.ts`, agregar debajo de `findTenantById`:

```ts
  findActiveTenantAdmin(tenantId) {
    // El más antiguo. Con varios administradores hace falta un criterio
    // estable, y en una sesión de solo lectura todos ven exactamente lo mismo,
    // así que cuál se elija no cambia nada mientras no cambie entre llamadas.
    return prisma.user.findFirst({
      where: { tenantId, role: "tenant_admin", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
  },
```

- [ ] **Step 4: Escribir `impersonate()`**

En `backend/src/modules/tenants/tenants.service.ts`:

Agregar a los imports de errores `ValidationError`, y sumar el import del firmador:

```ts
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import { signImpersonationToken } from "@/shared/services/jwt.service";
```

Agregar el tipo del resultado junto a las otras interfaces del archivo:

```ts
export interface ImpersonationResult {
  accessToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    tenantId: string;
    role: UserRole;
  };
  tenant: { id: string; name: string; slug: string };
}
```

Y el método al final de la clase `TenantsService`:

```ts
  /**
   * Abre una sesión de soporte sobre una inmobiliaria: devuelve un token con
   * la identidad de su tenant_admin, marcado como solo lectura.
   *
   * No chequea que la inmobiliaria esté activa a propósito. Una suspendida es
   * justo cuando más falta hace mirar su panel.
   */
  async impersonate(tenantId: string, actorId: string): Promise<ImpersonationResult> {
    // getById tira NotFoundError si no existe; devuelve la fila cruda.
    const tenant = (await this.getById(tenantId)) as {
      id: string;
      name: string;
      slug: string;
    };

    const admin = await this.repo.findActiveTenantAdmin(tenantId);
    if (!admin) {
      throw new ValidationError(
        "La inmobiliaria no tiene un administrador activo al que suplantar",
      );
    }

    const { token, expiresAt } = signImpersonationToken(
      { userId: admin.id, tenantId },
      actorId,
    );

    return {
      accessToken: token,
      expiresAt,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        tenantId,
        role: "tenant_admin",
      },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/impersonation.service.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/tenants/tenants.service.ts backend/src/modules/tenants/tenants.repository.ts backend/tests/unit/impersonation.service.test.ts
git commit -m "feat(tenants): abrir una sesion de soporte sobre una inmobiliaria"
```

---

## Task 4: Endpoint, auditoría y rate limit

**Files:**
- Modify: `backend/src/modules/audit/audit.service.ts`
- Modify: `backend/src/shared/middleware/rateLimit.ts`
- Modify: `backend/src/modules/tenants/tenants.router.ts`
- Test: `backend/tests/unit/impersonation.router.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/impersonation.router.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { createTenantsRouter } from "@/modules/tenants/tenants.router";
import type { TenantsService } from "@/modules/tenants/tenants.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import {
  signAccessToken,
  signImpersonationToken,
} from "@/shared/services/jwt.service";
import { ValidationError } from "@/shared/errors";

const TENANT = { id: "t-1", name: "Inmobiliaria Demo", slug: "demo" };
const EXPIRA = new Date("2026-08-06T18:30:00.000Z");

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const tenantAdminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: TENANT.id, role: "tenant_admin" });

function makeApp(overrides: Partial<TenantsService> = {}) {
  const service = {
    getById: jest.fn().mockResolvedValue(TENANT),
    impersonate: jest.fn().mockResolvedValue({
      accessToken: "token-de-soporte",
      expiresAt: EXPIRA,
      user: {
        id: "ta-1",
        email: "ana@demo.com",
        name: "Ana",
        tenantId: TENANT.id,
        role: "tenant_admin",
      },
      tenant: TENANT,
    }),
    ...overrides,
  } as unknown as TenantsService;

  const app = express();
  app.use(express.json());
  const auditor = { record: jest.fn().mockResolvedValue(undefined) };
  app.use("/api/admin/tenants", createTenantsRouter(service, auditor));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, auditor };
}

describe("POST /admin/tenants/:id/impersonate", () => {
  it("devuelve el token de soporte al super admin", async () => {
    const { app, service } = makeApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("token-de-soporte");
    expect(res.body.tenant).toEqual(TENANT);
    expect(service.impersonate).toHaveBeenCalledWith(TENANT.id, "sa-1");
  });

  it("no emite ninguna cookie", async () => {
    // El corazón del diseño: la cookie httpOnly sigue siendo la del super
    // admin, así que siempre hay a dónde volver.
    const { app } = makeApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("registra la suplantación con el super admin real como autor", async () => {
    const { app, auditor } = makeApp();

    await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.start",
        tenantId: TENANT.id,
        userId: "sa-1",
        entityType: "user",
        entityId: "ta-1",
        metadata: { email: "ana@demo.com", expiresAt: EXPIRA.toISOString() },
      }),
    );
  });

  it("403 para un tenant_admin", async () => {
    const { app, service } = makeApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${tenantAdminToken()}`);

    expect(res.status).toBe(403);
    expect(service.impersonate).not.toHaveBeenCalled();
  });

  it("401 sin token", async () => {
    const { app } = makeApp();
    const res = await request(app).post(`/api/admin/tenants/${TENANT.id}/impersonate`);
    expect(res.status).toBe(401);
  });

  it("propaga el 422 cuando no hay administrador al que suplantar", async () => {
    const { app } = makeApp({
      impersonate: jest.fn().mockRejectedValue(new ValidationError("sin admin")),
    } as Partial<TenantsService>);

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(422);
  });
});

describe("desde una suplantación no se vuelve al admin", () => {
  it("el token de soporte recibe 403 en el router del super admin", async () => {
    // No hay escalada de vuelta: el token dice role tenant_admin, así que
    // authorize("super_admin") lo rechaza y no puede suplantar de nuevo.
    const { token } = signImpersonationToken(
      { userId: "ta-1", tenantId: TENANT.id },
      "sa-1",
    );
    const { app } = makeApp();

    const res = await request(app)
      .get("/api/admin/tenants")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/impersonation.router.test.ts`
Expected: FAIL — 404 en la ruta `/:id/impersonate`.

- [ ] **Step 3: Registrar la acción de auditoría**

En `backend/src/modules/audit/audit.service.ts`, agregar dentro de `AUDIT_ACTIONS`, después de `"domain.delete"`:

```ts
  "impersonation.start",
```

No hay `impersonation.stop`: salir es descartar un token en el navegador y no
hay llamada al servidor que se pueda garantizar. Un evento de cierre que a
veces no llega es peor que no tenerlo, porque invita a leer la duración de la
ventana en un dato que miente. La cota firme es `expiresAt` del registro de
inicio.

- [ ] **Step 4: Agregar el limitador**

En `backend/src/shared/middleware/rateLimit.ts`, agregar al final:

```ts
// Suplantación de inmobiliaria: es una acción de soporte, no de volumen. El
// cupo existe para que un token de super admin robado no barra la plataforma
// entera abriendo el panel de cada inmobiliaria una atrás de la otra.
export const impersonateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiadas sesiones de soporte seguidas."),
});
```

- [ ] **Step 5: Montar el endpoint**

En `backend/src/modules/tenants/tenants.router.ts`:

Sumar a los imports:

```ts
import { impersonateLimiter } from "@/shared/middleware/rateLimit";
import { UnauthorizedError, ValidationError } from "@/shared/errors";
```

(`ValidationError` ya está importado; agregar `UnauthorizedError` a esa línea.)

Agregar la ruta después del `router.patch("/:id", ...)`, antes del `return router`:

```ts
  // Sesión de soporte: abre el panel de la inmobiliaria en modo solo lectura.
  router.post(
    "/:id/impersonate",
    impersonateLimiter,
    asyncHandler(async (req, res) => {
      // authenticate + authorize("super_admin") garantizan el usuario, pero el
      // id se usa como identidad del suplantador y no puede quedar en null.
      const actor = req.user;
      if (!actor) throw new UnauthorizedError();

      const result = await service.impersonate(req.params.id, actor.id);

      // Va con el tenantId de la inmobiliaria para que aparezca en SU log de
      // auditoría, y con el super admin real como userId: es el punto entero
      // del registro.
      await auditor.record({
        tenantId: req.params.id,
        userId: actor.id,
        action: "impersonation.start",
        entityType: "user",
        entityId: result.user.id,
        ipAddress: req.ip,
        metadata: {
          email: result.user.email,
          expiresAt: result.expiresAt.toISOString(),
        },
      });

      res.json(result);
    }),
  );
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/impersonation.router.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Correr toda la suite y el linter**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: todo verde.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/audit/audit.service.ts backend/src/shared/middleware/rateLimit.ts backend/src/modules/tenants/tenants.router.ts backend/tests/unit/impersonation.router.test.ts
git commit -m "feat(tenants): endpoint de suplantacion con auditoria y rate limit"
```

---

## Task 5: Contrato y cliente del frontend

**Files:**
- Modify: `frontend/src/api/schemas.ts`
- Modify: `frontend/src/api/tenants.ts`

- [ ] **Step 1: Agregar el schema de la respuesta**

En `frontend/src/api/schemas.ts`, después de `tenantProvisionResponseSchema`, agregar:

```ts
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
```

- [ ] **Step 2: Agregar la llamada**

En `frontend/src/api/tenants.ts`, sumar `impersonationResponseSchema` y el tipo `ImpersonationResponse` al import de `./schemas`, y agregar al final del archivo:

```ts
/** Abre una sesión de soporte de solo lectura sobre la inmobiliaria. */
export function impersonateTenant(id: string): Promise<ImpersonationResponse> {
  return postJson(`/admin/tenants/${id}/impersonate`, impersonationResponseSchema)
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/tenants.ts
git commit -m "feat(api): contrato de la sesion de suplantacion"
```

---

## Task 6: El 401 no refresca mientras se suplanta

**Files:**
- Modify: `frontend/src/lib/session.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/tests/unit/impersonation.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/tests/unit/impersonation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../src/lib/api'
import {
  getAccessToken,
  setAccessToken,
  setImpersonating,
  setImpersonationEndedHandler,
} from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  // El estado vive a nivel de módulo: si no se resetea, se filtra entre tests.
  setAccessToken(null)
  setImpersonating(false)
  setImpersonationEndedHandler(null)
})

describe('401 durante una suplantación', () => {
  it('no dispara refresh: corta la sesión de soporte', async () => {
    // Refrescar devolvería al super admin a su identidad en medio de una
    // pantalla del panel, con el banner puesto y datos de otra inmobiliaria.
    setAccessToken('token-de-soporte')
    setImpersonating(true)
    const terminada = vi.fn()
    setImpersonationEndedHandler(terminada)
    server.on('get', '/properties', { status: 401 })

    await expect(api.get('/properties')).rejects.toBeDefined()

    expect(server.countOf('post', '/auth/refresh')).toBe(0)
    expect(terminada).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBeNull()
  })

  it('fuera de la suplantación el 401 sigue refrescando como siempre', async () => {
    setAccessToken('token-vencido')
    server
      .on('get', '/properties', { status: 401 }, { status: 200, data: { items: [] } })
      .on('post', '/auth/refresh', {
        status: 200,
        data: {
          user: { id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'tenant_admin', name: 'Ana' },
          accessToken: 'token-nuevo',
        },
      })

    await expect(api.get('/properties')).resolves.toBeDefined()

    expect(server.countOf('post', '/auth/refresh')).toBe(1)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run tests/unit/impersonation.test.ts`
Expected: FAIL — `setImpersonating is not exported`.

- [ ] **Step 3: Agregar el estado de suplantación**

En `frontend/src/lib/session.ts`, agregar debajo de `notifySessionExpired`:

```ts
/**
 * Bandera de suplantación.
 *
 * Vive acá y no en el store por el mismo ciclo de imports que documenta el
 * encabezado de este archivo: `api.ts` la lee, el store la escribe, y ninguno
 * de los dos importa al otro.
 */
let impersonating = false
let onImpersonationEnded: (() => void) | null = null

export function isImpersonating(): boolean {
  return impersonating
}

export function setImpersonating(value: boolean): void {
  impersonating = value
}

/** Registra el callback que corre cuando la sesión de soporte deja de valer. */
export function setImpersonationEndedHandler(handler: (() => void) | null): void {
  onImpersonationEnded = handler
}

export function notifyImpersonationEnded(): void {
  accessToken = null
  impersonating = false
  onImpersonationEnded?.()
}
```

- [ ] **Step 4: Cortar el refresh en el interceptor**

En `frontend/src/lib/api.ts`:

Sumar al import de `./session`:

```ts
import {
  getAccessToken,
  isImpersonating,
  notifyImpersonationEnded,
  notifySessionExpired,
  setAccessToken,
} from './session'
```

Y en el interceptor de respuesta, agregar **antes** del bloque `if (isExpiredAccess)`:

```ts
    // Suplantando no se refresca. La cookie es la del super admin, así que
    // renovar lo devolvería a su identidad en medio de una pantalla del panel,
    // con el banner puesto y datos que ya no le corresponden. Se corta la
    // sesión de soporte y se avisa.
    if (error.response?.status === 401 && isImpersonating()) {
      notifyImpersonationEnded()
      throw toApiError(error)
    }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd frontend && npx vitest run tests/unit/impersonation.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Correr toda la suite del frontend**

Run: `cd frontend && npm test`
Expected: todo verde.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/session.ts frontend/src/lib/api.ts frontend/tests/unit/impersonation.test.ts
git commit -m "fix(api): no refrescar la sesion mientras se suplanta"
```

---

## Task 7: Estado y acciones en el store

**Files:**
- Modify: `frontend/src/store/auth.ts`
- Test: `frontend/tests/unit/impersonation.store.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/tests/unit/impersonation.store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { getAccessToken, isImpersonating, setAccessToken, setImpersonating } from '../../src/lib/session'
import { useAuth } from '../../src/store/auth'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const ADMIN = {
  id: 'sa-1',
  tenantId: null,
  email: 'admin@plataforma.com',
  role: 'super_admin' as const,
  name: 'Super Admin',
}

const SUPLANTADO = {
  id: 'ta-1',
  tenantId: 't-1',
  email: 'ana@demo.com',
  role: 'tenant_admin' as const,
  name: 'Ana',
}

const TENANT = { id: 't-1', name: 'Inmobiliaria Demo', slug: 'demo' }
const EXPIRA = '2026-08-06T18:30:00.000Z'

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken(null)
  setImpersonating(false)
  useAuth.setState({ user: ADMIN, status: 'authenticated', impersonation: null })
})

describe('startImpersonation', () => {
  it('deja el token de soporte y la inmobiliaria en el store', async () => {
    server.on('post', '/admin/tenants/t-1/impersonate', {
      status: 200,
      data: { accessToken: 'token-de-soporte', expiresAt: EXPIRA, user: SUPLANTADO, tenant: TENANT },
    })

    await useAuth.getState().startImpersonation('t-1')

    expect(getAccessToken()).toBe('token-de-soporte')
    expect(isImpersonating()).toBe(true)
    expect(useAuth.getState().user).toEqual(SUPLANTADO)
    expect(useAuth.getState().impersonation).toEqual({ tenant: TENANT, expiresAt: EXPIRA })
  })
})

describe('stopImpersonation', () => {
  it('vuelve al super admin con la cookie, que nunca dejó de ser suya', async () => {
    setAccessToken('token-de-soporte')
    setImpersonating(true)
    useAuth.setState({
      user: SUPLANTADO,
      status: 'authenticated',
      impersonation: { tenant: TENANT, expiresAt: EXPIRA },
    })
    server.on('post', '/auth/refresh', {
      status: 200,
      data: { user: ADMIN, accessToken: 'token-admin' },
    })

    await useAuth.getState().stopImpersonation()

    expect(useAuth.getState().user).toEqual(ADMIN)
    expect(useAuth.getState().impersonation).toBeNull()
    expect(isImpersonating()).toBe(false)
    expect(getAccessToken()).toBe('token-admin')
  })

  it('deja la sesión anónima si la del super admin también murió', async () => {
    setAccessToken('token-de-soporte')
    setImpersonating(true)
    useAuth.setState({
      user: SUPLANTADO,
      status: 'authenticated',
      impersonation: { tenant: TENANT, expiresAt: EXPIRA },
    })
    server.on('post', '/auth/refresh', { status: 401, data: {} })

    await expect(useAuth.getState().stopImpersonation()).rejects.toBeDefined()

    expect(useAuth.getState().impersonation).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run tests/unit/impersonation.store.test.ts`
Expected: FAIL — `startImpersonation is not a function`.

- [ ] **Step 3: Extender el store**

En `frontend/src/store/auth.ts`:

Reemplazar los imports de `session` y sumar el de la API de inmobiliarias:

```ts
import { create } from 'zustand'
import { refreshSession } from '../lib/api'
import {
  setAccessToken,
  setImpersonating,
  setImpersonationEndedHandler,
  setSessionExpiredHandler,
} from '../lib/session'
import * as authApi from '../api/auth'
import { impersonateTenant } from '../api/tenants'
import type { RegisterForm, SessionUser } from '../api/schemas'
```

Agregar al tipo del estado, después de `status`:

```ts
  /** Sesión de soporte activa: null cuando el super admin es él mismo. */
  impersonation: {
    tenant: { id: string; name: string; slug: string }
    expiresAt: string
  } | null
```

y a la lista de acciones:

```ts
  startImpersonation: (tenantId: string) => Promise<void>
  stopImpersonation: () => Promise<void>
```

En el cuerpo del `create`, agregar `impersonation: null,` junto a `user` y `status`, y las dos acciones después de `logout`:

```ts
  async startImpersonation(tenantId) {
    const res = await impersonateTenant(tenantId)
    setAccessToken(res.accessToken)
    setImpersonating(true)
    set({
      user: res.user,
      status: 'authenticated',
      impersonation: { tenant: res.tenant, expiresAt: res.expiresAt },
    })
  },

  async stopImpersonation() {
    // Se limpia el estado local primero: si el refresh falla, no puede quedar
    // el banner puesto sobre una sesión que ya no existe.
    setImpersonating(false)
    setAccessToken(null)
    set({ impersonation: null })

    // La cookie httpOnly nunca dejó de ser la del super admin: alcanza con
    // pedir un token nuevo para volver a ser él.
    const { user } = await refreshSession()
    set({ user, status: 'authenticated' })
  },
```

Y al final del archivo, junto al handler de sesión expirada:

```ts
// La sesión de soporte venció o el backend la rechazó: se vuelve al super
// admin. Si su propia sesión también murió, se cae al login como cualquiera.
setImpersonationEndedHandler(() => {
  void useAuth
    .getState()
    .stopImpersonation()
    .catch(() => {
      setAccessToken(null)
      useAuth.setState({ user: null, status: 'anonymous' })
    })
})
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd frontend && npx vitest run tests/unit/impersonation.store.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Correr toda la suite y el build**

Run: `cd frontend && npm test && npm run build`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store/auth.ts frontend/tests/unit/impersonation.store.test.ts
git commit -m "feat(store): entrar y salir de la sesion de soporte"
```

---

## Task 8: Banner y botón "Volver al admin"

**Files:**
- Modify: `frontend/src/components/panel/DashShell.tsx`

No lleva test automático: el harness de Vitest corre en entorno `node` y no hay
`@testing-library/react` instalado, así que no se pueden montar componentes. La
verificación es manual, en la Task 9. Sumar RTL sería un cambio de
infraestructura de tests más grande que esta funcionalidad.

- [ ] **Step 1: Leer el estado de suplantación en el shell**

En `frontend/src/components/panel/DashShell.tsx`, sumar `ShieldAlert` al import de `lucide-react` y agregar debajo de `const logout = ...`:

```ts
  const impersonation = useAuth((s) => s.impersonation)
  const stopImpersonation = useAuth((s) => s.stopImpersonation)

  const handleStopImpersonation = async () => {
    await stopImpersonation()
    navigate('/admin/inmobiliarias', { replace: true })
  }
```

- [ ] **Step 2: Envolver el layout en una columna y poner el banner arriba**

Reemplazar el `return` completo del componente por:

```tsx
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {impersonation && (
        // Colores propios, NO las variables --brand: el panel se re-tematiza
        // con los colores de cada inmobiliaria y el aviso tiene que gritar por
        // encima de ese tema, no integrarse a él.
        //
        // No es sticky a propósito: el header sí lo es, y dos elementos
        // pegados arriba se pisan. Al hacer scroll el aviso se va, pero el
        // botón de salida queda en el header.
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
          <p className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              Estás viendo el panel de <strong>{impersonation.tenant.name}</strong> como
              soporte · solo lectura · vence{' '}
              {new Date(impersonation.expiresAt).toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </p>
          <button
            onClick={() => void handleStopImpersonation()}
            className="rounded-md bg-amber-950 px-3 py-1 font-medium text-amber-50 hover:bg-amber-900"
          >
            Volver al admin
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          brandHome={brandHome}
          title={title}
          subtitle={subtitle}
          items={items}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-ink lg:hidden"
              aria-label="Menú"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="hidden lg:block" />

            <div className="flex items-center gap-4">
              <button className="relative text-muted hover:text-ink" aria-label="Notificaciones">
                <Bell className="h-5 w-5" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
              </button>
              <div className="flex items-center gap-2">
                <UserCircle className="h-7 w-7 text-muted" />
                <div className="hidden text-sm leading-tight sm:block">
                  <p className="font-medium text-ink">{user?.name ?? user?.email ?? '—'}</p>
                  <p className="text-xs text-muted">{user ? roleLabels[user.role] : ''}</p>
                </div>
              </div>

              {/* Suplantando, "Salir" cerraría la sesión REAL del super admin:
                  logout trabaja sobre la cookie, que nunca dejó de ser la suya.
                  Los dos botones no conviven — primero se sale, después uno se
                  va. La protección es de interfaz: el backend no puede
                  distinguir el caso porque /auth/logout no pasa por
                  authenticate. */}
              {impersonation ? (
                <button
                  onClick={() => void handleStopImpersonation()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al admin</span>
                </button>
              ) : (
                <button
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/panel/DashShell.tsx
git commit -m "feat(panel): avisar en el shell cuando la sesion es de soporte"
```

---

## Task 9: Botón "Ver su panel" y verificación en el navegador

**Files:**
- Modify: `frontend/src/pages/admin/Tenants.tsx`

- [ ] **Step 1: Agregar el botón a la fila**

En `frontend/src/pages/admin/Tenants.tsx`:

Sumar `Eye` al import de `lucide-react`, y agregar estos imports:

```ts
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
```

Dentro del componente `Tenants`, junto a los otros hooks:

```ts
  const navigate = useNavigate()
  const startImpersonation = useAuth((s) => s.startImpersonation)
```

Y el handler, debajo de `toggleActive`:

```ts
  const verSuPanel = async (t: TenantListItem) => {
    setActionError(null)
    setBusyId(t.id)
    try {
      await startImpersonation(t.id)
      navigate('/panel')
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo abrir su panel')
      setBusyId(null)
    }
    // Sin finally: si salió bien ya se navegó a otra pantalla y este componente
    // se desmontó. Tocar su estado ahí sería actualizar algo que no existe.
  }
```

En la celda de acciones, como **primer** botón del `div.flex.justify-end`, antes del de editar:

```tsx
                        <button
                          onClick={() => void verSuPanel(t)}
                          disabled={busyId === t.id}
                          className="rounded-md p-2 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                          aria-label={`Ver el panel de ${t.name} como soporte`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
```

- [ ] **Step 2: Verificar que compila y pasa la suite**

Run: `cd frontend && npm run build && npm test`
Expected: todo verde.

- [ ] **Step 3: Levantar el entorno**

```bash
cd backend && .\scripts\pg.ps1 start && .\scripts\minio.ps1 start
```
Después, en dos terminales: `cd backend && npm run dev` y `cd frontend && npm run dev`.

- [ ] **Step 4: Verificar el camino feliz en el navegador**

1. Entrar a `http://localhost:5173/login` como `admin@plataforma.com` / `ChangeMe123!`.
2. Ir a `/admin/inmobiliarias` y apretar el ojo de **Inmobiliaria Demo** (tiene 3 propiedades cargadas).
3. Comprobar: cae en `/panel`, el banner ámbar dice "Inmobiliaria Demo" con la hora de vencimiento, el sidebar es el de la inmobiliaria y el dashboard muestra sus 3 propiedades.
4. Comprobar que el header dice **"Volver al admin"** y no "Salir".

- [ ] **Step 5: Verificar el solo lectura**

Entrar a `/panel/propiedades` e intentar suspender o borrar una propiedad.
Expected: el backend responde 403 y la pantalla muestra "Estás en modo soporte: la sesión es de solo lectura."

- [ ] **Step 6: Verificar la salida y el F5**

1. Apretar "Volver al admin" → vuelve a `/admin/inmobiliarias` como Super Admin (el header muestra "Super Admin").
2. Volver a entrar al panel de una inmobiliaria y apretar **F5**.
   Expected: la página recarga y aparece el panel del **super admin**, no el suplantado. Recargar saca de la suplantación: es la salida de emergencia.

- [ ] **Step 7: Verificar la auditoría**

Ir a `/admin/auditoria`.
Expected: aparecen las entradas `impersonation.start` con el email del super admin como autor y la inmobiliaria como tenant.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/admin/Tenants.tsx
git commit -m "feat(admin): abrir el panel de una inmobiliaria desde el listado"
```

---

## Task 10: Documentar la funcionalidad

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar las dos reglas que no se pueden perder**

En `CLAUDE.md`, en la lista de viñetas de la sección "Backend (`backend/src/`)", agregar después de la viñeta que empieza con "Auth: JWT access de 15min":

```markdown
- **Suplantación de inmobiliaria (soporte).** `POST /api/admin/tenants/:id/impersonate` le da al super admin un access token con la identidad del `tenant_admin` de esa inmobiliaria, marcado con `act` (quién suplanta, nombre tomado del claim de RFC 8693) y `ro` (solo lectura). **No emite refresh token y no toca la cookie httpOnly**, que sigue siendo la del super admin: por eso recargar la página siempre devuelve a la identidad real y no hay forma de quedar atrapado en la ajena. El token dice `role: "tenant_admin"`, así que `authorize("super_admin")` lo rechaza — desde una suplantación no se vuelve a `/api/admin/*` ni se suplanta de nuevo.
- **El bloqueo de escritura de una sesión suplantada vive dentro de `authenticate`**, no en un middleware aparte. Es a propósito y por cobertura: `authenticate` está en el camino de toda ruta autenticada, mientras que un middleware suelto habría que acordarse de montarlo en los quince routers, y olvidarse de uno significa escribir con la identidad de otra persona. Mezcla autenticación con autorización; se aceptó la impureza porque un agujero por omisión cuesta más. Del lado del frontend, `lib/api.ts` **no refresca ante un 401 mientras se suplanta**: renovar devolvería al super admin a su identidad en medio de una pantalla del panel.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documentar la suplantacion de inmobiliaria"
```

---

## Verificación final

- [ ] `cd backend && npm test && npm run typecheck && npm run lint` — todo verde
- [ ] `cd frontend && npm test && npm run build` — todo verde
- [ ] Los seis pasos manuales de la Task 9 pasaron en el navegador
