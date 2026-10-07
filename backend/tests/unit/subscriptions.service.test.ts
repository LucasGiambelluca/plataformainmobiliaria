import {
  SubscriptionsService,
  type SubscriptionsRepository,
} from "@/modules/subscriptions/subscriptions.service";
import type { LimitService } from "@/modules/subscriptions/limit.service";
import { BadRequestError, NotFoundError } from "@/shared/errors";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";

const USAGE = {
  users: { used: 1, limit: 2 },
  properties: { used: 3, limit: 10 },
  storageMb: { used: 100, limit: 500 },
};

const PAID_SUB = {
  id: "sub-1",
  status: "active" as const,
  currentPeriodStart: new Date("2026-07-01"),
  currentPeriodEnd: new Date("2026-08-01"),
  cancelAtPeriodEnd: false,
  plan: {
    id: "plan-pro",
    name: "Pro",
    slug: "pro",
    priceAmount: "29999",
    priceCurrency: "ARS",
    billingInterval: "monthly" as const,
    maxProperties: 100,
    maxUsers: 10,
    maxStorageMb: 5000,
  },
};

const FREE_SUB = {
  ...PAID_SUB,
  id: "sub-2",
  currentPeriodEnd: null,
  plan: { ...PAID_SUB.plan, id: "plan-basico", name: "Básico", slug: "basico", priceAmount: "0" },
};

function makeRepo(overrides: Partial<SubscriptionsRepository> = {}) {
  const repo: SubscriptionsRepository = {
    findCurrentByTenant: jest.fn().mockResolvedValue(PAID_SUB),
    setCancelAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
}

const limitService = {
  getUsage: jest.fn().mockResolvedValue(USAGE),
} as unknown as LimitService;

describe("SubscriptionsService", () => {
  describe("getStatus", () => {
    // Reloj fijo: "al día" depende de la fecha, y PAID_SUB vence el 2026-08-01.
    const dentroDelPeriodo = () => new Date("2026-07-15");

    it("devuelve suscripción + plan + uso vs límites", async () => {
      const service = new SubscriptionsService(makeRepo(), limitService, dentroDelPeriodo);
      const result = await service.getStatus(TENANT_ID);
      expect(result).toEqual({ subscription: { ...PAID_SUB, alDia: true }, usage: USAGE });
    });

    it("vencida y pasada la gracia → alDia false", async () => {
      // Es lo que el panel usa para explicar por qué los cupos son los del
      // plan gratuito aunque el plan contratado diga Pro.
      const service = new SubscriptionsService(
        makeRepo({ findCurrentByTenant: jest.fn().mockResolvedValue({ ...PAID_SUB, status: "past_due" }) }),
        limitService,
        () => new Date("2026-08-11"),
      );
      const result = await service.getStatus(TENANT_ID);
      expect(result.subscription.alDia).toBe(false);
    });

    it("sin suscripción → NotFoundError", async () => {
      const service = new SubscriptionsService(
        makeRepo({ findCurrentByTenant: jest.fn().mockResolvedValue(null) }),
        limitService,
      );
      await expect(service.getStatus(TENANT_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("cancel", () => {
    it("plan pago: marca cancelAtPeriodEnd", async () => {
      const repo = makeRepo();
      const service = new SubscriptionsService(repo, limitService);
      await service.cancel(TENANT_ID);
      expect(repo.setCancelAtPeriodEnd).toHaveBeenCalledWith(PAID_SUB.id, true);
    });

    it("idempotente: ya cancelada no vuelve a escribir", async () => {
      const repo = makeRepo({
        findCurrentByTenant: jest
          .fn()
          .mockResolvedValue({ ...PAID_SUB, cancelAtPeriodEnd: true }),
      });
      const service = new SubscriptionsService(repo, limitService);
      await service.cancel(TENANT_ID);
      expect(repo.setCancelAtPeriodEnd).not.toHaveBeenCalled();
    });

    it("plan gratuito → BadRequestError (no hay nada que cancelar)", async () => {
      const repo = makeRepo({
        findCurrentByTenant: jest.fn().mockResolvedValue(FREE_SUB),
      });
      const service = new SubscriptionsService(repo, limitService);
      await expect(service.cancel(TENANT_ID)).rejects.toBeInstanceOf(BadRequestError);
    });

    it("sin suscripción → NotFoundError", async () => {
      const repo = makeRepo({ findCurrentByTenant: jest.fn().mockResolvedValue(null) });
      const service = new SubscriptionsService(repo, limitService);
      await expect(service.cancel(TENANT_ID)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
