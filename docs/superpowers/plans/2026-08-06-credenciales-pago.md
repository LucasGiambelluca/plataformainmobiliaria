# Credenciales de MercadoPago desde el panel — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el super admin cargue, rote y active las credenciales de MercadoPago desde una pantalla, sin deploy.

**Architecture:** Una fila única en `payment_settings` guarda dos juegos de credenciales (sandbox y producción) cifrados con AES-256-GCM, y una columna dice cuál está activo. `paymentProvider` deja de ser una constante creada al cargar el módulo y pasa a resolverse por llamada desde la base. El modelo de cobro (`preapproval`) **no se toca**.

**Tech Stack:** Express + TypeScript + Prisma + `node:crypto` + Jest/supertest (backend); React 18 + Zustand + axios + Vitest (frontend).

**Diseño aprobado:** `docs/superpowers/specs/2026-08-06-credenciales-pago-design.md`

---

## Estructura de archivos

**Backend**

| Archivo | Responsabilidad |
|---|---|
| `src/shared/services/crypto/secretBox.ts` | cifrar/descifrar secretos (nuevo) |
| `src/config/env.ts` | `CREDENTIALS_ENCRYPTION_KEY`; el `superRefine` deja de exigir las credenciales |
| `prisma/schema.prisma` | `PaymentMode` + `PaymentSettings` |
| `src/shared/services/payments/mercadopago.verify.ts` | chequear un access token contra MP (nuevo) |
| `src/shared/services/payments/index.ts` | `createPaymentProviderResolver` |
| `src/modules/paymentSettings/*` | repository + service + schemas + router (nuevo) |
| `src/modules/billing/billing.service.ts` | recibe el resolver en vez de la instancia |
| `src/modules/billing/billing.router.ts` | arma el resolver con el repositorio |
| `src/modules/audit/audit.service.ts` | dos acciones nuevas |
| `src/routes/index.ts` | monta `/admin/payment-settings` |
| `prisma/seed.ts` | sembrado desde el `.env` |

**Frontend**

| Archivo | Responsabilidad |
|---|---|
| `src/api/schemas.ts` | contrato |
| `src/api/paymentSettings.ts` | cliente (nuevo) |
| `src/pages/admin/PaymentSettings.tsx` | pantalla (nueva) |
| `src/components/admin/AdminLayout.tsx` | ítem del sidebar |
| `src/App.tsx` | ruta `/admin/pagos` |

---

## Task 1: Cifrado de secretos

**Files:**
- Create: `backend/src/shared/services/crypto/secretBox.ts`
- Modify: `backend/src/config/env.ts`
- Modify: `backend/tests/setup-env.ts`
- Test: `backend/tests/unit/secretBox.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/secretBox.test.ts`:

```ts
import { decryptSecret, encryptSecret, last4 } from "@/shared/services/crypto/secretBox";

describe("secretBox", () => {
  it("descifra lo que cifró", () => {
    const secreto = "APP_USR-1234567890-abcdef-ghijkl";
    expect(decryptSecret(encryptSecret(secreto))).toBe(secreto);
  });

  it("cifrar dos veces el mismo texto da resultados distintos", () => {
    // IV aleatorio por cifrado: si dieran igual, cualquiera con acceso de
    // lectura a la base vería que dos inmobiliarias comparten credencial.
    const secreto = "APP_USR-1234567890";
    expect(encryptSecret(secreto)).not.toBe(encryptSecret(secreto));
  });

  it("un ciphertext manipulado falla en vez de devolver basura", () => {
    // Es lo que compra GCM sobre CBC: basura descifrada saldría como Bearer
    // hacia MercadoPago sin que nadie se entere.
    const payload = encryptSecret("APP_USR-1234567890");
    const [v, iv, tag, cipher] = payload.split(":");
    const alterado = Buffer.from(cipher, "base64");
    alterado[0] ^= 0xff;
    const roto = [v, iv, tag, alterado.toString("base64")].join(":");

    expect(() => decryptSecret(roto)).toThrow();
  });

  it("rechaza un payload sin el prefijo de versión", () => {
    expect(() => decryptSecret("solo-texto-plano")).toThrow();
  });

  it("last4 devuelve los últimos cuatro caracteres", () => {
    expect(last4("APP_USR-1234567890-abc8f2")).toBe("c8f2");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/secretBox.test.ts`
Expected: FAIL — no existe el módulo `secretBox`.

- [ ] **Step 3: Agregar la variable de entorno**

En `backend/src/config/env.ts`, dentro de `envSchema`, debajo de `PAYMENT_WEBHOOK_SECRET`:

```ts
  // Clave de cifrado de los secretos guardados en base (32 bytes en hex).
  // A diferencia de las credenciales de la pasarela, esta NO cambia: se pone
  // una vez. Es lo que hace que rotar el access token deje de ser un deploy.
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional().default(""),
```

Y **reemplazar** el `superRefine` de MercadoPago (el que hoy exige
`PAYMENT_API_KEY` y `PAYMENT_WEBHOOK_SECRET`) por:

```ts
  .superRefine((env, ctx) => {
    // Las credenciales de la pasarela ya no viven acá: se cargan desde el
    // panel del super admin y se guardan cifradas. Lo que sí tiene que estar
    // es la clave con la que se descifran, porque sin ella el backend no puede
    // leer lo que él mismo guardó.
    if (env.PAYMENT_PROVIDER !== "mercadopago") return;
    if (!/^[0-9a-fA-F]{64}$/.test(env.CREDENTIALS_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CREDENTIALS_ENCRYPTION_KEY"],
        message:
          "Requerida cuando PAYMENT_PROVIDER=mercadopago: 64 caracteres hex (32 bytes). Generala con: openssl rand -hex 32",
      });
    }
  })
```

- [ ] **Step 4: Dar una clave a los tests**

En `backend/tests/setup-env.ts`, agregar al final:

```ts
// Clave de cifrado de prueba. Los tests de secretBox la necesitan aunque
// PAYMENT_PROVIDER sea fake, porque el módulo la lee al cifrar.
process.env.CREDENTIALS_ENCRYPTION_KEY ??=
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
```

- [ ] **Step 5: Escribir el módulo**

Crear `backend/src/shared/services/crypto/secretBox.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { AppError } from "@/shared/errors";

const ALGORITMO = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function clave(): Buffer {
  const key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new AppError(
      "CREDENTIALS_ENCRYPTION_KEY debe ser de 32 bytes (64 caracteres hex)",
    );
  }
  return key;
}

/**
 * Cifra un secreto para guardarlo en la base.
 *
 * GCM y no CBC porque es autenticado: un ciphertext manipulado falla ruidoso al
 * descifrar, en vez de devolver basura que después sale como Bearer hacia
 * MercadoPago. El prefijo de versión está para que el día que cambie el
 * algoritmo se note, en lugar de descifrar mal en silencio.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, clave(), iv);
  const texto = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    texto.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, texto] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !texto) {
    throw new AppError("Secreto guardado con un formato que no se reconoce");
  }

  const decipher = createDecipheriv(ALGORITMO, clave(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(texto, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // final() tira cuando el tag no valida: el dato fue manipulado o la clave
    // cambió. En los dos casos hay que gritar, no seguir con basura.
    throw new AppError("No se pudo descifrar el secreto guardado");
  }
}

/** Últimos cuatro caracteres: alcanza para saber cuál credencial está cargada. */
export function last4(secret: string): string {
  return secret.slice(-4);
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/secretBox.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/services/crypto/secretBox.ts backend/src/config/env.ts backend/tests/setup-env.ts backend/tests/unit/secretBox.test.ts
git commit -m "feat(crypto): cifrado autenticado para los secretos guardados en base"
```

---

## Task 2: Tabla de credenciales

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migración generada por Prisma

- [ ] **Step 1: Agregar el enum y el modelo**

En `backend/prisma/schema.prisma`, agregar el enum junto a los otros (después de `PaymentProviderName`):

```prisma
enum PaymentMode {
  sandbox
  production
}
```

Y el modelo al final del archivo:

```prisma
/// Credenciales de la pasarela, cargadas desde el panel del super admin.
///
/// Fila única (id fijo): la plataforma cobra con una sola cuenta de
/// MercadoPago, así que no hay tenant_id acá. Los dos juegos van como columnas
/// de la misma fila y no como dos filas con un isActive, para que "cuál está
/// activa" sea un dato y no un invariante que alguien tenga que sostener.
///
/// Los cuatro secretos se guardan cifrados: ver shared/services/crypto/secretBox.
model PaymentSettings {
  id                      String      @id @default("singleton")
  activeMode              PaymentMode @default(sandbox) @map("active_mode")

  sandboxAccessToken      String?     @map("sandbox_access_token")
  sandboxWebhookSecret    String?     @map("sandbox_webhook_secret")
  productionAccessToken   String?     @map("production_access_token")
  productionWebhookSecret String?     @map("production_webhook_secret")

  updatedAt               DateTime    @updatedAt @map("updated_at")
  updatedById             String?     @map("updated_by_id")

  @@map("payment_settings")
}
```

`activeMode` arranca en `sandbox` a propósito: si alguien carga credenciales y
se olvida de activar, el peor caso es que no cobre, no que cobre con la cuenta
equivocada.

- [ ] **Step 2: Generar y aplicar la migración**

Run: `cd backend && npx prisma migrate dev --name payment_settings`
Expected: crea la migración y regenera el cliente.

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): tabla de credenciales de la pasarela"
```

---

## Task 3: Chequeo de un access token contra MercadoPago

**Files:**
- Create: `backend/src/shared/services/payments/mercadopago.verify.ts`
- Test: `backend/tests/unit/mercadopago.verify.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/mercadopago.verify.test.ts`:

```ts
import { checkMercadoPagoToken } from "@/shared/services/payments/mercadopago.verify";

describe("checkMercadoPagoToken", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ok cuando MercadoPago acepta el token", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 123 }), { status: 200 }),
    );

    await expect(checkMercadoPagoToken("APP_USR-bueno")).resolves.toBe("ok");
  });

  it("rejected cuando MercadoPago devuelve 401", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 401 }));

    await expect(checkMercadoPagoToken("APP_USR-malo")).resolves.toBe("rejected");
  });

  it("unreachable cuando la red falla", async () => {
    // Un proveedor caído no puede impedir guardar: misma regla que el correo
    // y las series de índices.
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(checkMercadoPagoToken("APP_USR-x")).resolves.toBe("unreachable");
  });

  it("unreachable cuando MercadoPago devuelve 500", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    await expect(checkMercadoPagoToken("APP_USR-x")).resolves.toBe("unreachable");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/mercadopago.verify.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el chequeo**

Crear `backend/src/shared/services/payments/mercadopago.verify.ts`:

```ts
import { logger } from "@/config/logger";

export type TokenCheck = "ok" | "rejected" | "unreachable";

/**
 * Pregunta a MercadoPago si un access token sirve, antes de guardarlo.
 *
 * Distingue tres desenlaces a propósito. Un token mal pegado tiene que frenarse
 * acá, porque si no el error aparece recién cuando una inmobiliaria intenta
 * pagar. Pero MercadoPago caído no puede impedir guardar: es la misma regla que
 * el proyecto ya aplica al correo y a las series de índices.
 *
 * Valida el access token, NO el webhook secret: ese no tiene endpoint de
 * verificación y se ejerce con el primer webhook real.
 */
export async function checkMercadoPagoToken(accessToken: string): Promise<TokenCheck> {
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403) return "rejected";

    logger.warn({ status: res.status }, "MercadoPago no pudo validar el token");
    return "unreachable";
  } catch (err) {
    logger.warn({ err }, "No se pudo contactar a MercadoPago para validar el token");
    return "unreachable";
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/mercadopago.verify.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/services/payments/mercadopago.verify.ts backend/tests/unit/mercadopago.verify.test.ts
git commit -m "feat(pagos): chequear el access token contra MercadoPago antes de guardarlo"
```

---

## Task 4: Módulo `paymentSettings` (repository + service)

**Files:**
- Create: `backend/src/modules/paymentSettings/paymentSettings.service.ts`
- Create: `backend/src/modules/paymentSettings/paymentSettings.repository.ts`
- Create: `backend/src/modules/paymentSettings/paymentSettings.schemas.ts`
- Test: `backend/tests/unit/paymentSettings.service.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/paymentSettings.service.test.ts`:

```ts
import {
  PaymentSettingsService,
  type PaymentSettingsRepository,
} from "@/modules/paymentSettings/paymentSettings.service";
import { encryptSecret } from "@/shared/services/crypto/secretBox";
import { ValidationError } from "@/shared/errors";

const FILA = {
  activeMode: "sandbox" as const,
  sandboxAccessToken: encryptSecret("APP_USR-sandbox-c8f2"),
  sandboxWebhookSecret: encryptSecret("secreto-sandbox"),
  productionAccessToken: null,
  productionWebhookSecret: null,
  updatedAt: new Date("2026-08-06T12:00:00Z"),
  updatedByEmail: "admin@plataforma.com",
};

function makeService(
  overrides: Partial<PaymentSettingsRepository> = {},
  check: jest.Mock = jest.fn().mockResolvedValue("ok"),
) {
  const repo = {
    find: jest.fn().mockResolvedValue(FILA),
    saveCredentials: jest.fn().mockResolvedValue(undefined),
    setActiveMode: jest.fn().mockResolvedValue(undefined),
    countSubscriptionsWithExternalRef: jest.fn().mockResolvedValue(3),
    ...overrides,
  } as unknown as PaymentSettingsRepository;

  return {
    service: new PaymentSettingsService(repo, check, "https://api.test"),
    repo,
    check,
  };
}

describe("get", () => {
  it("informa qué hay cargado sin devolver ningún secreto", async () => {
    const { service } = makeService();

    const estado = await service.get();

    expect(estado).toEqual({
      activeMode: "sandbox",
      credentials: {
        sandbox: { configured: true, last4: "c8f2" },
        production: { configured: false, last4: null },
      },
      webhookUrl: "https://api.test/api/billing/webhook",
      updatedAt: FILA.updatedAt,
      updatedBy: "admin@plataforma.com",
    });
  });

  it("el JSON serializado no contiene el access token en ninguna parte", async () => {
    const { service } = makeService();

    const json = JSON.stringify(await service.get());

    expect(json).not.toContain("APP_USR-sandbox-c8f2");
    expect(json).not.toContain("secreto-sandbox");
  });

  it("devuelve el estado vacío cuando todavía no se configuró nada", async () => {
    const { service } = makeService({ find: jest.fn().mockResolvedValue(null) });

    const estado = await service.get();

    expect(estado.activeMode).toBe("sandbox");
    expect(estado.credentials.sandbox.configured).toBe(false);
    expect(estado.credentials.production.configured).toBe(false);
  });
});

describe("saveCredentials", () => {
  it("guarda los secretos cifrados, nunca en claro", async () => {
    const { service, repo } = makeService();

    await service.saveCredentials(
      "production",
      { accessToken: "APP_USR-nuevo", webhookSecret: "secreto-nuevo" },
      "sa-1",
    );

    const [, creds] = (repo.saveCredentials as jest.Mock).mock.calls[0];
    expect(creds.accessToken).not.toBe("APP_USR-nuevo");
    expect(creds.accessToken.startsWith("v1:")).toBe(true);
    expect(creds.webhookSecret.startsWith("v1:")).toBe(true);
  });

  it("no guarda si MercadoPago rechaza el token", async () => {
    const check = jest.fn().mockResolvedValue("rejected");
    const { service, repo } = makeService({}, check);

    await expect(
      service.saveCredentials(
        "production",
        { accessToken: "APP_USR-malo", webhookSecret: "x" },
        "sa-1",
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repo.saveCredentials).not.toHaveBeenCalled();
  });

  it("guarda igual si MercadoPago no contesta, y lo avisa", async () => {
    // Un proveedor caído no puede voltear la pantalla de configuración.
    const check = jest.fn().mockResolvedValue("unreachable");
    const { service, repo } = makeService({}, check);

    const res = await service.saveCredentials(
      "production",
      { accessToken: "APP_USR-x", webhookSecret: "y" },
      "sa-1",
    );

    expect(res).toEqual({ verified: false, last4: "SR-x" });
    expect(repo.saveCredentials).toHaveBeenCalled();
  });
});

describe("activate", () => {
  it("informa cuántas suscripciones quedan huérfanas al cambiar de modo", async () => {
    // Un preapproval de la cuenta A no se puede cancelar con el token de la B.
    const { service } = makeService();

    const res = await service.activate("production", "sa-1");

    expect(res.orphanedSubscriptions).toBe(3);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/paymentSettings.service.test.ts`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir los schemas**

Crear `backend/src/modules/paymentSettings/paymentSettings.schemas.ts`:

```ts
import { z } from "zod";

export const paymentModeSchema = z.enum(["sandbox", "production"]);
export type PaymentModeInput = z.infer<typeof paymentModeSchema>;

/**
 * Los dos campos son obligatorios: no hay actualización parcial.
 *
 * Es tentador permitir rotar solo el webhook secret sin volver a pegar el
 * token, pero son campos que no se pueden leer — la pantalla muestra `···· c8f2`
 * y nada más. Un formulario donde un campo vacío a veces significa "no lo
 * cambies" y a veces "borralo" es el que termina dejando la plataforma sin
 * cobrar. Se pegan los dos juntos, que es como vienen del panel de MercadoPago.
 */
export const saveCredentialsSchema = z.object({
  accessToken: z.string().trim().min(10, "El access token es demasiado corto"),
  webhookSecret: z.string().trim().min(8, "El webhook secret es demasiado corto"),
});
export type SaveCredentialsBody = z.infer<typeof saveCredentialsSchema>;

export const activateSchema = z.object({ mode: paymentModeSchema });
export type ActivateBody = z.infer<typeof activateSchema>;
```

- [ ] **Step 4: Escribir el service**

Crear `backend/src/modules/paymentSettings/paymentSettings.service.ts`:

```ts
import { ValidationError } from "@/shared/errors";
import { decryptSecret, encryptSecret, last4 } from "@/shared/services/crypto/secretBox";
import type { TokenCheck } from "@/shared/services/payments/mercadopago.verify";
import type { PaymentModeInput } from "./paymentSettings.schemas";

export interface SettingsRow {
  activeMode: PaymentModeInput;
  sandboxAccessToken: string | null;
  sandboxWebhookSecret: string | null;
  productionAccessToken: string | null;
  productionWebhookSecret: string | null;
  updatedAt: Date;
  updatedByEmail: string | null;
}

export interface PaymentSettingsRepository {
  find(): Promise<SettingsRow | null>;
  saveCredentials(
    mode: PaymentModeInput,
    creds: { accessToken: string; webhookSecret: string },
    updatedById: string,
  ): Promise<void>;
  setActiveMode(mode: PaymentModeInput, updatedById: string): Promise<void>;
  /** Suscripciones con externalRef vivo: las que quedan huérfanas al cambiar. */
  countSubscriptionsWithExternalRef(): Promise<number>;
}

export interface CredentialStatus {
  configured: boolean;
  last4: string | null;
}

export interface SettingsStatus {
  activeMode: PaymentModeInput;
  credentials: { sandbox: CredentialStatus; production: CredentialStatus };
  webhookUrl: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** Credenciales en claro del modo activo, para armar el provider. */
export interface ActiveCredentials {
  accessToken: string;
  webhookSecret: string;
}

function estadoDe(cifrado: string | null): CredentialStatus {
  if (!cifrado) return { configured: false, last4: null };
  return { configured: true, last4: last4(decryptSecret(cifrado)) };
}

export class PaymentSettingsService {
  constructor(
    private readonly repo: PaymentSettingsRepository,
    private readonly checkToken: (accessToken: string) => Promise<TokenCheck>,
    private readonly backendUrl: string,
  ) {}

  async get(): Promise<SettingsStatus> {
    const fila = await this.repo.find();
    const webhookUrl = `${this.backendUrl}/api/billing/webhook`;

    if (!fila) {
      return {
        activeMode: "sandbox",
        credentials: {
          sandbox: { configured: false, last4: null },
          production: { configured: false, last4: null },
        },
        webhookUrl,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      activeMode: fila.activeMode,
      credentials: {
        sandbox: estadoDe(fila.sandboxAccessToken),
        production: estadoDe(fila.productionAccessToken),
      },
      webhookUrl,
      updatedAt: fila.updatedAt,
      updatedBy: fila.updatedByEmail,
    };
  }

  /**
   * Guarda un juego de credenciales, cifrado.
   *
   * Un token que MercadoPago rechaza no se guarda: el error tiene que aparecer
   * acá y no cuando una inmobiliaria intenta pagar. Pero si MercadoPago no
   * contesta se guarda igual y se avisa — un proveedor caído no puede voltear
   * la pantalla de configuración.
   */
  async saveCredentials(
    mode: PaymentModeInput,
    creds: { accessToken: string; webhookSecret: string },
    actorId: string,
  ): Promise<{ verified: boolean; last4: string }> {
    const check = await this.checkToken(creds.accessToken);
    if (check === "rejected") {
      throw new ValidationError("MercadoPago rechazó esas credenciales");
    }

    await this.repo.saveCredentials(
      mode,
      {
        accessToken: encryptSecret(creds.accessToken),
        webhookSecret: encryptSecret(creds.webhookSecret),
      },
      actorId,
    );

    return { verified: check === "ok", last4: last4(creds.accessToken) };
  }

  /**
   * Cambia el modo activo.
   *
   * Devuelve cuántas suscripciones quedan huérfanas: un preapproval nacido en
   * una cuenta no se puede consultar ni cancelar con el token de otra, así que
   * después del cambio esos externalRef apuntan a algo que la credencial nueva
   * no ve. No se bloquea —pasar de sandbox a producción el día del lanzamiento
   * es legítimo— pero el que aprieta tiene que saberlo.
   */
  async activate(
    mode: PaymentModeInput,
    actorId: string,
  ): Promise<{ activeMode: PaymentModeInput; orphanedSubscriptions: number }> {
    const huerfanas = await this.repo.countSubscriptionsWithExternalRef();
    await this.repo.setActiveMode(mode, actorId);
    return { activeMode: mode, orphanedSubscriptions: huerfanas };
  }

  /** Credenciales en claro del modo activo. null si no hay nada cargado. */
  async activeCredentials(): Promise<ActiveCredentials | null> {
    const fila = await this.repo.find();
    if (!fila) return null;

    const token =
      fila.activeMode === "production" ? fila.productionAccessToken : fila.sandboxAccessToken;
    const secret =
      fila.activeMode === "production"
        ? fila.productionWebhookSecret
        : fila.sandboxWebhookSecret;

    if (!token || !secret) return null;
    return { accessToken: decryptSecret(token), webhookSecret: decryptSecret(secret) };
  }
}
```

- [ ] **Step 5: Escribir el repositorio**

Crear `backend/src/modules/paymentSettings/paymentSettings.repository.ts`:

```ts
import { prisma } from "@/config/database";
import type {
  PaymentSettingsRepository,
  SettingsRow,
} from "./paymentSettings.service";
import type { PaymentModeInput } from "./paymentSettings.schemas";

// Fila única. No extiende BaseRepository: la plataforma cobra con una sola
// cuenta de MercadoPago, así que esta tabla no tiene tenant_id — igual que
// `plans`, que tampoco lo tiene.
const ID = "singleton";

/** Columnas del token y del secret según el modo, para no repetir el if. */
const COLUMNAS = {
  sandbox: { token: "sandboxAccessToken", secret: "sandboxWebhookSecret" },
  production: { token: "productionAccessToken", secret: "productionWebhookSecret" },
} as const;

export const paymentSettingsRepository: PaymentSettingsRepository = {
  async find(): Promise<SettingsRow | null> {
    const fila = await prisma.paymentSettings.findUnique({ where: { id: ID } });
    if (!fila) return null;

    // El email del autor sale aparte: updatedById es un id suelto, no una
    // relación, para que borrar un super admin no arrastre la configuración.
    const autor = fila.updatedById
      ? await prisma.user.findUnique({
          where: { id: fila.updatedById },
          select: { email: true },
        })
      : null;

    return {
      activeMode: fila.activeMode,
      sandboxAccessToken: fila.sandboxAccessToken,
      sandboxWebhookSecret: fila.sandboxWebhookSecret,
      productionAccessToken: fila.productionAccessToken,
      productionWebhookSecret: fila.productionWebhookSecret,
      updatedAt: fila.updatedAt,
      updatedByEmail: autor?.email ?? null,
    };
  },

  async saveCredentials(mode: PaymentModeInput, creds, updatedById) {
    const cols = COLUMNAS[mode];
    const datos = {
      [cols.token]: creds.accessToken,
      [cols.secret]: creds.webhookSecret,
      updatedById,
    };

    await prisma.paymentSettings.upsert({
      where: { id: ID },
      create: { id: ID, ...datos },
      update: datos,
    });
  },

  async setActiveMode(activeMode: PaymentModeInput, updatedById) {
    await prisma.paymentSettings.upsert({
      where: { id: ID },
      create: { id: ID, activeMode, updatedById },
      update: { activeMode, updatedById },
    });
  },

  countSubscriptionsWithExternalRef() {
    return prisma.subscription.count({ where: { externalRef: { not: null } } });
  },
};
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/paymentSettings.service.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/paymentSettings backend/tests/unit/paymentSettings.service.test.ts
git commit -m "feat(pagos): servicio de credenciales de la pasarela"
```

---

## Task 5: Router y auditoría

**Files:**
- Create: `backend/src/modules/paymentSettings/paymentSettings.router.ts`
- Modify: `backend/src/modules/audit/audit.service.ts`
- Modify: `backend/src/routes/index.ts`
- Test: `backend/tests/unit/paymentSettings.router.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/paymentSettings.router.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { createPaymentSettingsRouter } from "@/modules/paymentSettings/paymentSettings.router";
import type { PaymentSettingsService } from "@/modules/paymentSettings/paymentSettings.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";
import { ValidationError } from "@/shared/errors";

const ESTADO = {
  activeMode: "sandbox" as const,
  credentials: {
    sandbox: { configured: true, last4: "c8f2" },
    production: { configured: false, last4: null },
  },
  webhookUrl: "https://api.test/api/billing/webhook",
  updatedAt: new Date("2026-08-06T12:00:00Z"),
  updatedBy: "admin@plataforma.com",
};

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const tenantAdminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: "t-1", role: "tenant_admin" });

function makeApp(overrides: Partial<PaymentSettingsService> = {}) {
  const service = {
    get: jest.fn().mockResolvedValue(ESTADO),
    saveCredentials: jest.fn().mockResolvedValue({ verified: true, last4: "c8f2" }),
    activate: jest.fn().mockResolvedValue({
      activeMode: "production",
      orphanedSubscriptions: 3,
    }),
    ...overrides,
  } as unknown as PaymentSettingsService;

  const app = express();
  app.use(express.json());
  const auditor = { record: jest.fn().mockResolvedValue(undefined) };
  app.use("/api/admin/payment-settings", createPaymentSettingsRouter(service, auditor));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, auditor };
}

describe("permisos", () => {
  it.each([
    ["get", "/api/admin/payment-settings"],
    ["put", "/api/admin/payment-settings/sandbox"],
    ["post", "/api/admin/payment-settings/activate"],
  ] as const)("%s → 403 para tenant_admin", async (method, url) => {
    const { app } = makeApp();
    const res = await request(app)[method](url).set(
      "Authorization",
      `Bearer ${tenantAdminToken()}`,
    );
    expect(res.status).toBe(403);
  });

  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/admin/payment-settings")).status).toBe(401);
  });
});

describe("GET /", () => {
  it("devuelve el estado", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/payment-settings")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.activeMode).toBe("sandbox");
    expect(res.body.credentials.sandbox).toEqual({ configured: true, last4: "c8f2" });
  });
});

describe("PUT /:mode", () => {
  it("guarda y registra la auditoría sin el token", async () => {
    const { app, service, auditor } = makeApp();

    const res = await request(app)
      .put("/api/admin/payment-settings/production")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" });

    expect(res.status).toBe(200);
    expect(service.saveCredentials).toHaveBeenCalledWith(
      "production",
      { accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" },
      "sa-1",
    );

    const [entrada] = (auditor.record as jest.Mock).mock.calls[0];
    expect(entrada).toMatchObject({
      action: "payment_settings.update",
      tenantId: null,
      userId: "sa-1",
      metadata: { mode: "production", last4: "c8f2" },
    });
    expect(JSON.stringify(entrada)).not.toContain("APP_USR-1234567890");
    expect(JSON.stringify(entrada)).not.toContain("un-secreto-largo");
  });

  it("modo inválido → 422 sin llegar al service", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .put("/api/admin/payment-settings/staging")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" });

    expect(res.status).toBe(422);
    expect(service.saveCredentials).not.toHaveBeenCalled();
  });

  it("body incompleto → 422: no hay actualización parcial", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .put("/api/admin/payment-settings/production")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890" });

    expect(res.status).toBe(422);
    expect(service.saveCredentials).not.toHaveBeenCalled();
  });

  it("propaga el 422 cuando MercadoPago rechaza el token", async () => {
    const { app } = makeApp({
      saveCredentials: jest.fn().mockRejectedValue(new ValidationError("rechazado")),
    } as Partial<PaymentSettingsService>);

    const res = await request(app)
      .put("/api/admin/payment-settings/production")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" });

    expect(res.status).toBe(422);
  });
});

describe("POST /activate", () => {
  it("cambia el modo, informa las huérfanas y lo audita", async () => {
    const { app, auditor } = makeApp();

    const res = await request(app)
      .post("/api/admin/payment-settings/activate")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ mode: "production" });

    expect(res.status).toBe(200);
    expect(res.body.orphanedSubscriptions).toBe(3);
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment_settings.activate",
        metadata: { mode: "production" },
      }),
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/paymentSettings.router.test.ts`
Expected: FAIL — no existe el router.

- [ ] **Step 3: Registrar las acciones de auditoría**

En `backend/src/modules/audit/audit.service.ts`, dentro de `AUDIT_ACTIONS`, después de `"domain.delete"`:

```ts
  "payment_settings.update",
  "payment_settings.activate",
```

- [ ] **Step 4: Escribir el router**

Crear `backend/src/modules/paymentSettings/paymentSettings.router.ts`:

```ts
import { Router } from "express";
import { authenticate } from "@/shared/middleware/authenticate";
import { authorize } from "@/shared/middleware/authorize";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { UnauthorizedError, ValidationError } from "@/shared/errors";
import { env } from "@/config/env";
import { auditService } from "@/modules/audit/audit.router";
import type { Auditor } from "@/modules/audit/audit.service";
import { checkMercadoPagoToken } from "@/shared/services/payments/mercadopago.verify";
import {
  activateSchema,
  paymentModeSchema,
  saveCredentialsSchema,
  type ActivateBody,
  type SaveCredentialsBody,
} from "./paymentSettings.schemas";
import { PaymentSettingsService } from "./paymentSettings.service";
import { paymentSettingsRepository } from "./paymentSettings.repository";

// Credenciales de la pasarela — exclusivo del super admin.
export function createPaymentSettingsRouter(
  service: PaymentSettingsService,
  auditor: Auditor,
): Router {
  const router = Router();

  router.use(authenticate, authorize("super_admin"));

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await service.get());
    }),
  );

  router.put(
    "/:mode",
    validate(saveCredentialsSchema),
    asyncHandler(async (req, res) => {
      const mode = paymentModeSchema.safeParse(req.params.mode);
      if (!mode.success) {
        throw new ValidationError("Modo inválido: usá sandbox o production");
      }

      const actor = req.user;
      if (!actor) throw new UnauthorizedError();

      const body = req.body as SaveCredentialsBody;
      const result = await service.saveCredentials(mode.data, body, actor.id);

      // El token no se loguea nunca: en el registro va solo el modo y los
      // cuatro últimos caracteres, que alcanzan para saber cuál se cargó.
      await auditor.record({
        tenantId: null,
        userId: actor.id,
        action: "payment_settings.update",
        entityType: "payment_settings",
        ipAddress: req.ip,
        metadata: { mode: mode.data, last4: result.last4 },
      });

      res.json(result);
    }),
  );

  router.post(
    "/activate",
    validate(activateSchema),
    asyncHandler(async (req, res) => {
      const actor = req.user;
      if (!actor) throw new UnauthorizedError();

      const { mode } = req.body as ActivateBody;
      const result = await service.activate(mode, actor.id);

      await auditor.record({
        tenantId: null,
        userId: actor.id,
        action: "payment_settings.activate",
        entityType: "payment_settings",
        ipAddress: req.ip,
        metadata: { mode },
      });

      res.json(result);
    }),
  );

  return router;
}

/** Instancia compartida: la usa este router y el resolver del provider. */
export const paymentSettingsService = new PaymentSettingsService(
  paymentSettingsRepository,
  checkMercadoPagoToken,
  env.BACKEND_URL,
);

// Router con el wiring por defecto.
export const paymentSettingsRouter = createPaymentSettingsRouter(
  paymentSettingsService,
  auditService,
);
```

- [ ] **Step 5: Montarlo**

En `backend/src/routes/index.ts`, agregar el import:

```ts
import { paymentSettingsRouter } from "@/modules/paymentSettings/paymentSettings.router";
```

Y el montaje, junto a los otros de `/admin`:

```ts
// Credenciales de la pasarela: solo super admin.
apiRouter.use("/admin/payment-settings", paymentSettingsRouter);
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `cd backend && npx jest tests/unit/paymentSettings.router.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/paymentSettings backend/src/modules/audit/audit.service.ts backend/src/routes/index.ts backend/tests/unit/paymentSettings.router.test.ts
git commit -m "feat(pagos): endpoints de credenciales de la pasarela"
```

---

## Task 6: El provider se resuelve desde la base

**Files:**
- Modify: `backend/src/shared/services/payments/index.ts`
- Modify: `backend/src/modules/billing/billing.service.ts`
- Modify: `backend/src/modules/billing/billing.router.ts`
- Modify: `backend/tests/unit/billing.service.test.ts` (se rompe con el cambio de constructor)
- Test: `backend/tests/unit/paymentProvider.resolver.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/paymentProvider.resolver.test.ts`:

```ts
import { createPaymentProviderResolver } from "@/shared/services/payments";

const CREDS = { accessToken: "APP_USR-x", webhookSecret: "secreto" };

describe("resolvePaymentProvider", () => {
  it("con fake no consulta la base", async () => {
    // Desarrollo local tiene que arrancar sin nada configurado.
    const load = jest.fn();
    const resolve = createPaymentProviderResolver({
      providerName: "fake",
      loadCredentials: load,
      backendUrl: "https://api.test",
    });

    expect((await resolve()).name).toBe("fake");
    expect(load).not.toHaveBeenCalled();
  });

  it("con mercadopago y credenciales cargadas devuelve el provider real", async () => {
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: jest.fn().mockResolvedValue(CREDS),
      backendUrl: "https://api.test",
    });

    expect((await resolve()).name).toBe("mercadopago");
  });

  it("sin credenciales cargadas devuelve el provider que no opera", async () => {
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: jest.fn().mockResolvedValue(null),
      backendUrl: "https://api.test",
    });

    expect((await resolve()).name).toBe("unavailable");
  });

  it("una plataforma sin configurar RECHAZA los webhooks", async () => {
    // La propiedad más importante del archivo: sin credenciales no se puede
    // verificar ninguna firma, así que no se acepta ninguna notificación.
    // Aceptarlas sería regalar el upgrade a cualquiera que conozca la URL.
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: jest.fn().mockResolvedValue(null),
      backendUrl: "https://api.test",
    });

    const provider = await resolve();
    expect(
      provider.verifyWebhook({ signature: "ts=1,v1=abc", requestId: "r", dataId: "1" }),
    ).toBe(false);
  });

  it("lee las credenciales en cada llamada: un cambio toma efecto en el acto", async () => {
    const load = jest.fn().mockResolvedValue(CREDS);
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: load,
      backendUrl: "https://api.test",
    });

    await resolve();
    await resolve();

    expect(load).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest tests/unit/paymentProvider.resolver.test.ts`
Expected: FAIL — `createPaymentProviderResolver is not a function`.

- [ ] **Step 3: Escribir el resolver**

En `backend/src/shared/services/payments/index.ts`, **reemplazar**
`createPaymentProvider()` y la constante `paymentProvider` por:

```ts
export type PaymentProviderResolver = () => Promise<PaymentProvider>;

export interface ResolverDeps {
  providerName: "mercadopago" | "stripe" | "fake";
  /** Credenciales en claro del modo activo, o null si no hay nada cargado. */
  loadCredentials: () => Promise<{ accessToken: string; webhookSecret: string } | null>;
  backendUrl: string;
}

/**
 * Arma el proveedor de pagos en cada operación.
 *
 * Sin caché a propósito: el volumen es un checkout por inmobiliaria por mes más
 * los webhooks, así que una query por operación es ruido. A cambio no hay nada
 * que invalidar, el cambio de credenciales toma efecto en el acto y sigue
 * siendo correcto si mañana corren dos procesos Node. Si alguna vez importa, la
 * caché entra como decorador de este resolver sin tocar nada más.
 */
export function createPaymentProviderResolver(deps: ResolverDeps): PaymentProviderResolver {
  return async () => {
    if (deps.providerName === "fake") return new FakePaymentProvider();

    if (deps.providerName === "stripe") {
      return new UnavailablePaymentProvider(
        "El proveedor de pagos stripe todavía no está implementado. Usá PAYMENT_PROVIDER=mercadopago.",
      );
    }

    const creds = await deps.loadCredentials();
    if (!creds) {
      // Nótese que UnavailablePaymentProvider.verifyWebhook() devuelve false:
      // una plataforma sin configurar RECHAZA los webhooks en vez de
      // aceptarlos. El modo de falla correcto.
      return new UnavailablePaymentProvider(
        "MercadoPago no está configurado. Cargá las credenciales en /admin/pagos.",
      );
    }

    return new MercadoPagoProvider({
      accessToken: creds.accessToken,
      webhookSecret: creds.webhookSecret,
      backendUrl: deps.backendUrl,
    });
  };
}
```

El aviso de `PAYMENT_PROVIDER=fake` que hoy se loguea al arrancar se mueve al
final del archivo, fuera del resolver, para no repetirlo en cada llamada:

```ts
if (env.PAYMENT_PROVIDER === "fake") {
  logger.warn(
    "PAYMENT_PROVIDER=fake: los cobros son simulados y las firmas de webhook no se verifican. Solo para desarrollo.",
  );
}
```

- [ ] **Step 4: Correr el test del resolver y verificar que pasa**

Run: `cd backend && npx jest tests/unit/paymentProvider.resolver.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Cambiar el constructor de BillingService**

En `backend/src/modules/billing/billing.service.ts`:

Cambiar el import del tipo:

```ts
import type { PaymentEvent, PaymentProviderResolver } from "@/shared/services/payments";
```

Cambiar el constructor:

```ts
  constructor(
    private readonly repo: BillingRepository,
    /**
     * Resolver y no instancia: las credenciales viven en base y se leen por
     * operación. No se puede esconder esa lectura detrás de un proxy porque
     * verifyWebhook es síncrono en la interfaz, y esa firma no se toca: es el
     * control de seguridad más importante del módulo.
     */
    private readonly resolveProvider: PaymentProviderResolver,
    /** A dónde vuelve el usuario después de autorizar el pago. */
    private readonly returnUrl: string,
    private readonly notifier: Notifier = noopNotifier,
    private readonly auditor: Auditor = noopAuditor,
  ) {}
```

Y las cuatro llamadas:

```ts
    // en startCheckout
    const provider = await this.resolveProvider();
    const checkout = await provider.createSubscriptionCheckout({
```

```ts
    // en handleWebhook — un solo resolve para las dos llamadas
    const provider = await this.resolveProvider();
    const firmaOk = provider.verifyWebhook({
```

```ts
    const evento = await provider.fetchEvent({
```

```ts
    // en cancelExternal
    const provider = await this.resolveProvider();
    await provider.cancelSubscription(subscription.externalRef);
```

- [ ] **Step 6: Arreglar el wiring del router**

En `backend/src/modules/billing/billing.router.ts`, cambiar el import:

```ts
import { createPaymentProviderResolver } from "@/shared/services/payments";
import { paymentSettingsService } from "@/modules/paymentSettings/paymentSettings.router";
```

y la construcción del service:

```ts
// El resolver se arma acá y no en shared/services/payments porque la
// dependencia va en un solo sentido: un módulo puede usar shared, shared no
// puede conocer un módulo.
const resolveProvider = createPaymentProviderResolver({
  providerName: env.PAYMENT_PROVIDER,
  loadCredentials: () => paymentSettingsService.activeCredentials(),
  backendUrl: env.BACKEND_URL,
});

export const billingService = new BillingService(
  billingRepository,
  resolveProvider,
  `${env.FRONTEND_URL}/panel/suscripcion`,
  notifier,
  auditService,
);
```

- [ ] **Step 7: Arreglar el test existente que se rompe**

En `backend/tests/unit/billing.service.test.ts`, cambiar `makeService`:

```ts
function makeService(
  repo: BillingRepository = makeRepo(),
  provider = new FakePaymentProvider(),
) {
  return {
    // El service recibe un resolver, no la instancia: las credenciales viven
    // en base y se leen por operación.
    service: new BillingService(
      repo,
      async () => provider,
      "https://app.test/panel/suscripcion",
    ),
    repo,
    provider,
  };
}
```

- [ ] **Step 8: Correr toda la suite del backend**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: todo verde. Si algún otro test construye `BillingService`, aplicarle el mismo cambio.

- [ ] **Step 9: Commit**

```bash
git add backend/src/shared/services/payments/index.ts backend/src/modules/billing backend/tests/unit/billing.service.test.ts backend/tests/unit/paymentProvider.resolver.test.ts
git commit -m "refactor(pagos): resolver el provider desde la base en cada operacion"
```

---

## Task 7: Sembrado desde el `.env`

**Files:**
- Modify: `backend/prisma/seed.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Sembrar la fila si está vacía**

En `backend/prisma/seed.ts`, agregar la función antes de `main()`:

```ts
/**
 * Migración de las credenciales que estaban en el .env.
 *
 * Va acá y no en server.ts porque `npm run prisma:seed` ya es un paso
 * documentado del despliegue y es idempotente por naturaleza, mientras que en
 * el arranque sería código que se ejecuta en cada deploy durante años para una
 * condición que se cumple una sola vez.
 */
async function seedPaymentSettings() {
  const existente = await prisma.paymentSettings.findUnique({
    where: { id: "singleton" },
  });
  if (existente) {
    console.log("• Credenciales de la pasarela ya configuradas, se omite");
    return;
  }

  const token = process.env.PAYMENT_API_KEY;
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!token || !secret) {
    console.log("• Sin PAYMENT_API_KEY en el entorno: se cargan desde /admin/pagos");
    return;
  }

  await prisma.paymentSettings.create({
    data: {
      id: "singleton",
      activeMode: "production",
      productionAccessToken: encryptSecret(token),
      productionWebhookSecret: encryptSecret(secret),
    },
  });
  console.log("✔ Credenciales del .env migradas a la base como producción");
}
```

Sumar el import arriba del archivo:

```ts
import { encryptSecret } from "../src/shared/services/crypto/secretBox";
```

Y la llamada dentro de `main()`, después de la siembra del super admin:

```ts
  await seedPaymentSettings();
```

- [ ] **Step 2: Actualizar `.env.example`**

En `backend/.env.example`, reemplazar el bloque de pagos por:

```bash
# Pasarela de pagos. "fake" simula los cobros y no toca la red.
PAYMENT_PROVIDER=fake

# Clave de cifrado de los secretos guardados en base. Generala con:
#   openssl rand -hex 32
# Obligatoria cuando PAYMENT_PROVIDER=mercadopago. No cambia nunca.
CREDENTIALS_ENCRYPTION_KEY=

# SOLO PARA LA MIGRACIÓN INICIAL. `npm run prisma:seed` copia estas dos a la
# base la primera vez y después manda siempre la base. Las credenciales se
# cargan y se rotan desde /admin/pagos, no desde acá.
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=
```

- [ ] **Step 3: Verificar que el seed corre**

Run: `cd backend && npm run prisma:seed`
Expected: imprime "Sin PAYMENT_API_KEY en el entorno" (en desarrollo el `.env` no las tiene) y no rompe nada.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed.ts backend/.env.example
git commit -m "feat(pagos): migrar las credenciales del env a la base en el seed"
```

---

## Task 8: Contrato y cliente del frontend

**Files:**
- Modify: `frontend/src/api/schemas.ts`
- Create: `frontend/src/api/paymentSettings.ts`
- Test: `frontend/tests/unit/paymentSettings.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/tests/unit/paymentSettings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '../../src/lib/session'
import {
  activatePaymentMode,
  getPaymentSettings,
  savePaymentCredentials,
} from '../../src/api/paymentSettings'
import { useMockServer, type MockServer } from '../helpers/mockServer'

const ESTADO = {
  activeMode: 'sandbox',
  credentials: {
    sandbox: { configured: true, last4: 'c8f2' },
    production: { configured: false, last4: null },
  },
  webhookUrl: 'https://api.test/api/billing/webhook',
  updatedAt: '2026-08-06T12:00:00.000Z',
  updatedBy: 'admin@plataforma.com',
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  setAccessToken('token-admin')
})

describe('getPaymentSettings', () => {
  it('parsea el estado', async () => {
    server.on('get', '/admin/payment-settings', { status: 200, data: ESTADO })

    const estado = await getPaymentSettings()

    expect(estado.activeMode).toBe('sandbox')
    expect(estado.credentials.production.configured).toBe(false)
    expect(estado.webhookUrl).toContain('/api/billing/webhook')
  })

  it('acepta el estado vacío de una plataforma sin configurar', async () => {
    server.on('get', '/admin/payment-settings', {
      status: 200,
      data: { ...ESTADO, updatedAt: null, updatedBy: null },
    })

    await expect(getPaymentSettings()).resolves.toBeDefined()
  })
})

describe('savePaymentCredentials', () => {
  it('manda los dos campos al modo indicado', async () => {
    server.on('put', '/admin/payment-settings/production', {
      status: 200,
      data: { verified: true, last4: 'c8f2' },
    })

    await savePaymentCredentials('production', {
      accessToken: 'APP_USR-1234567890',
      webhookSecret: 'un-secreto-largo',
    })

    const [call] = server.callsTo('put', '/admin/payment-settings/production')
    expect(call.body).toEqual({
      accessToken: 'APP_USR-1234567890',
      webhookSecret: 'un-secreto-largo',
    })
  })
})

describe('activatePaymentMode', () => {
  it('devuelve cuántas suscripciones quedan huérfanas', async () => {
    server.on('post', '/admin/payment-settings/activate', {
      status: 200,
      data: { activeMode: 'production', orphanedSubscriptions: 3 },
    })

    const res = await activatePaymentMode('production')

    expect(res.orphanedSubscriptions).toBe(3)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd frontend && npx vitest run tests/unit/paymentSettings.test.ts`
Expected: FAIL — no existe `src/api/paymentSettings.ts`.

- [ ] **Step 3: Agregar los schemas**

En `frontend/src/api/schemas.ts`, al final del archivo:

```ts
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
```

- [ ] **Step 4: Escribir el cliente**

Crear `frontend/src/api/paymentSettings.ts`:

```ts
import { getJson, postJson, putJson } from '../lib/api'
import {
  activateModeResponseSchema,
  paymentSettingsSchema,
  saveCredentialsResponseSchema,
  type ActivateModeResponse,
  type PaymentCredentialsForm,
  type PaymentMode,
  type PaymentSettings,
} from './schemas'

export function getPaymentSettings(): Promise<PaymentSettings> {
  return getJson('/admin/payment-settings', paymentSettingsSchema)
}

/**
 * Guarda un juego de credenciales. Los dos campos van siempre: no hay
 * actualización parcial de campos que no se pueden leer.
 */
export function savePaymentCredentials(
  mode: PaymentMode,
  form: PaymentCredentialsForm,
): Promise<{ verified: boolean; last4: string }> {
  return putJson(`/admin/payment-settings/${mode}`, saveCredentialsResponseSchema, form)
}

export function activatePaymentMode(mode: PaymentMode): Promise<ActivateModeResponse> {
  return postJson('/admin/payment-settings/activate', activateModeResponseSchema, { mode })
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd frontend && npx vitest run tests/unit/paymentSettings.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/paymentSettings.ts frontend/tests/unit/paymentSettings.test.ts
git commit -m "feat(api): cliente de credenciales de la pasarela"
```

---

## Task 9: Pantalla del super admin

**Files:**
- Create: `frontend/src/pages/admin/PaymentSettings.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx`
- Modify: `frontend/src/App.tsx`

Sin test automático: es comportamiento de componente y el harness de Vitest corre
en entorno `node` sin `@testing-library/react`. Verificación manual en la Task 10.

- [ ] **Step 1: Escribir la pantalla**

Crear `frontend/src/pages/admin/PaymentSettings.tsx`:

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { ErrorState, Spinner } from '../../components/common/AsyncState'
import { useResource } from '../../hooks/useResource'
import {
  activatePaymentMode,
  getPaymentSettings,
  savePaymentCredentials,
} from '../../api/paymentSettings'
import {
  paymentCredentialsFormSchema,
  type PaymentCredentialsForm,
  type PaymentMode,
} from '../../api/schemas'
import { ApiError } from '../../lib/apiError'

const modeLabels: Record<PaymentMode, string> = {
  sandbox: 'Sandbox (pruebas)',
  production: 'Producción',
}

export default function PaymentSettings() {
  const settings = useResource(() => getPaymentSettings(), [])
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<PaymentMode | null>(null)
  const [copiado, setCopiado] = useState(false)

  const reload = settings.reload

  const copiarWebhook = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const activar = async (mode: PaymentMode) => {
    setActionError(null)
    try {
      await activatePaymentMode(mode)
      setConfirmando(null)
      reload()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo activar')
    }
  }

  if (settings.error) return <ErrorState error={settings.error} onRetry={reload} />
  if (!settings.data) return <Spinner />

  const s = settings.data

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">Pasarela de pagos</h1>
        <p className="text-muted">Credenciales de MercadoPago con las que cobra la plataforma.</p>
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">Modo activo:</span>
          <Badge tone={s.activeMode === 'production' ? 'success' : 'warning'}>
            {modeLabels[s.activeMode]}
          </Badge>
          {s.updatedAt && (
            <span className="text-xs text-muted">
              Actualizado {new Date(s.updatedAt).toLocaleString('es-AR')}
              {s.updatedBy ? ` por ${s.updatedBy}` : ''}
            </span>
          )}
        </div>

        {/* El paso que siempre se olvida: sin esta URL cargada en MercadoPago
            los pagos entran pero nadie se entera, y quedan pendientes. */}
        <p className="mb-2 text-sm text-ink">
          Pegá esta URL en <strong>Tus integraciones → Webhooks</strong> del panel de MercadoPago:
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-canvas px-3 py-2 text-sm">
            {s.webhookUrl}
          </code>
          <Button variant="secondary" onClick={() => void copiarWebhook(s.webhookUrl)}>
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(['sandbox', 'production'] as const).map((mode) => (
          <CredentialCard
            key={mode}
            mode={mode}
            status={s.credentials[mode]}
            isActive={s.activeMode === mode}
            onSaved={reload}
            onActivate={() => setConfirmando(mode)}
          />
        ))}
      </div>

      {confirmando && (
        <ConfirmActivate
          mode={confirmando}
          onClose={() => setConfirmando(null)}
          onConfirm={() => void activar(confirmando)}
        />
      )}
    </div>
  )
}

interface CardProps {
  mode: PaymentMode
  status: { configured: boolean; last4: string | null }
  isActive: boolean
  onSaved: () => void
  onActivate: () => void
}

function CredentialCard({ mode, status, isActive, onSaved, onActivate }: CardProps) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentCredentialsForm>({ resolver: zodResolver(paymentCredentialsFormSchema) })

  const onSubmit = handleSubmit(async (form) => {
    setError(null)
    setMensaje(null)
    try {
      const res = await savePaymentCredentials(mode, form)
      setMensaje(
        res.verified
          ? 'Credenciales guardadas y verificadas contra MercadoPago.'
          : 'Credenciales guardadas. No se pudo verificar el token: MercadoPago no respondió.',
      )
      reset()
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    }
  })

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium text-ink">{modeLabels[mode]}</h2>
        {isActive ? (
          <Badge tone="success">Activa</Badge>
        ) : (
          <button
            type="button"
            onClick={onActivate}
            disabled={!status.configured}
            className="text-sm text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
          >
            Activar
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-muted">
        {status.configured
          ? `Cargada · termina en ${status.last4}`
          : 'Sin configurar'}
      </p>

      <div className="space-y-3">
        <Input
          label="Access token"
          type="password"
          autoComplete="off"
          placeholder={status.configured ? `···· ${status.last4}` : 'APP_USR-…'}
          error={errors.accessToken?.message}
          {...register('accessToken')}
        />
        <Input
          label="Webhook secret"
          type="password"
          autoComplete="off"
          placeholder={status.configured ? '···· (cargado)' : 'Clave secreta del webhook'}
          error={errors.webhookSecret?.message}
          {...register('webhookSecret')}
        />
      </div>

      {/* Los dos campos van juntos: son campos que no se pueden leer, y un
          formulario donde vacío a veces significa "no lo cambies" es el que
          termina dejando la plataforma sin cobrar. */}
      <p className="mt-2 text-xs text-muted">
        Se reemplazan los dos juntos. El webhook secret no se puede verificar hasta que
        llegue el primer aviso de MercadoPago.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {mensaje && <p className="mt-3 text-sm text-emerald-700">{mensaje}</p>}

      <div className="mt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

function ConfirmActivate({
  mode,
  onClose,
  onConfirm,
}: {
  mode: PaymentMode
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open onClose={onClose} title={`Activar ${modeLabels[mode]}`}>
      <div className="flex gap-3">
        <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="space-y-2 text-sm text-ink">
          <p>
            Las suscripciones creadas con las credenciales actuales no se van a poder
            cancelar ni consultar desde acá después del cambio: MercadoPago no reconoce
            una suscripción de otra cuenta.
          </p>
          <p className="text-muted">
            Los cobros ya autorizados siguen su curso en la cuenta vieja.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" onClick={onConfirm}>
          Activar igual
        </Button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Agregar el ítem al sidebar**

En `frontend/src/components/admin/AdminLayout.tsx`, sumar `CreditCard` al import de
`lucide-react` y agregar el ítem entre Planes y Dominios:

```ts
  { to: '/admin/pagos', label: 'Pasarela', icon: CreditCard },
```

- [ ] **Step 3: Agregar la ruta**

En `frontend/src/App.tsx`, sumar el import:

```ts
import PaymentSettings from './pages/admin/PaymentSettings'
```

Y la ruta dentro del bloque de `/admin`, después de `planes`:

```tsx
          <Route path="pagos" element={<PaymentSettings />} />
```

- [ ] **Step 4: Verificar que compila y pasa la suite**

Run: `cd frontend && npm run build && npm test`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/PaymentSettings.tsx frontend/src/components/admin/AdminLayout.tsx frontend/src/App.tsx
git commit -m "feat(admin): pantalla de credenciales de la pasarela"
```

---

## Task 10: Verificación en el navegador

- [ ] **Step 1: Levantar el entorno con MercadoPago activo**

En `backend/.env`, poner:

```bash
PAYMENT_PROVIDER=mercadopago
CREDENTIALS_ENCRYPTION_KEY=<salida de: openssl rand -hex 32>
```

Levantar: `cd backend && .\scripts\pg.ps1 start`, después `npm run dev` y
`cd frontend && npm run dev`.

- [ ] **Step 2: Verificar que el backend arranca sin credenciales**

Expected: arranca normal. La regla vieja pedía `PAYMENT_API_KEY`; la nueva solo
pide la clave de cifrado.

- [ ] **Step 3: Verificar que la plataforma funciona sin pasarela configurada**

Entrar como `admin@plataforma.com` / `ChangeMe123!`, navegar por `/admin` y
`/admin/inmobiliarias`.
Expected: todo funciona. Que falte la pasarela no puede voltear nada más.

- [ ] **Step 4: Verificar el rechazo de un token inválido**

En `/admin/pagos`, cargar en Sandbox un access token cualquiera
(`APP_USR-inventado-12345`) y un webhook secret cualquiera. Guardar.
Expected: 422 y el mensaje "MercadoPago rechazó esas credenciales". **No se guardó**:
la tarjeta sigue diciendo "Sin configurar".

- [ ] **Step 5: Verificar el guardado con credenciales de prueba reales**

Sacar el access token de prueba de la cuenta de MercadoPago
(*Tus integraciones → Credenciales de prueba*) y cargarlo en Sandbox.
Expected: "Credenciales guardadas y verificadas contra MercadoPago", la tarjeta
pasa a "Cargada · termina en XXXX".

- [ ] **Step 6: Verificar que el secreto no vuelve al navegador**

Con las herramientas de desarrollo abiertas, recargar `/admin/pagos` y mirar la
respuesta de `GET /api/admin/payment-settings`.
Expected: `{ configured: true, last4: "…" }` y **ningún token en el cuerpo**.

- [ ] **Step 7: Verificar el aviso al cambiar de modo**

Cargar también las credenciales de Producción y apretar "Activar" en esa tarjeta.
Expected: aparece la confirmación advirtiendo por las suscripciones que quedan
sin poder cancelarse.

- [ ] **Step 8: Verificar la auditoría**

Ir a `/admin/auditoria`.
Expected: entradas `payment_settings.update` y `payment_settings.activate` con el
super admin como autor. **Ninguna contiene el token.**

- [ ] **Step 9: Verificar el checkout de punta a punta**

Entrar al panel de una inmobiliaria y arrancar el upgrade a un plan pago desde
`/panel/suscripcion`.
Expected: redirige a la página de MercadoPago. La suscripción queda en
`pendingPlanId`, **no** en `planId`: el upgrade se concede recién con el pago.

- [ ] **Step 10: Dejar el entorno como estaba**

Volver `PAYMENT_PROVIDER=fake` en `backend/.env` para el desarrollo del día a día.

---

## Task 11: Documentar

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Documentar las reglas nuevas**

En `CLAUDE.md`, en la lista de la sección "Backend (`backend/src/`)", después de
la viñeta que empieza con "**Dos reglas del cobro que no se negocian**":

```markdown
- **Las credenciales de la pasarela viven en la base, no en el `.env`.** `payment_settings` es una fila única con dos juegos (sandbox y producción) cifrados con AES-256-GCM y una columna que dice cuál está activo; se cargan desde `/admin/pagos`. En el entorno queda solo `CREDENTIALS_ENCRYPTION_KEY`, que **no cambia nunca** — esa es la asimetría que justifica el movimiento: rotar el token o pasar a producción dejan de ser un deploy. `prisma/seed.ts` migra lo que hubiera en `PAYMENT_API_KEY` la primera vez y después manda siempre la base.
- **`paymentProvider` no es una constante: se resuelve por operación** (`createPaymentProviderResolver`). Va como resolver inyectado en `BillingService` y no como proxy porque `verifyWebhook` es **síncrono** en la interfaz, y esa firma no se toca por comodidad: es el control de seguridad más importante del módulo. Sin caché a propósito — el volumen es un checkout por inmobiliaria por mes, y sin caché no hay nada que invalidar ni nada que se desactualice si mañana corren dos procesos. Sin credenciales cargadas devuelve `UnavailablePaymentProvider`, cuyo `verifyWebhook` responde `false`: **una plataforma sin configurar rechaza los webhooks en vez de aceptarlos.**
- El modelo de cobro sigue siendo `preapproval` (débito recurrente) y no Checkout Pro clásico. Los dos abren una página alojada por MercadoPago y se parecen en pantalla; la diferencia es que con `preapproval` el mes siguiente se debita solo, y con Checkout Pro la renovación, el aviso de vencimiento y la mora quedan de nuestro lado. Se evaluó y se descartó: ver `docs/superpowers/specs/2026-08-06-credenciales-pago-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documentar las credenciales de pasarela en base"
```

---

## Verificación final

- [ ] `cd backend && npm test && npm run typecheck && npm run lint` — todo verde
- [ ] `cd frontend && npm test && npm run build` — todo verde
- [ ] Los diez pasos manuales de la Task 10 pasaron en el navegador
- [ ] `backend/.env` volvió a `PAYMENT_PROVIDER=fake`
