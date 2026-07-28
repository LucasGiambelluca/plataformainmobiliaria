import {
  BillingService,
  type BillingRepository,
  type SubscriptionForCheckout,
} from "@/modules/billing/billing.service";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import { FakePaymentProvider, type PaymentEvent } from "@/shared/services/payments";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const SUB_ID = "44444444-4444-4444-4444-444444444444";
const PLAN_BASICO = "55555555-5555-5555-5555-555555555555";
const PLAN_PRO = "66666666-6666-6666-6666-666666666666";

const SUBSCRIPTION: SubscriptionForCheckout = {
  id: SUB_ID,
  tenantId: TENANT_ID,
  externalRef: null,
  plan: {
    id: PLAN_BASICO,
    name: "Básico",
    priceAmount: "0",
    priceCurrency: "ARS",
  },
};

const PLAN_PAGO = {
  id: PLAN_PRO,
  name: "Pro",
  priceAmount: "29999",
  priceCurrency: "ARS",
  isActive: true,
};

function makeRepo(overrides: Partial<BillingRepository> = {}) {
  const repo: BillingRepository = {
    findSubscription: jest.fn().mockResolvedValue(SUBSCRIPTION),
    findPlan: jest.fn().mockResolvedValue(PLAN_PAGO),
    findBillingEmail: jest.fn().mockResolvedValue("admin@inmo.com"),
    setPendingPlan: jest.fn().mockResolvedValue(undefined),
    applyPendingPlan: jest.fn().mockResolvedValue(undefined),
    clearPendingPlan: jest.fn().mockResolvedValue(undefined),
    findSubscriptionById: jest.fn().mockResolvedValue(SUBSCRIPTION),
    findSubscriptionByExternalRef: jest.fn().mockResolvedValue(null),
    updateSubscriptionStatus: jest.fn().mockResolvedValue(undefined),
    upsertPayment: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
}

function makeService(
  repo: BillingRepository = makeRepo(),
  provider = new FakePaymentProvider(),
) {
  return {
    service: new BillingService(repo, provider, "https://app.test/panel/suscripcion"),
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
    );

    const [id, estado, periodEnd] = (repo.updateSubscriptionStatus as jest.Mock).mock
      .calls[0];
    expect(id).toBe(SUB_ID);
    expect(estado).toBe("active");
    expect(periodEnd).toBeInstanceOf(Date);

    // Y recién acá se concede el plan que se había dejado pendiente.
    expect(repo.applyPendingPlan).toHaveBeenCalledWith(SUB_ID);
  });

  it("pago rechazado deja la suscripción en past_due", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-pago-2", evento({ externalPaymentId: "mp-pago-2", status: "rejected" }));
    const { service, repo } = makeService(makeRepo(), provider);

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
    );
    // El plan pretendido se descarta: no puede quedar esperando a colarse con
    // un pago posterior por otra cosa.
    expect(repo.applyPendingPlan).not.toHaveBeenCalled();
    expect(repo.clearPendingPlan).toHaveBeenCalledWith(SUB_ID);
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

  it("un evento de suscripción sin pago no registra un pago", async () => {
    const provider = new FakePaymentProvider();
    provider.pretendEvent("mp-sub-1", evento({ externalPaymentId: null, status: "cancelled" }));
    const { service, repo } = makeService(makeRepo(), provider);

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

  it("sin suscripción externa no llama a la pasarela", async () => {
    const { service, provider } = makeService();

    await service.cancelExternal(TENANT_ID);

    expect(provider.cancelled).toEqual([]);
  });
});
