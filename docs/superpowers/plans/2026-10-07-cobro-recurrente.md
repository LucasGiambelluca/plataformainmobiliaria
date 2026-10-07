# Cobro recurrente — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la plataforma pueda cobrar la suscripción todos los meses por
MercadoPago (preapproval) y que dejar de pagar tenga consecuencia. Cierra C1, C2,
C3, H1, H2, H3, H4 (parte de código), N1 y N2 de `AUDITORIA.md` (revisión
2026-10-07).

**Architecture:** tres piezas. (1) Una regla pura de vigencia
(`estaAlDia`, 7 días de gracia) que decide si rige el plan pago o el gratuito;
se evalúa perezosamente donde se leen límites y en el reparto de tasaciones, sin
scheduler y sin mutar el plan guardado — pagar de nuevo lo restituye solo.
(2) Dos referencias a la pasarela en `subscriptions`: `externalRef` (débito
vigente) y `pendingExternalRef` (checkout abierto sin pagar). Cada evento se
clasifica por a cuál pertenece; el plan nuevo se aplica solo con un **pago**
aprobado del pendiente, y ahí se cancela el débito anterior. (3) El provider de
MercadoPago entiende `subscription_authorized_payment`, que es como llegan los
débitos de los meses 2 en adelante.

**Decisiones de producto (2026-10-07, del usuario):** pasada la gracia, la
inmobiliaria **baja a los límites del plan gratuito**; lo publicado sigue
visible. **Gracia: 7 días** desde `currentPeriodEnd`. Una suscripción cancelada
no tiene gracia: rige hasta el fin del período pagado.

**Tech Stack:** Express + TypeScript + Prisma/PostgreSQL, Jest; React + Zod + Vitest.

---

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `backend/src/modules/subscriptions/vigencia.ts` | **Nuevo.** `DIAS_DE_GRACIA`, `estaAlDia`, `vigenciaWhere` |
| `backend/tests/unit/vigencia.test.ts` | **Nuevo.** Matriz de la regla |
| `backend/src/modules/subscriptions/subscriptions.repository.ts` | `getPlanLimits` cae a los límites del gratuito si no está al día |
| `backend/src/modules/subscriptions/subscriptions.service.ts` | `getStatus` expone `alDia` |
| `backend/src/modules/appraisals/appraisals.repository.ts` | `participaEnTasaciones` usa `vigenciaWhere` |
| `backend/prisma/schema.prisma` + migración | `Subscription.pendingExternalRef` |
| `backend/src/shared/services/payments/mercadopago.provider.ts` | topic `subscription_authorized_payment`; `status: "pending"` en el alta; preapproval id del pago |
| `backend/src/modules/billing/billing.service.ts` | clasificación por origen, plan solo con pago, cancelación del débito anterior, reactivación |
| `backend/src/modules/billing/billing.repository.ts` | `pendingExternalRef` en lectura/escritura |
| `backend/tests/unit/billing.service.test.ts`, `mercadopago.provider.test.ts` | tests nuevos y ajustados |
| `frontend/src/api/schemas.ts`, `frontend/src/pages/panel/Suscripcion.tsx` | `alDia`, aviso de vencida, reactivar el mismo plan |

---

### Task 1: Regla de vigencia

**Files:**
- Create: `backend/src/modules/subscriptions/vigencia.ts`
- Test: `backend/tests/unit/vigencia.test.ts`

- [ ] **Step 1: test que falla**

```ts
import { DIAS_DE_GRACIA, estaAlDia } from "@/modules/subscriptions/vigencia";

const DIA = 24 * 60 * 60 * 1000;
const FIN = new Date("2026-10-01T00:00:00Z");
const pago = { priceAmount: "29999" };

const sub = (o: Partial<Parameters<typeof estaAlDia>[0]> = {}) => ({
  status: "active" as const,
  currentPeriodEnd: FIN,
  plan: pago,
  ...o,
});

describe("estaAlDia", () => {
  it("el plan gratuito siempre está al día", () => {
    expect(estaAlDia(sub({ plan: { priceAmount: "0" }, status: "past_due" }), new Date(FIN.getTime() + 90 * DIA))).toBe(true);
  });
  it("dentro del período pagado está al día", () => {
    expect(estaAlDia(sub(), new Date(FIN.getTime() - DIA))).toBe(true);
  });
  it("vencido dentro de la gracia sigue al día (los reintentos de débito de MP)", () => {
    expect(estaAlDia(sub({ status: "past_due" }), new Date(FIN.getTime() + (DIAS_DE_GRACIA - 1) * DIA))).toBe(true);
  });
  it("pasada la gracia ya no", () => {
    expect(estaAlDia(sub({ status: "past_due" }), new Date(FIN.getTime() + (DIAS_DE_GRACIA + 1) * DIA))).toBe(false);
  });
  it("activa pero sin débito que la renueve también vence: el estado no alcanza", () => {
    expect(estaAlDia(sub(), new Date(FIN.getTime() + (DIAS_DE_GRACIA + 1) * DIA))).toBe(false);
  });
  it("cancelada no tiene gracia: rige hasta el fin del período pagado", () => {
    expect(estaAlDia(sub({ status: "canceled" }), new Date(FIN.getTime() - DIA))).toBe(true);
    expect(estaAlDia(sub({ status: "canceled" }), new Date(FIN.getTime() + DIA))).toBe(false);
  });
  it("suspendida nunca está al día", () => {
    expect(estaAlDia(sub({ status: "suspended" }), new Date(FIN.getTime() - DIA))).toBe(false);
  });
  it("sin período (plan asignado a mano por el super admin) está al día", () => {
    expect(estaAlDia(sub({ currentPeriodEnd: null }), new Date())).toBe(true);
  });
});
```

- [ ] **Step 2:** `cd backend && npx jest tests/unit/vigencia.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: implementación**

```ts
import type { Prisma, SubscriptionStatus } from "@prisma/client";

/**
 * Días que un plan pago sigue rigiendo después de vencer sin que entre el
 * débito. Cubre los reintentos de MercadoPago sin regalar un mes. Decisión de
 * producto del 2026-10-07.
 */
export const DIAS_DE_GRACIA = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface VigenciaInput {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  plan: { priceAmount: string };
}

/**
 * ¿Rige el plan pago, o la inmobiliaria cae a los límites del gratuito?
 *
 * Se evalúa al leer, no con un cron (no hay scheduler en el proyecto), y NO se
 * escribe el plan gratuito en la base: pagar de nuevo restituye el plan sin
 * ningún paso extra. El estado solo no alcanza: una suscripción `active` cuyo
 * débito dejó de llegar sin ningún aviso de la pasarela también vence.
 */
export function estaAlDia(sub: VigenciaInput, ahora: Date = new Date()): boolean {
  if (Number(sub.plan.priceAmount) === 0) return true;
  if (sub.status === "suspended") return false;
  // Sin período: plan asignado a mano por el super admin, sin pasarela.
  if (!sub.currentPeriodEnd) return true;
  // Quien cancela ya decidió irse: rige lo pagado, sin gracia.
  const gracia = sub.status === "canceled" ? 0 : DIAS_DE_GRACIA * DIA_MS;
  return ahora.getTime() <= sub.currentPeriodEnd.getTime() + gracia;
}

/**
 * La misma regla como filtro SQL, para consultas que tienen que FILTRAR y no
 * evaluar de a una (el reparto de tasaciones). No contempla el plan gratuito
 * porque se combina con capacidades que el gratuito no tiene; si se usa en otro
 * lado, revisar eso.
 */
export function vigenciaWhere(ahora: Date = new Date()): Prisma.SubscriptionWhereInput {
  const limiteConGracia = new Date(ahora.getTime() - DIAS_DE_GRACIA * DIA_MS);
  return {
    OR: [
      { currentPeriodEnd: null, status: { not: "suspended" } },
      {
        status: { in: ["active", "trialing", "past_due"] },
        currentPeriodEnd: { gte: limiteConGracia },
      },
      { status: "canceled", currentPeriodEnd: { gte: ahora } },
    ],
  };
}
```

- [ ] **Step 4:** test → PASS. **Step 5:** commit `feat(subscriptions): regla de vigencia con 7 dias de gracia`.

### Task 2: Límites y tasaciones según vigencia

**Files:** `subscriptions.repository.ts` (`getPlanLimits`), `subscriptions.service.ts` (`getStatus` + `alDia`), `appraisals.repository.ts` (`participaEnTasaciones`), `tests/unit/subscriptions.service.test.ts`.

- [ ] `getPlanLimits`: leer `status`, `currentPeriodEnd` y `plan.priceAmount`; si `!estaAlDia(...)`, devolver los límites del plan activo con `priceAmount = 0` (el más antiguo). Si no existe plan gratuito, `logger.error` y devolver los del plan propio (no romper el panel por un dato de configuración).
- [ ] `participaEnTasaciones` pasa a función `participaEnTasaciones(ahora = new Date())` con `subscriptions.some = { ...vigenciaWhere(ahora), plan: {...} }`; reemplazar sus tres usos por la llamada.
- [ ] `getStatus` devuelve `subscription: { ...subscription, alDia: estaAlDia(subscription) }`. Test unitario: suscripción paga vencida hace 10 días → `alDia: false`.
- [ ] typecheck + unit → commit `feat(subscriptions): bajar a limites del gratuito al vencer la gracia`.

### Task 3: `pendingExternalRef`

**Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261007120000_pending_external_ref/migration.sql`.

- [ ] En `Subscription`, debajo de `externalRef`:

```prisma
  // Débito automático del checkout abierto y todavía no pagado. `externalRef`
  // es el débito VIGENTE. Van separados porque un cambio de plan tiene dos
  // débitos vivos a la vez hasta que el nuevo cobra: con una sola columna el
  // checkout pisaba la referencia del vigente, que quedaba debitando sin que
  // nadie pudiera cancelarlo.
  pendingExternalRef String?            @map("pending_external_ref")
```

- [ ] Migración:

```sql
ALTER TABLE "subscriptions" ADD COLUMN "pending_external_ref" TEXT;
```

- [ ] `npx prisma generate` → commit `feat(billing): columna pending_external_ref`.

### Task 4: MercadoPago — débitos mensuales

**Files:** `mercadopago.provider.ts`, `tests/unit/mercadopago.provider.test.ts`.

- [ ] Test que falla: `fetchEvent({ topic: "subscription_authorized_payment", id: "777" })` con `GET /authorized_payments/777` → `{ id: 777, preapproval_id: "pre-1", external_reference: SUB, transaction_amount: 29999, currency_id: "ARS", debit_date: "...", payment: { id: 555, status: "approved" } }` devuelve `externalPaymentId: "555"`, `externalSubscriptionId: "pre-1"`, `status: "approved"`. Otro: sin `payment` (programado) → `null`. Otro: el body del alta lleva `status: "pending"`.
- [ ] Implementación:

```ts
    // Así llegan los débitos de los meses 2 en adelante. Sin esta rama caían en
    // "tema no manejado": se cobraba y no se registraba nada (C1).
    if (topic === "subscription_authorized_payment") {
      const a = await this.request(`/authorized_payments/${id}`, { method: "GET" });
      const pago = a.payment;
      // Programado y sin intento de cobro todavía: no hay nada que registrar.
      if (!pago?.id) return null;
      const status = ESTADOS[String(pago.status)] ?? "pending";
      return {
        // El id del PAGO y no el del authorized_payment: es el mismo que trae
        // el topic `payment`, así que si llegan los dos se deduplican solos.
        externalPaymentId: String(pago.id),
        externalSubscriptionId: typeof a.preapproval_id === "string" ? a.preapproval_id : null,
        status,
        amount: a.transaction_amount != null ? String(a.transaction_amount) : null,
        currency: typeof a.currency_id === "string" ? a.currency_id : null,
        paidAt: status === "approved" && a.debit_date ? new Date(String(a.debit_date)) : null,
        externalReference: typeof a.external_reference === "string" ? a.external_reference : null,
      };
    }
```

- [ ] En `payment`, preapproval id de `metadata.preapproval_id` o `point_of_interaction.transaction_data.subscription_id`.
- [ ] En el alta, `status: "pending"` (variante sin `card_token_id`: el cliente carga la tarjeta en la página de MP).
- [ ] Tests → commit `fix(billing): procesar los debitos mensuales de preapproval`.

### Task 5: BillingService — un solo débito vivo, plan solo con pago

**Files:** `billing.service.ts`, `billing.repository.ts`, `tests/unit/billing.service.test.ts`.

Interfaz:
- `SubscriptionForCheckout` suma `status`, `currentPeriodEnd`, `pendingExternalRef`.
- `setPendingPlan(subId, pendingPlanId, pendingExternalRef)` escribe `pendingExternalRef` (ya no toca `externalRef`).
- `applyPendingPlan` además promueve `pendingExternalRef → externalRef`.
- `clearPendingPlan` limpia `pendingPlanId` y `pendingExternalRef`.
- `findSubscriptionByExternalRef` busca en las dos columnas.

Reglas del webhook (origen = a qué débito pertenece el evento):

| Evento | `pendiente` | `vigente` / sin dato | `reemplazado` |
|---|---|---|---|
| pago aprobado | aplica plan, promueve ref, `active` + período; **cancela el débito anterior** | `active` + período | se registra; se cancela ese débito |
| pago rechazado | nada (MP reintenta) | `past_due` (solo `vigente`) | se registra |
| pago pending/refunded | se registra, la suscripción no cambia (N2) | ídem | ídem |
| débito autorizado (sin pago) | nada: el plan espera al pago (H1) | nada (N1) | se cancela |
| débito pendiente | nada (H3) | nada | nada |
| débito cancelado | limpia el pendiente | `canceled` | nada |

- Correos y auditoría solo para **pagos** que aportan algo, nunca para eventos del débito (N1). Un pago de un débito reemplazado se audita pero no se avisa: el correo diría el plan nuevo.
- Las cancelaciones en la pasarela van **después** del commit y nunca tiran: si fallan se loguea, y el próximo débito del reemplazado lo vuelve a intentar.
- `createCheckout`: el mismo plan se rechaza solo si está `active` y al día (H2). Si había un checkout pendiente, se cancela en la pasarela antes de anotar el nuevo.
- `cancelExternal` cancela el vigente y el pendiente.

Tests (nuevos): pago aprobado del pendiente aplica plan y cancela el anterior; pago aprobado del vigente no aplica plan; débito `authorized` no aplica plan ni manda correo; débito `pending` no toca el estado; pago rechazado del pendiente no lo limpia; pago de un reemplazado cancela ese débito y no cambia la suscripción; checkout con pendiente previo lo cancela; mismo plan vencido se puede volver a contratar.

- [ ] commit `fix(billing): un solo debito vivo y plan solo con pago aprobado`.

### Task 6: Frontend — vencida y reactivación

**Files:** `frontend/src/api/schemas.ts`, `frontend/src/pages/panel/Suscripcion.tsx`.

- [ ] `alDia: z.boolean()` en la suscripción.
- [ ] Aviso cuando `!alDia`: "Tu suscripción venció: tenés los límites del plan gratuito hasta que se acredite el pago."
- [ ] El botón del plan actual se habilita si `!alDia` o `status !== 'active'` ("Reactivar").
- [ ] `npm run build` + `npm test` → commit `feat(panel): aviso de suscripcion vencida y reactivacion`.

### Task 7: Verificación

- [ ] backend `npm run typecheck`, `npx jest tests/unit`; integración si hay Postgres.
- [ ] Actualizar `AUDITORIA.md` (C1–C3, H1–H3, N1, N2 cerrados) y CLAUDE.md (regla de vigencia, `pendingExternalRef`).

---

## Fuera de este plan (siguientes)

- **H4 / ciclo sandbox** — manual, con credenciales de prueba: alta → checkout → débito → segundo débito → rechazo → cancelación. Requiere el webhook configurado en el panel de MP con los topics `payment`, `subscription_preapproval` y `subscription_authorized_payment`.
- **Plan 2 — catálogo y dependencias:** paginación (H5), cupo de destacadas (H6), `npm audit fix` (H7, H8).
- **Plan 3 — pulido:** `back_url` con subpath (N3), cambio de plan del super admin vs. pasarela (N4), N5–N9.
