import request from "supertest";
import { createApp } from "@/app";
import { fakePaymentProvider, type PaymentEvent } from "@/shared/services/payments";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPlan, crearUsuario } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * Cobros: la regla que no se negocia es que abrir el checkout deja el plan
 * caro en `pendingPlanId`, nunca en `planId`. El upgrade se concede solo
 * cuando el webhook confirma el pago consultando al proveedor —nunca
 * creyéndole al cuerpo de la notificación, que lo puede escribir cualquiera
 * que encuentre la URL—.
 *
 * La otra regla del módulo, que la firma HMAC se verifica antes de mirar el
 * cuerpo, NO se prueba acá: con PAYMENT_PROVIDER=fake, `verifyWebhook()`
 * devuelve true siempre a propósito, así que un test de firma inválida
 * pasaría o fallaría por el motivo equivocado. Esa verificación ya está
 * cubierta en tests/unit/mercadopago.provider.test.ts contra el provider real.
 */
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
   * Registra en el proveedor simulado qué va a devolver `fetchEvent` para un
   * id. Es la única manera de simular "el proveedor confirma el pago" sin
   * red: el servicio NUNCA arma el evento con el cuerpo del webhook, lo va a
   * buscar al proveedor (`handleWebhook` en billing.service.ts).
   */
  function fingirEvento(
    dataId: string,
    evento: Partial<PaymentEvent> & { externalReference: string },
  ): void {
    fakePaymentProvider.pretendEvent(dataId, {
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

  it("un pago rechazado NO aplica el plan pendiente y lo descarta", async () => {
    // Es la mitad que más importa: si un rechazo aplicara el upgrade, alcanzaría
    // con una tarjeta sin fondos para quedarse con el plan caro. Además,
    // billing.service.ts descarta el plan pretendido en vez de dejarlo
    // esperando: si quedara colgado, un pago aprobado posterior por otro
    // motivo (la renovación del plan actual, por ejemplo) lo aplicaría sin
    // que nadie haya vuelto a pedir el upgrade.
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
    expect(despues.pendingPlanId).toBeNull();
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
