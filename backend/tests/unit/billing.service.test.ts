import {
  BillingService,
  type BillingRepository,
  type SubscriptionForCheckout,
} from "@/modules/billing/billing.service";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import { FakePaymentProvider, type PaymentEvent } from "@/shared/services/payments";
import type { Notifier } from "@/modules/notifications";
import type { Auditor } from "@/modules/audit/audit.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const SUB_ID = "44444444-4444-4444-4444-444444444444";
const PLAN_BASICO = "55555555-5555-5555-5555-555555555555";
const PLAN_PRO = "66666666-6666-6666-6666-666666666666";

// Inmobiliaria en el plan gratuito, sin ningún débito en la pasarela.
const SUBSCRIPTION: SubscriptionForCheckout = {
  id: SUB_ID,
  tenantId: TENANT_ID,
  status: "active",
  currentPeriodEnd: null,
  externalRef: null,
  pendingExternalRef: null,
  plan: {
    id: PLAN_BASICO,
    name: "Básico",
    priceAmount: "0",
    priceCurrency: "ARS",
  },
};

// Abrió el checkout de Pro: su débito "mp-sub-1" está pendiente de cobrar.
const CON_CHECKOUT: SubscriptionForCheckout = {
  ...SUBSCRIPTION,
  pendingExternalRef: "mp-sub-1",
};

// Paga Pro con el débito "mp-sub-1", al día.
const PRO_VIGENTE: SubscriptionForCheckout = {
  ...SUBSCRIPTION,
  externalRef: "mp-sub-1",
  currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  plan: { id: PLAN_PRO, name: "Pro", priceAmount: "29999", priceCurrency: "ARS" },
};

const PLAN_PAGO = {
  id: PLAN_PRO,
  name: "Pro",
  priceAmount: "29999",
  priceCurrency: "ARS",
  isActive: true,
};

// Sentinel que hace de cliente transaccional en los tests. No es un tx real:
// lo que se verifica acá es que las escrituras RECIBAN el que les pasa
// `enTransaccion`, que es la garantía de que caen dentro de la transacción.
const TX = { __transaccion: "de-prueba" };

function makeRepo(overrides: Partial<BillingRepository> = {}) {
  const repo: BillingRepository = {
    findSubscription: jest.fn().mockResolvedValue(SUBSCRIPTION),
    findPlan: jest.fn().mockResolvedValue(PLAN_PAGO),
    findBillingEmail: jest.fn().mockResolvedValue("admin@inmo.com"),
    setPendingPlan: jest.fn().mockResolvedValue(undefined),
    applyPendingPlan: jest.fn().mockResolvedValue(undefined),
    clearPendingPlan: jest.fn().mockResolvedValue(undefined),
    findSubscriptionById: jest.fn().mockResolvedValue(CON_CHECKOUT),
    findSubscriptionByExternalRef: jest.fn().mockResolvedValue(null),
    updateSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
    // El default es "el pago es nuevo": es lo que devuelven las entregas que
    // no encuentra fila previa. Los tests de reentrega lo sobreescriben con
    // `{ created: false, changed: false }`.
    upsertPayment: jest.fn().mockResolvedValue({ created: true, changed: true }),
    enTransaccion: jest.fn((fn) => fn(TX)),
    ...overrides,
  };
  return repo;
}

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

const evento = (overrides: Partial<PaymentEvent> = {}): PaymentEvent => ({
  externalPaymentId: "mp-pago-1",
  externalSubscriptionId: "mp-sub-1",
  status: "approved",
  amount: "29999",
  currency: "ARS",
  paidAt: new Date("2026-07-28T10:00:00Z"),
  externalReference: SUB_ID,
  ...overrides,
});

describe("createCheckout", () => {
  it("devuelve la URL de la pasarela con el monto del plan", async () => {
    const { service, provider } = makeService();

    const res = await service.createCheckout(TENANT_ID, PLAN_PRO);

    expect(res.redirectUrl).toContain("https://pagos.local/checkout/");
    expect(provider.checkouts[0]).toEqual({ reference: SUB_ID, amount: "29999" });
  });

  it("deja el plan como PENDIENTE, no lo concede", async () => {
    // El agujero que este test cubre: si el checkout aplicara el plan, bastaba
    // con abrirlo y abandonarlo para quedarse con el plan caro sin pagar. Pasó
    // de verdad — la primera versión escribía planId acá.
    const { service, repo } = makeService();

    await service.createCheckout(TENANT_ID, PLAN_PRO);

    expect(repo.setPendingPlan).toHaveBeenCalledWith(
      SUB_ID,
      PLAN_PRO,
      expect.stringContaining("fake-sub-"),
    );
    expect(repo.applyPendingPlan).not.toHaveBeenCalled();
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("el plan gratuito no pasa por la pasarela", async () => {
    const repo = makeRepo({
      findPlan: jest.fn().mockResolvedValue({ ...PLAN_PAGO, priceAmount: "0" }),
    });
    const { service, provider } = makeService(repo);

    await expect(service.createCheckout(TENANT_ID, PLAN_PRO)).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(provider.checkouts).toHaveLength(0);
  });

  it("un plan desactivado no se puede contratar", async () => {
    const repo = makeRepo({
      findPlan: jest.fn().mockResolvedValue({ ...PLAN_PAGO, isActive: false }),
    });
    const { service } = makeService(repo);

    await expect(service.createCheckout(TENANT_ID, PLAN_PRO)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("no se puede contratar el plan que ya se tiene", async () => {
    const repo = makeRepo({
      findPlan: jest.fn().mockResolvedValue({ ...PLAN_PAGO, id: PLAN_BASICO }),
    });
    const { service } = makeService(repo);

    await expect(service.createCheckout(TENANT_ID, PLAN_BASICO)).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("sin email de facturación no se firma nada", async () => {
    const repo = makeRepo({ findBillingEmail: jest.fn().mockResolvedValue(null) });
    const { service, provider } = makeService(repo);

    await expect(service.createCheckout(TENANT_ID, PLAN_PRO)).rejects.toBeInstanceOf(
      BadRequestError,
    );
    expect(provider.checkouts).toHaveLength(0);
  });
});

describe("handleWebhook", () => {
  function conFirmaInvalida() {
    const provider = new FakePaymentProvider();
    jest.spyOn(provider, "verifyWebhook").mockReturnValue(false);
    return provider;
  }

  it("firma inválida → no se consulta ni se escribe nada", async () => {
    // El control más importante del módulo: sin esto cualquiera que conozca la
    // URL postea "pago aprobado" y se queda con el plan caro gratis.
    const provider = conFirmaInvalida();
    const fetchSpy = jest.spyOn(provider, "fetchEvent");
    const { service, repo } = makeService(makeRepo(), provider);

    await expect(
      service.handleWebhook({
        signature: "ts=1,v1=falsa",
        requestId: "r1",
        topic: "payment",
        dataId: "mp-pago-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repo.upsertPayment).not.toHaveBeenCalled();
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("el estado sale de consultar al proveedor, no del cuerpo", async () => {
    // fetchEvent no tiene registrado el id: aunque el webhook diga "aprobado",
    // sin confirmación del proveedor no se toca nada.
    const { service, repo } = makeService();

    const res = await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "payment",
      dataId: "id-inventado",
    });

    expect(res.processed).toBe(false);
    expect(repo.upsertPayment).not.toHaveBeenCalled();
  });

  it("pago aprobado activa la suscripción y registra el pago", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-1", evento());
    const { service, repo } = makeService(makeRepo(), provider);

    const res = await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "payment",
      dataId: "mp-pago-1",
    });

    expect(res.processed).toBe(true);
    expect(repo.upsertPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: SUB_ID,
        tenantId: TENANT_ID,
        amount: "29999",
        status: "paid",
        externalPaymentId: "mp-pago-1",
      }),
      // El segundo argumento es el cliente de la transacción: sin esto, las
      // escrituras se harían fuera y A1 volvería (ver A1 de AUDITORIA.md).
      TX,
    );
    expect(repo.enTransaccion).toHaveBeenCalled();

    const [id, estado, periodEnd] = (repo.updateSubscriptionStatus as jest.Mock).mock
      .calls[0];
    expect(id).toBe(SUB_ID);
    expect(estado).toBe("active");
    expect(periodEnd).toBeInstanceOf(Date);

    // Y recién acá se concede el plan que se había dejado pendiente, también
    // adentro de la transacción.
    expect(repo.applyPendingPlan).toHaveBeenCalledWith(SUB_ID, TX);
  });

  it("pago rechazado del débito vigente deja la suscripción en past_due", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-2", evento({ externalPaymentId: "mp-pago-2", status: "rejected" }));
    const { service, repo } = makeService(
      makeRepo({ findSubscriptionById: jest.fn().mockResolvedValue(PRO_VIGENTE) }),
      provider,
    );

    await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "payment",
      dataId: "mp-pago-2",
    });

    const [, estado] = (repo.updateSubscriptionStatus as jest.Mock).mock.calls[0];
    expect(estado).toBe("past_due");
    expect(repo.upsertPayment).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
      TX,
    );
    expect(repo.applyPendingPlan).not.toHaveBeenCalled();
  });

  it("pago rechazado del checkout no descarta el plan pendiente: MP reintenta", async () => {
    // Si se descartara, el cobro que entra en el reintento llegaría como
    // "reemplazado" y se cancelaría un plan que el cliente sí terminó pagando.
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-2", evento({ externalPaymentId: "mp-pago-2", status: "rejected" }));
    const { service, repo } = makeService(makeRepo(), provider);

    await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "payment",
      dataId: "mp-pago-2",
    });

    expect(repo.clearPendingPlan).not.toHaveBeenCalled();
    // Y no se marca morosa: sigue pagando su plan anterior sin problema.
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("una notificación de otro comercio se ignora sin romper", async () => {
    // Devolver error haría que la pasarela reintente para siempre algo que
    // nunca vamos a poder procesar.
    const provider = new FakePaymentProvider();
    provider.pretendEvent("ajeno", evento({ externalReference: "no-es-nuestro" }));
    const repo = makeRepo({
      findSubscriptionById: jest.fn().mockResolvedValue(null),
      findSubscriptionByExternalRef: jest.fn().mockResolvedValue(null),
    });
    const { service } = makeService(repo, provider);

    const res = await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "payment",
      dataId: "ajeno",
    });

    expect(res.processed).toBe(false);
  });

  it("si no viene external_reference, resuelve por la suscripción externa", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-3", evento({ externalPaymentId: "mp-pago-3", externalReference: null }));
    const repo = makeRepo({
      findSubscriptionById: jest.fn().mockResolvedValue(null),
      findSubscriptionByExternalRef: jest.fn().mockResolvedValue(SUBSCRIPTION),
    });
    const { service } = makeService(repo, provider);

    const res = await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "payment",
      dataId: "mp-pago-3",
    });

    expect(res.processed).toBe(true);
    expect(repo.findSubscriptionByExternalRef).toHaveBeenCalledWith("mp-sub-1");
  });

  it("cancelar el débito vigente cancela la suscripción, sin registrar un pago", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-sub-1", evento({ externalPaymentId: null, status: "cancelled" }));
    const { service, repo } = makeService(
      makeRepo({ findSubscriptionById: jest.fn().mockResolvedValue(PRO_VIGENTE) }),
      provider,
    );

    await service.handleWebhook({
      signature: "ts=1,v1=ok",
      requestId: "r1",
      topic: "preapproval",
      dataId: "mp-sub-1",
    });

    expect(repo.upsertPayment).not.toHaveBeenCalled();
    const [, estado] = (repo.updateSubscriptionStatus as jest.Mock).mock.calls[0];
    expect(estado).toBe("canceled");
  });
});

describe("cancelExternal", () => {
  it("cancela en la pasarela si hay suscripción externa", async () => {
    const repo = makeRepo({
      findSubscription: jest
        .fn()
        .mockResolvedValue({ ...SUBSCRIPTION, externalRef: "mp-sub-1" }),
    });
    const { service, provider } = makeService(repo);

    await service.cancelExternal(TENANT_ID);

    expect(provider.cancelled).toEqual(["mp-sub-1"]);
  });

  it("cancela también el checkout abierto: podría autorizarse después de la baja", async () => {
    const repo = makeRepo({
      findSubscription: jest
        .fn()
        .mockResolvedValue({ ...PRO_VIGENTE, pendingExternalRef: "mp-sub-2" }),
    });
    const { service, provider } = makeService(repo);

    await service.cancelExternal(TENANT_ID);

    expect(provider.cancelled).toEqual(["mp-sub-1", "mp-sub-2"]);
  });

  it("sin suscripción externa no llama a la pasarela", async () => {
    const { service, provider } = makeService();

    await service.cancelExternal(TENANT_ID);

    expect(provider.cancelled).toEqual([]);
  });
});

/**
 * Reentrega del mismo webhook (tarea B1 de AUDITORIA.md).
 *
 * La fila duplicada la tapa la restricción única de la base, pero el aviso a la
 * inmobiliaria no: sin esto, Mercado Pago reintentando el webhook le mandaba
 * dos correos de "pago confirmado" por un solo cobro. Estos tests fijan que el
 * aviso va una vez, y que un pago que cambia de estado (pending → approved) sí
 * avisa, porque ahí la plata sí entró.
 */
describe("handleWebhook con entregas repetidas", () => {
  function espias() {
    return {
      notifier: {
        leadRecibido: jest.fn(),
        inmobiliariaCreada: jest.fn(),
        pagoConfirmado: jest.fn().mockResolvedValue(undefined),
        pagoFallido: jest.fn().mockResolvedValue(undefined),
        tasacionRecibida: jest.fn(),
      } as unknown as Notifier,
      auditor: { record: jest.fn().mockResolvedValue(undefined) } as unknown as Auditor,
    };
  }

  const firma = {
    signature: "ts=1,v1=ok",
    requestId: "r1",
    topic: "payment",
    dataId: "mp-pago-1",
  };

  it("la primera entrega notifica y audita", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-1", evento());
    const repo = makeRepo();
    const spies = espias();
    const service = new BillingService(
      repo,
      async () => provider,
      "https://app.test/panel/suscripcion",
      spies.notifier,
      spies.auditor,
    );

    await service.handleWebhook(firma);

    expect(spies.notifier.pagoConfirmado).toHaveBeenCalledTimes(1);
    expect(spies.auditor.record).toHaveBeenCalledTimes(1);
  });

  it("una reentrega del MISMO estado no vuelve a notificar ni auditar", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-1", evento());
    const repo = makeRepo({
      // La base ya tiene el pago anotado y en el mismo estado: la restricción
      // única impidió la fila duplicada y esto corta el aviso.
      upsertPayment: jest.fn().mockResolvedValue({ created: false, changed: false }),
    });
    const spies = espias();
    const service = new BillingService(
      repo,
      async () => provider,
      "https://app.test/panel/suscripcion",
      spies.notifier,
      spies.auditor,
    );

    const res = await service.handleWebhook(firma);

    // El webhook se procesa igual y responde 200: si devolviera error, la
    // pasarela reintentaría para siempre.
    expect(res.processed).toBe(true);
    expect(spies.notifier.pagoConfirmado).not.toHaveBeenCalled();
    expect(spies.auditor.record).not.toHaveBeenCalled();
  });

  it("un pago que pasa de pending a approved SÍ avisa: la plata entró recién ahí", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-1", evento());
    const repo = makeRepo({
      upsertPayment: jest.fn().mockResolvedValue({ created: false, changed: true }),
    });
    const spies = espias();
    const service = new BillingService(
      repo,
      async () => provider,
      "https://app.test/panel/suscripcion",
      spies.notifier,
      spies.auditor,
    );

    await service.handleWebhook(firma);

    expect(spies.notifier.pagoConfirmado).toHaveBeenCalledTimes(1);
    expect(spies.auditor.record).toHaveBeenCalledTimes(1);
  });

  it("una reentrega de un pago rechazado tampoco repite el aviso de fallo", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-9", evento({ externalPaymentId: "mp-pago-9", status: "rejected" }));
    const repo = makeRepo({
      upsertPayment: jest.fn().mockResolvedValue({ created: false, changed: false }),
    });
    const spies = espias();
    const service = new BillingService(
      repo,
      async () => provider,
      "https://app.test/panel/suscripcion",
      spies.notifier,
      spies.auditor,
    );

    await service.handleWebhook({ ...firma, dataId: "mp-pago-9" });

    expect(spies.notifier.pagoFallido).not.toHaveBeenCalled();
    expect(spies.auditor.record).not.toHaveBeenCalled();
  });

  it("un débito autorizado (sin pago) no avisa ni concede el plan", async () => {
    // Antes cada aviso de preapproval `authorized` mandaba "pago confirmado",
    // auditaba un cobro inexistente y aplicaba el plan pendiente (H1, N1).
    // Autorizar el débito no es pagar: el plan espera al primer pago.
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-sin-id", evento({ externalPaymentId: null }));
    const repo = makeRepo();
    const spies = espias();
    const service = new BillingService(
      repo,
      async () => provider,
      "https://app.test/panel/suscripcion",
      spies.notifier,
      spies.auditor,
    );

    await service.handleWebhook({ ...firma, dataId: "mp-pago-sin-id" });

    expect(repo.upsertPayment).not.toHaveBeenCalled();
    expect(repo.applyPendingPlan).not.toHaveBeenCalled();
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(spies.notifier.pagoConfirmado).not.toHaveBeenCalled();
    expect(spies.auditor.record).not.toHaveBeenCalled();
  });
});

/**
 * Un solo débito vivo por inmobiliaria (C2 de AUDITORIA.md).
 *
 * Antes, abrir un checkout pisaba la referencia del débito vigente sin
 * cancelarlo: pasar de Pro a Enterprise dejaba dos débitos mensuales en la
 * tarjeta, y "Cancelar" cortaba el equivocado.
 */
describe("cambio de plan y débitos", () => {
  const firma = { signature: "ts=1,v1=ok", requestId: "r1", topic: "payment" };

  it("el primer pago del plan nuevo lo concede y cancela el débito anterior", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-5", evento({ externalPaymentId: "mp-pago-5", externalSubscriptionId: "mp-sub-2" }));
    const repo = makeRepo({
      findSubscriptionById: jest
        .fn()
        .mockResolvedValue({ ...PRO_VIGENTE, pendingExternalRef: "mp-sub-2" }),
    });
    const { service } = makeService(repo, provider);

    await service.handleWebhook({ ...firma, dataId: "mp-pago-5" });

    expect(repo.applyPendingPlan).toHaveBeenCalledWith(SUB_ID, TX);
    expect(provider.cancelled).toEqual(["mp-sub-1"]);
  });

  it("un pago del débito vigente renueva el período pero no concede el pendiente", async () => {
    // Pro sigue debitando mientras Enterprise no cobró: ese cobro de Pro no
    // puede regalar Enterprise.
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-6", evento({ externalPaymentId: "mp-pago-6", externalSubscriptionId: "mp-sub-1" }));
    const repo = makeRepo({
      findSubscriptionById: jest
        .fn()
        .mockResolvedValue({ ...PRO_VIGENTE, pendingExternalRef: "mp-sub-2" }),
    });
    const { service } = makeService(repo, provider);

    await service.handleWebhook({ ...firma, dataId: "mp-pago-6" });

    expect(repo.applyPendingPlan).not.toHaveBeenCalled();
    const [, estado, periodEnd] = (repo.updateSubscriptionStatus as jest.Mock).mock.calls[0];
    expect(estado).toBe("active");
    expect(periodEnd).toBeInstanceOf(Date);
    expect(provider.cancelled).toEqual([]);
  });

  it("un cobro de un débito reemplazado se registra, no toca la suscripción y corta ese débito", async () => {
    // La cancelación del débito viejo falló y volvió a debitar: la plata se
    // anota (entró), pero no renueva nada y el débito se vuelve a cancelar.
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-7", evento({ externalPaymentId: "mp-pago-7", externalSubscriptionId: "mp-sub-viejo" }));
    const repo = makeRepo({ findSubscriptionById: jest.fn().mockResolvedValue(PRO_VIGENTE) });
    const { service } = makeService(repo, provider);

    await service.handleWebhook({ ...firma, dataId: "mp-pago-7" });

    expect(repo.upsertPayment).toHaveBeenCalled();
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(repo.applyPendingPlan).not.toHaveBeenCalled();
    expect(provider.cancelled).toEqual(["mp-sub-viejo"]);
  });

  it("si cancelar el débito anterior falla, el webhook igual se procesa", async () => {
    // Tirar acá haría que la pasarela reintente un evento que ya quedó
    // escrito. El próximo cobro del débito viejo llega como reemplazado y se
    // reintenta la cancelación.
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-5", evento({ externalPaymentId: "mp-pago-5", externalSubscriptionId: "mp-sub-2" }));
    jest.spyOn(provider, "cancelSubscription").mockRejectedValue(new Error("MP caído"));
    const repo = makeRepo({
      findSubscriptionById: jest
        .fn()
        .mockResolvedValue({ ...PRO_VIGENTE, pendingExternalRef: "mp-sub-2" }),
    });
    const { service } = makeService(repo, provider);

    await expect(service.handleWebhook({ ...firma, dataId: "mp-pago-5" })).resolves.toEqual({
      processed: true,
    });
    expect(repo.applyPendingPlan).toHaveBeenCalled();
  });

  it("un débito recién creado (pending) no marca morosa a quien está al día", async () => {
    // Abrir el checkout de Enterprise y abandonarlo no puede degradar a una
    // inmobiliaria que paga Pro sin problemas (H3).
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-sub-2", evento({ externalPaymentId: null, externalSubscriptionId: "mp-sub-2", status: "pending" }));
    const repo = makeRepo({
      findSubscriptionById: jest
        .fn()
        .mockResolvedValue({ ...PRO_VIGENTE, pendingExternalRef: "mp-sub-2" }),
    });
    const { service } = makeService(repo, provider);

    await service.handleWebhook({ ...firma, topic: "preapproval", dataId: "mp-sub-2" });

    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
    expect(repo.clearPendingPlan).not.toHaveBeenCalled();
  });

  it("cancelar el checkout pendiente lo descarta sin tocar el plan vigente", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-sub-2", evento({ externalPaymentId: null, externalSubscriptionId: "mp-sub-2", status: "cancelled" }));
    const repo = makeRepo({
      findSubscriptionById: jest
        .fn()
        .mockResolvedValue({ ...PRO_VIGENTE, pendingExternalRef: "mp-sub-2" }),
    });
    const { service } = makeService(repo, provider);

    await service.handleWebhook({ ...firma, topic: "preapproval", dataId: "mp-sub-2" });

    expect(repo.clearPendingPlan).toHaveBeenCalledWith(SUB_ID, TX);
    expect(repo.updateSubscriptionStatus).not.toHaveBeenCalled();
  });

  it("abrir un checkout nuevo cancela el anterior que quedó sin pagar", async () => {
    const repo = makeRepo({
      findSubscription: jest.fn().mockResolvedValue({ ...CON_CHECKOUT, pendingExternalRef: "mp-sub-abandonado" }),
    });
    const { service, provider } = makeService(repo);

    await service.createCheckout(TENANT_ID, PLAN_PRO);

    expect(provider.cancelled).toEqual(["mp-sub-abandonado"]);
    // El nuevo queda como pendiente; el vigente no se toca.
    expect(repo.setPendingPlan).toHaveBeenCalledWith(SUB_ID, PLAN_PRO, expect.stringContaining("fake-sub-"));
  });

  it("el mismo plan se puede volver a contratar si el débito se cayó", async () => {
    // Antes: "Ya estás suscripto a ese plan", y no había forma de reautorizar
    // el débito después de un rechazo (H2).
    const repo = makeRepo({
      findSubscription: jest.fn().mockResolvedValue({ ...PRO_VIGENTE, status: "past_due" }),
    });
    const { service, provider } = makeService(repo);

    await service.createCheckout(TENANT_ID, PLAN_PRO);

    expect(provider.checkouts).toHaveLength(1);
  });

  it("el mismo plan al día sigue sin poder contratarse dos veces", async () => {
    const repo = makeRepo({ findSubscription: jest.fn().mockResolvedValue(PRO_VIGENTE) });
    const { service, provider } = makeService(repo);

    await expect(service.createCheckout(TENANT_ID, PLAN_PRO)).rejects.toBeInstanceOf(BadRequestError);
    expect(provider.checkouts).toHaveLength(0);
  });
});
