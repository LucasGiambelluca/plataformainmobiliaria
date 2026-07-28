import express from "express";
import request from "supertest";
import {
  createPlatformMetricsRouter,
  createTenantMetricsRouter,
} from "@/modules/analytics/analytics.router";
import type { AnalyticsService } from "@/modules/analytics/analytics.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const OTRO_TENANT = "44444444-4444-4444-4444-444444444444";

const PLATFORM = {
  tenants: { total: 3, active: 2, suspended: 1 },
  subscriptions: { active: 2, trialing: 1, pastDue: 0, canceled: 0 },
  mrr: "24000.00",
  revenueLast6Months: "120000.00",
  properties: { total: 40, published: 31 },
  inquiriesLast30Days: 12,
  revenueSeries: [{ month: "Jul", amount: "20000.00" }],
  topAgencies: [{ id: TENANT_ID, name: "Inmo Uno", slug: "inmo-uno", properties: 12 }],
};

const TENANT_METRICS = {
  properties: { total: 12, published: 9, draft: 2, featured: 1 },
  viewsTotal: 340,
  inquiries: { total: 5, new: 2, last30Days: 4 },
  topProperties: [{ id: "p-1", title: "Casa 3 ambientes", viewsCount: 120 }],
};

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const adminToken = (tenant = TENANT_ID) =>
  signAccessToken({ sub: "ta-1", tenant, role: "tenant_admin" });
const agentToken = () =>
  signAccessToken({ sub: "ag-1", tenant: TENANT_ID, role: "agent" });

function makeApp() {
  const service = {
    platform: jest.fn().mockResolvedValue(PLATFORM),
    tenant: jest.fn().mockResolvedValue(TENANT_METRICS),
  } as unknown as AnalyticsService;

  const app = express();
  app.use(express.json());
  app.use("/api/admin/metrics", createPlatformMetricsRouter(service));
  app.use("/api/metrics", createTenantMetricsRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service };
}

describe("métricas de plataforma", () => {
  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/admin/metrics")).status).toBe(401);
  });

  it("403 para el admin de una inmobiliaria: son datos de toda la plataforma", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
    expect(service.platform).not.toHaveBeenCalled();
  });

  it("el super admin obtiene las métricas globales", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual(PLATFORM);
  });
});

describe("métricas de la inmobiliaria", () => {
  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/metrics")).status).toBe(401);
  });

  it("el tenant sale del token, no de la query", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get(`/api/metrics?tenantId=${OTRO_TENANT}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(service.tenant).toHaveBeenCalledWith(TENANT_ID);
    expect(service.tenant).not.toHaveBeenCalledWith(OTRO_TENANT);
  });

  it("el agente también ve las métricas de su inmobiliaria", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/metrics")
      .set("Authorization", `Bearer ${agentToken()}`);

    expect(res.status).toBe(200);
    expect(service.tenant).toHaveBeenCalledWith(TENANT_ID);
  });

  it("403 para el super admin: no tiene inmobiliaria propia", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/metrics")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(403);
    expect(service.tenant).not.toHaveBeenCalled();
  });
});
