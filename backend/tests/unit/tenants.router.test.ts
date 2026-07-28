import express from "express";
import request from "supertest";
import { createTenantsRouter } from "@/modules/tenants/tenants.router";
import type { TenantsService } from "@/modules/tenants/tenants.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";
import { NotFoundError } from "@/shared/errors";

const TENANT = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "Inmo Uno",
  slug: "inmo-uno",
  isActive: true,
};

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const tenantAdminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: TENANT.id, role: "tenant_admin" });

function makeApp(overrides: Partial<TenantsService> = {}) {
  const service = {
    provision: jest.fn().mockResolvedValue({ tenant: TENANT, user: { id: "u1" } }),
    list: jest.fn().mockResolvedValue({ items: [TENANT], total: 1, page: 1, pageSize: 20 }),
    getById: jest.fn().mockResolvedValue(TENANT),
    update: jest.fn().mockResolvedValue({ ...TENANT, name: "Nueva" }),
    ...overrides,
  } as unknown as TenantsService;

  const app = express();
  app.use(express.json());
  // Auditor espía: verifica el registro sin escribir en la base.
  const auditor = { record: jest.fn().mockResolvedValue(undefined) };
  app.use("/api/admin/tenants", createTenantsRouter(service, auditor));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, auditor };
}

describe("auditoría de acciones sobre inmobiliarias", () => {
  it("suspender queda registrado como tenant.suspend", async () => {
    // Es la acción que uno busca cuando pregunta quién dejó a una
    // inmobiliaria sin servicio: no puede quedar como un "update" genérico.
    const { app, auditor } = makeApp();
    await request(app)
      .patch(`/api/admin/tenants/${TENANT.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ isActive: false });

    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.suspend", entityId: TENANT.id }),
    );
  });

  it("reactivar queda registrado como tenant.activate", async () => {
    const { app, auditor } = makeApp();
    await request(app)
      .patch(`/api/admin/tenants/${TENANT.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ isActive: true });

    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.activate" }),
    );
  });

  it("otros cambios quedan como tenant.update", async () => {
    const { app, auditor } = makeApp();
    await request(app)
      .patch(`/api/admin/tenants/${TENANT.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ name: "Nombre nuevo" });

    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.update" }),
    );
  });

  it("el alta registra quién la hizo", async () => {
    const { app, auditor } = makeApp();
    await request(app)
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        tenantName: "Nueva Inmo",
        slug: "nueva-inmo",
        adminEmail: "admin@nueva.com",
        adminPassword: "secreto-123",
      });

    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.create", userId: "sa-1" }),
    );
  });
});

describe("tenants router (super admin)", () => {
  it("401 sin token en cualquier endpoint", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/admin/tenants");
    expect(res.status).toBe(401);
  });

  it("403 para tenant_admin (solo super_admin)", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/admin/tenants")
      .set("Authorization", `Bearer ${tenantAdminToken()}`);
    expect(res.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("GET /: lista con filtros y paginación", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/admin/tenants?search=inmo&isActive=true&page=2&pageSize=10")
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [TENANT], total: 1, page: 1, pageSize: 20 });
    expect(service.list).toHaveBeenCalledWith({
      search: "inmo",
      isActive: true,
      page: 2,
      pageSize: 10,
    });
  });

  it("GET /:id → 200", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/api/admin/tenants/${TENANT.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.tenant).toEqual(TENANT);
  });

  it("GET /:id inexistente → 404", async () => {
    const { app } = makeApp({
      getById: jest.fn().mockRejectedValue(new NotFoundError("Inmobiliaria no encontrada")),
    } as Partial<TenantsService>);
    const res = await request(app)
      .get("/api/admin/tenants/nope")
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(404);
  });

  it("POST /: crea inmobiliaria + admin → 201", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        tenantName: "Inmo Uno",
        slug: "Inmo-Uno",
        adminEmail: "DUENO@inmo.com",
        adminPassword: "secreto-123",
        adminName: "Dueño",
      });
    expect(res.status).toBe(201);
    // Normaliza slug y email a minúsculas antes del service.
    expect(service.provision).toHaveBeenCalledWith({
      tenantName: "Inmo Uno",
      slug: "inmo-uno",
      adminEmail: "dueno@inmo.com",
      adminPassword: "secreto-123",
      adminName: "Dueño",
    });
  });

  it("POST /: body inválido → 422 sin llegar al service", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ tenantName: "X", slug: "a b", adminEmail: "no", adminPassword: "1" });
    expect(res.status).toBe(422);
    expect(service.provision).not.toHaveBeenCalled();
  });

  it("PATCH /:id: actualiza y devuelve el tenant", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        name: "Nueva",
        isActive: false,
        planId: "44444444-4444-4444-4444-444444444444",
      });
    expect(res.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(TENANT.id, {
      name: "Nueva",
      isActive: false,
      planId: "44444444-4444-4444-4444-444444444444",
    });
  });

  it("PATCH /:id: body vacío → 422", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .patch(`/api/admin/tenants/${TENANT.id}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({});
    expect(res.status).toBe(422);
    expect(service.update).not.toHaveBeenCalled();
  });
});

