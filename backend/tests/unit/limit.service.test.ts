import { LimitService, type UsageRepository } from "@/modules/subscriptions/limit.service";
import { LimitExceededError } from "@/shared/errors";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const LIMITS = { maxProperties: 10, maxUsers: 2, maxStorageMb: 500, maxDomains: 1 };

function makeRepo(overrides: Partial<UsageRepository> = {}) {
  const repo: UsageRepository = {
    getPlanLimits: jest.fn().mockResolvedValue(LIMITS),
    countActiveUsers: jest.fn().mockResolvedValue(1),
    countProperties: jest.fn().mockResolvedValue(3),
    sumStorageBytes: jest.fn().mockResolvedValue(BigInt(100 * 1024 * 1024)),
    countDomains: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
  return repo;
}

describe("LimitService", () => {
  describe("getUsage", () => {
    it("devuelve uso vs límite por recurso", async () => {
      const service = new LimitService(makeRepo());
      const usage = await service.getUsage(TENANT_ID);
      expect(usage).toEqual({
        users: { used: 1, limit: 2 },
        properties: { used: 3, limit: 10 },
        storageMb: { used: 100, limit: 500 },
        domains: { used: 0, limit: 1 },
      });
    });

    it("sin suscripción → error 500 (estado inconsistente)", async () => {
      const service = new LimitService(
        makeRepo({ getPlanLimits: jest.fn().mockResolvedValue(null) }),
      );
      await expect(service.getUsage(TENANT_ID)).rejects.toMatchObject({ statusCode: 500 });
    });
  });

  describe("assertCanAddUser", () => {
    it("pasa si hay cupo", async () => {
      const service = new LimitService(makeRepo());
      await expect(service.assertCanAddUser(TENANT_ID)).resolves.toBeUndefined();
    });

    it("límite alcanzado → LimitExceededError", async () => {
      const service = new LimitService(
        makeRepo({ countActiveUsers: jest.fn().mockResolvedValue(2) }),
      );
      await expect(service.assertCanAddUser(TENANT_ID)).rejects.toBeInstanceOf(
        LimitExceededError,
      );
    });
  });

  describe("assertCanAddProperty", () => {
    it("límite alcanzado → LimitExceededError", async () => {
      const service = new LimitService(
        makeRepo({ countProperties: jest.fn().mockResolvedValue(10) }),
      );
      await expect(service.assertCanAddProperty(TENANT_ID)).rejects.toBeInstanceOf(
        LimitExceededError,
      );
    });
  });

  describe("assertCanAddDomain", () => {
    it("pasa si el plan tiene cupo", async () => {
      const service = new LimitService(makeRepo());
      await expect(service.assertCanAddDomain(TENANT_ID)).resolves.toBeUndefined();
    });

    it("límite alcanzado → LimitExceededError", async () => {
      const service = new LimitService(
        makeRepo({ countDomains: jest.fn().mockResolvedValue(1) }),
      );
      await expect(service.assertCanAddDomain(TENANT_ID)).rejects.toBeInstanceOf(
        LimitExceededError,
      );
    });

    it("plan sin dominio propio (maxDomains 0) → rechaza el primero", async () => {
      const service = new LimitService(
        makeRepo({
          getPlanLimits: jest.fn().mockResolvedValue({ ...LIMITS, maxDomains: 0 }),
        }),
      );
      await expect(service.assertCanAddDomain(TENANT_ID)).rejects.toBeInstanceOf(
        LimitExceededError,
      );
    });
  });

  describe("assertCanAddStorage", () => {
    it("pasa si el archivo entra en el cupo", async () => {
      const service = new LimitService(makeRepo());
      // 100 MB usados + 50 MB nuevos < 500 MB.
      await expect(
        service.assertCanAddStorage(TENANT_ID, 50 * 1024 * 1024),
      ).resolves.toBeUndefined();
    });

    it("excede el cupo → LimitExceededError", async () => {
      const service = new LimitService(makeRepo());
      // 100 MB usados + 401 MB > 500 MB.
      await expect(
        service.assertCanAddStorage(TENANT_ID, 401 * 1024 * 1024),
      ).rejects.toBeInstanceOf(LimitExceededError);
    });
  });
});
