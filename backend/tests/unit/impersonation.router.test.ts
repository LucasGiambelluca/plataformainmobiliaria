import express from "express";
import request from "supertest";
import { createTenantsRouter } from "@/modules/tenants/tenants.router";
import type { TenantsService } from "@/modules/tenants/tenants.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import {
  signAccessToken,
  signImpersonationToken,
} from "@/shared/services/jwt.service";
import { ValidationError } from "@/shared/errors";

const TENANT = { id: "t-1", name: "Inmobiliaria Demo", slug: "demo" };
const EXPIRA = new Date("2026-08-06T18:30:00.000Z");

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const tenantAdminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: TENANT.id, role: "tenant_admin" });

function makeApp(overrides: Partial<TenantsService> = {}) {
  const service = {
    getById: jest.fn().mockResolvedValue(TENANT),
    list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
    impersonate: jest.fn().mockResolvedValue({
      accessToken: "token-de-soporte",
      expiresAt: EXPIRA,
      user: {
        id: "ta-1",
        email: "ana@demo.com",
        name: "Ana",
        tenantId: TENANT.id,
        role: "tenant_admin",
      },
      tenant: TENANT,
    }),
    ...overrides,
  } as unknown as TenantsService;

  const app = express();
  app.use(express.json());
  const auditor = { record: jest.fn().mockResolvedValue(undefined) };
  app.use("/api/admin/tenants", createTenantsRouter(service, auditor));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, auditor };
}

describe("POST /admin/tenants/:id/impersonate", () => {
  it("devuelve el token de soporte al super admin", async () => {
    const { app, service } = makeApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("token-de-soporte");
    expect(res.body.tenant).toEqual(TENANT);
    expect(service.impersonate).toHaveBeenCalledWith(TENANT.id, "sa-1");
  });

  it("no emite ninguna cookie", async () => {
    // El corazón del diseño: la cookie httpOnly sigue siendo la del super
    // admin, así que siempre hay a dónde volver.
    const { app } = makeApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("registra la suplantación con el super admin real como autor", async () => {
    const { app, auditor } = makeApp();

    await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.start",
        tenantId: TENANT.id,
        userId: "sa-1",
        entityType: "user",
        entityId: "ta-1",
        metadata: { email: "ana@demo.com", expiresAt: EXPIRA.toISOString() },
      }),
    );
  });

  it("403 para un tenant_admin", async () => {
    const { app, service } = makeApp();

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${tenantAdminToken()}`);

    expect(res.status).toBe(403);
    expect(service.impersonate).not.toHaveBeenCalled();
  });

  it("401 sin token", async () => {
    const { app } = makeApp();
    const res = await request(app).post(`/api/admin/tenants/${TENANT.id}/impersonate`);
    expect(res.status).toBe(401);
  });

  it("propaga el 422 cuando no hay administrador al que suplantar", async () => {
    const { app } = makeApp({
      impersonate: jest.fn().mockRejectedValue(new ValidationError("sin admin")),
    } as Partial<TenantsService>);

    const res = await request(app)
      .post(`/api/admin/tenants/${TENANT.id}/impersonate`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(422);
  });
});

describe("desde una suplantación no se vuelve al admin", () => {
  it("el token de soporte recibe 403 en el router del super admin", async () => {
    // No hay escalada de vuelta: el token dice role tenant_admin, así que
    // authorize("super_admin") lo rechaza y no puede suplantar de nuevo.
    const { token } = signImpersonationToken(
      { userId: "ta-1", tenantId: TENANT.id },
      "sa-1",
    );
    const { app } = makeApp();

    const res = await request(app)
      .get("/api/admin/tenants")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
