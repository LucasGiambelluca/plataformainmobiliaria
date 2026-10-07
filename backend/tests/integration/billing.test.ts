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
      data: { pendingPlanId: caro.id, pendingExternalRef: "pre-enterprise" },
    });

    // La referencia que se manda al crear el checkout es nuestro subscription.id,
    // y el pago viene del débito del checkout: eso es lo que concede el plan.
    fingirEvento("evt-1", { externalReference: sub.id, externalSubscriptionId: "pre-enterprise" });

    const res = await request(app)
      .post("/api/billing/webhook?type=payment&data.id=evt-1")
      .send({});

    expect(res.status).toBeLessThan(300);

    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.planId).toBe(caro.id);
    expect(despues.pendingPlanId).toBeNull();
    // El débito del checkout pasa a ser el vigente.
    expect(despues.externalRef).toBe("pre-enterprise");
    expect(despues.pendingExternalRef).toBeNull();
  });

  it("un pago rechazado NO aplica el plan pendiente", async () => {
    // Es la mitad que más importa: si un rechazo aplicara el upgrade, alcanzaría
    // con una tarjeta sin fondos para quedarse con el plan caro. El pendiente
    // NO se descarta: MercadoPago reintenta el débito, y el cobro del reintento
    // tiene que poder concederlo. Que un pago de otro débito (la renovación del
    // plan actual) lo aplique por error lo impide el origen del evento.
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    const caro = await crearPlan({ slug: "enterprise", priceAmount: "79999" });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { pendingPlanId: caro.id, pendingExternalRef: "pre-enterprise" },
    });

    fingirEvento("evt-2", {
      externalReference: sub.id,
      externalSubscriptionId: "pre-enterprise",
      status: "rejected",
    });

    await request(app).post("/api/billing/webhook?type=payment&data.id=evt-2").send({});

    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.planId).not.toBe(caro.id);
    expect(despues.pendingPlanId).toBe(caro.id);
  });

  it("un pago de la renovación del plan actual no concede el pendiente", async () => {
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    const caro = await crearPlan({ slug: "enterprise", priceAmount: "79999" });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        externalRef: "pre-actual",
        pendingPlanId: caro.id,
        pendingExternalRef: "pre-enterprise",
      },
    });

    fingirEvento("evt-renov", { externalReference: sub.id, externalSubscriptionId: "pre-actual" });

    await request(app).post("/api/billing/webhook?type=payment&data.id=evt-renov").send({});

    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.planId).not.toBe(caro.id);
    expect(despues.status).toBe("active");
    expect(despues.externalRef).toBe("pre-actual");
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

/**
 * Entregas concurrentes del mismo webhook (tarea B1 de AUDITORIA.md).
 *
 * Este es el test que impide que el agujero vuelva. Uno con entregas sucesivas
 * pasaría incluso con el código roto: la segunda siempre encuentra la fila que
 * dejó la primera. Lo que reproduce el agujero es que las dos entregas se pisen,
 * y para eso tienen que correr a la vez.
 *
 * Contra una base real, porque la corrección es la restricción única: un test
 * que no pega contra el índice de Postgres no está probando lo que dice probar.
 */
describe("webhook con entregas concurrentes", () => {
  /**
   * N entregas del mismo evento sin esperarlas entre sí, que es lo que hace la
   * pasarela cuando reintenta: no espera a que la anterior termine.
   */
  function entregasSimultaneas(cuantas: number) {
    return Promise.all(
      Array.from({ length: cuantas }, () =>
        request(app)
          .post("/api/billing/webhook?type=payment&data.id=evt-carrera")
          .send({}),
      ),
    );
  }

  /** Registra en el proveedor simulado el evento que las entregas van a buscar. */
  function fingirPagoCarrera(externalReference: string) {
    fakePaymentProvider.pretendEvent("evt-carrera", {
      externalPaymentId: "pago-carrera",
      externalSubscriptionId: null,
      status: "approved",
      amount: "79999.00",
      currency: "ARS",
      paidAt: new Date("2026-08-03T12:00:00Z"),
      externalReference,
    });
  }

  it("8 entregas simultáneas del mismo cobro dejan UNA sola fila de pago", async () => {
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    fingirPagoCarrera(sub.id);

    const respuestas = await entregasSimultaneas(8);

    // Ninguna puede fallar: la pasarela reintenta lo que da error, y un 500
    // acá se traduce a una tormenta de entregas.
    for (const r of respuestas) {
      expect(r.status).toBeLessThan(300);
    }

    // El agregado que se rompe con el bug: dos filas para un solo cobro, con
    // los ingresos y el MRR del panel del super admin inflados.
    const pagos = await prisma.payment.findMany({
      where: { externalPaymentId: "pago-carrera" },
    });
    expect(pagos).toHaveLength(1);
    expect(pagos[0].status).toBe("paid");
  });

  it("entregas simultáneas de pagos DISTINTOS se registran todos", async () => {
    // La contracara del anterior: agregar la restricción no puede convertir el
    // alta en un deduplicador que se coma pagos legítimos. Cada cobro tiene su
    // propio externalPaymentId, así que los tres tienen que quedar.
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });

    const distintos = ["pago-a", "pago-b", "pago-c"];
    const respuestas = await Promise.all(
      distintos.map((id) => {
        fakePaymentProvider.pretendEvent(`evt-${id}`, {
          externalPaymentId: id,
          externalSubscriptionId: null,
          status: "approved",
          amount: "79999.00",
          currency: "ARS",
          paidAt: new Date("2026-08-03T12:00:00Z"),
          externalReference: sub.id,
        });
        return request(app).post(`/api/billing/webhook?type=payment&data.id=evt-${id}`).send({});
      }),
    );

    for (const r of respuestas) expect(r.status).toBeLessThan(300);
    const pagos = await prisma.payment.findMany({
      where: { externalPaymentId: { in: distintos } },
    });
    expect(pagos).toHaveLength(3);
  });

  it("la restricción está en la base, no solo en el código", async () => {
    // Si algún día alguien saca el `@unique` del schema, este test falla aunque
    // el servicio conserve el chequeo previo: es la base la que cierra la
    // carrera, y este es el que se entera si la sacaron.
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });

    const indices = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'payments' AND indexname = 'payments_external_payment_id_key'
    `;
    expect(indices).toHaveLength(1);
    expect(indices[0].indexdef).toContain("UNIQUE");

    const crear = (externalPaymentId: string | null, dia: number) =>
      prisma.payment.create({
        data: {
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          amount: "1000",
          currency: "ARS",
          status: "pending",
          provider: "mercadopago",
          externalPaymentId,
          paidAt: null,
          createdAt: new Date(2026, 0, dia),
        },
      });

    await crear("unico", 1);
    await expect(crear("unico", 2)).rejects.toThrow();

    // Los NULL no cuentan como duplicados entre sí: los pagos que todavía no
    // pasaron por la pasarela conviven, que es lo que permite que la columna
    // siga siendo nullable.
    await crear(null, 3);
    await crear(null, 4);
    expect(await prisma.payment.count({ where: { externalPaymentId: null } })).toBe(2);
  });
});

/**
 * Atomicidad del webhook (tarea A1 de AUDITORIA.md).
 *
 * Antes, las cuatro escrituras iban sueltas: si el proceso se caía entre la
 * segunda y la tercera, el pago quedaba registrado y la suscripción activa,
 * pero el plan que se pagó no se aplicaba. La inmobiliaria pagaba el plan caro
 * y se quedaba en el barato, y la única red era el reintento de la pasarela.
 *
 * Estos tests no miran que haya una transacción: hacen fallar una escritura de
 * verdad y comprueban que no queda NADA escrito. Si alguien saca la
 * transacción, ambos fallan.
 */
describe("atomicidad del webhook", () => {
  const app = createApp();

  /**
   * Deja la suscripción con un plan pendiente que NO existe.
   *
   * `subscriptions.pending_plan_id` no tiene restricción de foreign key, así
   * que el valor inválido se puede guardar; la restricción aparece recién
   * cuando `applyPendingPlan` lo copia a `plan_id`, que sí la tiene. Eso hace
   * fallar la TERCERA escritura después de que las dos primeras ya salieron:
   * es el escenario de A1 exacto, y no un fallo de la primera —que no probaría
   * nada, porque sin transacción tampoco llegaría a ejecutarse.
   */
  async function subscriptionConPlanPendienteInvalido() {
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    await crearPlan({ slug: "enterprise", priceAmount: "79999" });
    const pendienteQueNoExiste = "99999999-9999-9999-9999-999999999999";
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "past_due",
        pendingPlanId: pendienteQueNoExiste,
        pendingExternalRef: "pre-pendiente",
      },
    });
    return { sub, planIdOriginal: sub.planId };
  }

  function fingirPagoAprobado(dataId: string, externalReference: string) {
    fakePaymentProvider.pretendEvent(dataId, {
      externalPaymentId: `pago-${dataId}`,
      // Del débito del checkout: es el único origen que aplica el plan.
      externalSubscriptionId: "pre-pendiente",
      status: "approved",
      amount: "79999.00",
      currency: "ARS",
      paidAt: new Date("2026-08-03T12:00:00Z"),
      externalReference,
    });
  }

  it("si falla la última escritura, no queda NADA de las anteriores", async () => {
    // El agujero de A1: sin transacción, el pago queda registrado y la
    // suscripción activa, pero el plan pagado no se aplica. La inmobiliaria
    // pagó el caro y se queda en el barato.
    const { sub, planIdOriginal } = await subscriptionConPlanPendienteInvalido();
    fingirPagoAprobado("evt-atomico", sub.id);

    const res = await request(app)
      .post("/api/billing/webhook?type=payment&data.id=evt-atomico")
      .send({});

    // La pasarela tiene que ver un error para reintentar: un 200 con una
    // transacción a medias sería peor que no hacer nada.
    expect(res.status).toBeGreaterThanOrEqual(500);

    // Lo que importa: la primera escritura tampoco quedó.
    expect(
      await prisma.payment.count({ where: { externalPaymentId: "pago-evt-atomico" } }),
    ).toBe(0);

    // Y la segunda tampoco: la suscripción no se activó.
    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.status).toBe("past_due");
    // Ni se aplicó un plan, ni se limpió el pendiente: la transacción entera
    // quedó como estaba, lista para que un reintento sí la complete.
    expect(despues.planId).toBe(planIdOriginal);
    expect(despues.pendingPlanId).toBe("99999999-9999-9999-9999-999999999999");
  });

  it("el mismo camino sin el fallo aplica pago, suscripción y plan juntos", async () => {
    // La contracara del anterior: el rollback no puede ser "nunca se escribe".
    // Con un pendiente válido, las tres escrituras tienen que quedar aplicadas.
    const { subscription: sub } = await crearInmobiliariaCompleta("norte", {
      planSlug: "basico-norte",
    });
    const caro = await crearPlan({ slug: "enterprise", priceAmount: "79999" });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "past_due", pendingPlanId: caro.id, pendingExternalRef: "pre-pendiente" },
    });
    fingirPagoAprobado("evt-atomico-ok", sub.id);

    const res = await request(app)
      .post("/api/billing/webhook?type=payment&data.id=evt-atomico-ok")
      .send({});
    expect(res.status).toBeLessThan(300);

    expect(
      await prisma.payment.count({ where: { externalPaymentId: "pago-evt-atomico-ok" } }),
    ).toBe(1);
    const despues = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(despues.status).toBe("active");
    expect(despues.planId).toBe(caro.id);
    expect(despues.pendingPlanId).toBeNull();
  });
});
