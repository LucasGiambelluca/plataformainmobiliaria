import bcrypt from "bcryptjs";
import {
  TenantsService,
  DEFAULT_PLAN_SLUG,
  type TenantsRepository,
} from "@/modules/tenants/tenants.service";
import { ConflictError, NotFoundError } from "@/shared/errors";

const PLAN = { id: "plan-basico", isActive: true };
const TENANT = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "Inmo Uno",
  slug: "inmo-uno",
  isActive: true,
};
const ADMIN = {
  id: "11111111-1111-1111-1111-111111111111",
  tenantId: TENANT.id,
  email: "dueno@inmo.com",
  role: "tenant_admin" as const,
  name: "Dueño",
};

function makeRepo(overrides: Partial<TenantsRepository> = {}) {
  const repo: TenantsRepository = {
    findTenantBySlug: jest.fn().mockResolvedValue(null),
    findUserByEmailGlobal: jest.fn().mockResolvedValue(null),
    findPlanBySlug: jest.fn().mockResolvedValue(PLAN),
    findPlanById: jest.fn().mockResolvedValue(PLAN),
    createTenantWithAdmin: jest.fn().mockResolvedValue({ tenant: TENANT, user: ADMIN }),
    listTenants: jest.fn().mockResolvedValue({ items: [TENANT], total: 1 }),
    findTenantById: jest.fn().mockResolvedValue(TENANT),
    findActiveTenantAdmin: jest.fn().mockResolvedValue(ADMIN),
    updateTenant: jest.fn().mockResolvedValue({ ...TENANT, name: "Nueva" }),
    updateSubscriptionPlan: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
}

const PROVISION_INPUT = {
  tenantName: "Inmo Uno",
  slug: "inmo-uno",
  adminEmail: "dueno@inmo.com",
  adminPassword: "secreto-123",
  adminName: "Dueño",
};

describe("TenantsService", () => {
  describe("provision (alta de inmobiliaria + admin)", () => {
    it("crea tenant + admin con password hasheado y plan por defecto", async () => {
      const repo = makeRepo();
      const service = new TenantsService(repo);

      const result = await service.provision(PROVISION_INPUT);

      expect(result).toEqual({ tenant: TENANT, user: ADMIN });
      expect(repo.findPlanBySlug).toHaveBeenCalledWith(DEFAULT_PLAN_SLUG);
      const arg = (repo.createTenantWithAdmin as jest.Mock).mock.calls[0][0];
      expect(arg).toMatchObject({
        tenantName: "Inmo Uno",
        slug: "inmo-uno",
        planId: PLAN.id,
        adminEmail: "dueno@inmo.com",
        adminName: "Dueño",
      });
      // Nunca guarda el password en claro.
      expect(arg.adminPasswordHash).not.toBe("secreto-123");
      expect(bcrypt.compareSync("secreto-123", arg.adminPasswordHash)).toBe(true);
    });

    it("slug ya usado → ConflictError", async () => {
      const repo = makeRepo({ findTenantBySlug: jest.fn().mockResolvedValue(TENANT) });
      const service = new TenantsService(repo);
      await expect(service.provision(PROVISION_INPUT)).rejects.toBeInstanceOf(ConflictError);
      expect(repo.createTenantWithAdmin).not.toHaveBeenCalled();
    });

    it("email ya registrado (global) → ConflictError", async () => {
      const repo = makeRepo({
        findUserByEmailGlobal: jest.fn().mockResolvedValue({ id: "otro" }),
      });
      const service = new TenantsService(repo);
      await expect(service.provision(PROVISION_INPUT)).rejects.toBeInstanceOf(ConflictError);
    });

    it("plan por defecto inexistente → error 500 (config rota)", async () => {
      const repo = makeRepo({ findPlanBySlug: jest.fn().mockResolvedValue(null) });
      const service = new TenantsService(repo);
      await expect(service.provision(PROVISION_INPUT)).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe("update", () => {
    it("actualiza campos básicos del tenant", async () => {
      const repo = makeRepo();
      const service = new TenantsService(repo);
      await service.update(TENANT.id, { name: "Nueva" });
      expect(repo.updateTenant).toHaveBeenCalledWith(TENANT.id, { name: "Nueva" });
    });

    it("tenant inexistente → NotFoundError", async () => {
      const repo = makeRepo({ findTenantById: jest.fn().mockResolvedValue(null) });
      const service = new TenantsService(repo);
      await expect(service.update("nope", { name: "x" })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("asignar plan: valida que el plan exista y esté activo", async () => {
      const repo = makeRepo({ findPlanById: jest.fn().mockResolvedValue(null) });
      const service = new TenantsService(repo);
      await expect(
        service.update(TENANT.id, { planId: "plan-fantasma" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.updateSubscriptionPlan).not.toHaveBeenCalled();
    });

    it("asignar plan válido: actualiza la suscripción además del tenant", async () => {
      const repo = makeRepo();
      const service = new TenantsService(repo);
      await service.update(TENANT.id, { name: "Nueva", planId: PLAN.id });
      expect(repo.updateSubscriptionPlan).toHaveBeenCalledWith(TENANT.id, PLAN.id);
      // planId no se pasa al update del tenant (no es columna de tenants).
      expect(repo.updateTenant).toHaveBeenCalledWith(TENANT.id, { name: "Nueva" });
    });

    it("suspender: isActive false llega al repositorio", async () => {
      const repo = makeRepo();
      const service = new TenantsService(repo);
      await service.update(TENANT.id, { isActive: false });
      expect(repo.updateTenant).toHaveBeenCalledWith(TENANT.id, { isActive: false });
    });
  });

  describe("getById", () => {
    it("inexistente → NotFoundError", async () => {
      const repo = makeRepo({ findTenantById: jest.fn().mockResolvedValue(null) });
      const service = new TenantsService(repo);
      await expect(service.getById("nope")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("list", () => {
    it("normaliza paginación y delega filtros", async () => {
      const repo = makeRepo();
      const service = new TenantsService(repo);
      const result = await service.list({ search: "inmo", isActive: true, page: 0, pageSize: 500 });
      expect(result).toEqual({ items: [TENANT], total: 1, page: 1, pageSize: 100 });
      // page mínimo 1, pageSize máximo 100.
      expect(repo.listTenants).toHaveBeenCalledWith({
        search: "inmo",
        isActive: true,
        page: 1,
        pageSize: 100,
      });
    });
  });
});
