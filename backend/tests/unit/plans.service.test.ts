import { PlansService, type PlansRepository } from "@/modules/subscriptions/plans.service";
import { ConflictError, NotFoundError } from "@/shared/errors";

const PLAN = {
  id: "plan-1",
  name: "Pro",
  slug: "pro",
  priceAmount: "29999",
  priceCurrency: "ARS",
  billingInterval: "monthly" as const,
  maxProperties: 100,
  maxUsers: 10,
  maxStorageMb: 5000,
  isActive: true,
};

function makeRepo(overrides: Partial<PlansRepository> = {}) {
  const repo: PlansRepository = {
    listPlans: jest.fn().mockResolvedValue([PLAN]),
    findBySlug: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(PLAN),
    createPlan: jest.fn().mockResolvedValue(PLAN),
    updatePlan: jest.fn().mockResolvedValue({ ...PLAN, name: "Pro+" }),
    ...overrides,
  };
  return repo;
}

const CREATE_INPUT = {
  name: "Pro",
  slug: "pro",
  priceAmount: "29999",
  maxProperties: 100,
  maxUsers: 10,
  maxStorageMb: 5000,
};

describe("PlansService", () => {
  it("list delega al repositorio", async () => {
    const repo = makeRepo();
    const service = new PlansService(repo);
    expect(await service.list()).toEqual([PLAN]);
  });

  describe("create", () => {
    it("crea un plan nuevo", async () => {
      const repo = makeRepo();
      const service = new PlansService(repo);
      await service.create(CREATE_INPUT);
      expect(repo.createPlan).toHaveBeenCalledWith(CREATE_INPUT);
    });

    it("slug duplicado → ConflictError", async () => {
      const repo = makeRepo({ findBySlug: jest.fn().mockResolvedValue(PLAN) });
      const service = new PlansService(repo);
      await expect(service.create(CREATE_INPUT)).rejects.toBeInstanceOf(ConflictError);
      expect(repo.createPlan).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("actualiza un plan existente", async () => {
      const repo = makeRepo();
      const service = new PlansService(repo);
      await service.update("plan-1", { name: "Pro+" });
      expect(repo.updatePlan).toHaveBeenCalledWith("plan-1", { name: "Pro+" });
    });

    it("plan inexistente → NotFoundError", async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new PlansService(repo);
      await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
