import bcrypt from "bcryptjs";
import { UsersService, type UsersRepository } from "@/modules/users/users.service";
import {
  BadRequestError,
  ConflictError,
  LimitExceededError,
  NotFoundError,
} from "@/shared/errors";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const AGENT_ID = "22222222-2222-2222-2222-222222222222";

const AGENT = {
  id: AGENT_ID,
  tenantId: TENANT_ID,
  email: "agente@inmo.com",
  role: "agent" as const,
  name: "Agente",
  phone: null,
  isActive: true,
};

function makeRepo(overrides: Partial<UsersRepository> = {}) {
  const repo: UsersRepository = {
    listByTenant: jest.fn().mockResolvedValue([AGENT]),
    findById: jest.fn().mockResolvedValue(AGENT),
    findByEmailGlobal: jest.fn().mockResolvedValue(null),
    countActive: jest.fn().mockResolvedValue(1),
    getMaxUsers: jest.fn().mockResolvedValue(10),
    createUser: jest.fn().mockResolvedValue(AGENT),
    updateUser: jest.fn().mockResolvedValue({ ...AGENT, name: "Nuevo" }),
    ...overrides,
  };
  return repo;
}

const CREATE_INPUT = {
  email: "nuevo@inmo.com",
  password: "secreto-123",
  role: "agent" as const,
  name: "Nuevo Agente",
};

describe("UsersService", () => {
  describe("create", () => {
    it("crea usuario con password hasheado dentro del tenant", async () => {
      const repo = makeRepo();
      const service = new UsersService(repo);

      await service.create(TENANT_ID, CREATE_INPUT);

      const [tenantId, data] = (repo.createUser as jest.Mock).mock.calls[0];
      expect(tenantId).toBe(TENANT_ID);
      expect(data).toMatchObject({ email: "nuevo@inmo.com", role: "agent" });
      expect(data.passwordHash).toBeDefined();
      expect(data).not.toHaveProperty("password");
      expect(bcrypt.compareSync("secreto-123", data.passwordHash)).toBe(true);
    });

    it("email ya registrado (global) → ConflictError", async () => {
      const repo = makeRepo({
        findByEmailGlobal: jest.fn().mockResolvedValue({ id: "otro" }),
      });
      const service = new UsersService(repo);
      await expect(service.create(TENANT_ID, CREATE_INPUT)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(repo.createUser).not.toHaveBeenCalled();
    });

    it("límite maxUsers del plan alcanzado → LimitExceededError (402)", async () => {
      const repo = makeRepo({
        countActive: jest.fn().mockResolvedValue(2),
        getMaxUsers: jest.fn().mockResolvedValue(2),
      });
      const service = new UsersService(repo);
      await expect(service.create(TENANT_ID, CREATE_INPUT)).rejects.toBeInstanceOf(
        LimitExceededError,
      );
      expect(repo.createUser).not.toHaveBeenCalled();
    });

    it("tenant sin suscripción → error 500 (estado inconsistente)", async () => {
      const repo = makeRepo({ getMaxUsers: jest.fn().mockResolvedValue(null) });
      const service = new UsersService(repo);
      await expect(service.create(TENANT_ID, CREATE_INPUT)).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe("update", () => {
    it("actualiza campos permitidos", async () => {
      const repo = makeRepo();
      const service = new UsersService(repo);
      await service.update(TENANT_ID, AGENT_ID, ADMIN_ID, { name: "Nuevo" });
      expect(repo.updateUser).toHaveBeenCalledWith(AGENT_ID, TENANT_ID, { name: "Nuevo" });
    });

    it("usuario de otro tenant → NotFoundError", async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const service = new UsersService(repo);
      await expect(
        service.update(TENANT_ID, "ajeno", ADMIN_ID, { name: "x" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("auto-desactivarse → BadRequestError (evita lockout)", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...AGENT, id: ADMIN_ID, role: "tenant_admin" }),
      });
      const service = new UsersService(repo);
      await expect(
        service.update(TENANT_ID, ADMIN_ID, ADMIN_ID, { isActive: false }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("auto-degradarse de rol → BadRequestError (evita lockout)", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue({ ...AGENT, id: ADMIN_ID, role: "tenant_admin" }),
      });
      const service = new UsersService(repo);
      await expect(
        service.update(TENANT_ID, ADMIN_ID, ADMIN_ID, { role: "agent" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("deactivate", () => {
    it("marca isActive false (soft delete)", async () => {
      const repo = makeRepo();
      const service = new UsersService(repo);
      await service.deactivate(TENANT_ID, AGENT_ID, ADMIN_ID);
      expect(repo.updateUser).toHaveBeenCalledWith(AGENT_ID, TENANT_ID, { isActive: false });
    });

    it("auto-desactivarse → BadRequestError", async () => {
      const repo = makeRepo();
      const service = new UsersService(repo);
      await expect(
        service.deactivate(TENANT_ID, ADMIN_ID, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("list", () => {
    it("delega al repositorio con el tenantId", async () => {
      const repo = makeRepo();
      const service = new UsersService(repo);
      const result = await service.list(TENANT_ID);
      expect(repo.listByTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual([AGENT]);
    });
  });
});
