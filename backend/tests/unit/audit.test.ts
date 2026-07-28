import express from "express";
import request from "supertest";
import { createAuditRouter } from "@/modules/audit/audit.router";
import {
  AUDIT_ACTIONS,
  AuditService,
  type AuditRepository,
} from "@/modules/audit/audit.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";

const RECORD = {
  id: "a-1",
  tenantId: TENANT_ID,
  tenantName: "Inmo Uno",
  userId: null,
  userEmail: null,
  action: "tenant.suspend",
  entityType: "tenant",
  entityId: TENANT_ID,
  ipAddress: null,
  metadata: null,
  createdAt: new Date("2026-07-01T12:00:00Z"),
};

function makeRepo(overrides: Partial<AuditRepository> = {}): AuditRepository {
  return {
    record: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ items: [RECORD], total: 1 }),
    ...overrides,
  };
}

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const adminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: TENANT_ID, role: "tenant_admin" });

function makeApp(repo: AuditRepository = makeRepo()) {
  const service = new AuditService(repo);
  const app = express();
  app.use(express.json());
  app.use("/api/admin/audit", createAuditRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo, service };
}

describe("AuditService", () => {
  it("registrar no puede tumbar la operación que se está auditando", async () => {
    const repo = makeRepo({
      record: jest.fn().mockRejectedValue(new Error("base caída")),
    });
    const service = new AuditService(repo);

    await expect(
      service.record({ tenantId: TENANT_ID, userId: null, action: "tenant.suspend" }),
    ).resolves.toBeUndefined();
  });

  it("pagina por defecto de a 25", async () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    const res = await service.list({});

    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 25 }),
    );
    expect(res).toMatchObject({ total: 1, page: 1, pageSize: 25 });
  });

  it("acota el pageSize: pedir 5000 no puede traer la tabla entera", async () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    await service.list({ pageSize: 5000 });

    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });

  it("una página 0 o negativa se normaliza a la primera", async () => {
    const repo = makeRepo();
    const service = new AuditService(repo);

    await service.list({ page: -3 });

    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });
});

describe("audit router", () => {
  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/admin/audit")).status).toBe(401);
  });

  it("403 para el admin de una inmobiliaria: el registro cruza tenants", async () => {
    const { app, repo } = makeApp();
    const res = await request(app)
      .get("/api/admin/audit")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
    expect(repo.list).not.toHaveBeenCalled();
  });

  it("el super admin lista y recibe la paginación", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/audit")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 25 });
    expect(res.body.items).toHaveLength(1);
  });

  it("pasa los filtros ya tipados al servicio", async () => {
    const { app, repo } = makeApp();
    const res = await request(app)
      .get(`/api/admin/audit?action=tenant.suspend&tenantId=${TENANT_ID}&page=2&pageSize=10`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant.suspend",
        tenantId: TENANT_ID,
        page: 2,
        pageSize: 10,
      }),
    );
  });

  it("una acción fuera de la lista cerrada → 422", async () => {
    const { app, repo } = makeApp();
    const res = await request(app)
      .get("/api/admin/audit?action=tenant.explotar")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(422);
    expect(repo.list).not.toHaveBeenCalled();
  });

  it("/actions devuelve la lista cerrada que alimenta el filtro del panel", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/audit/actions")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toEqual([...AUDIT_ACTIONS]);
  });
});
