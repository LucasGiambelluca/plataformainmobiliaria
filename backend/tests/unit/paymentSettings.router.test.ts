import express from "express";
import request from "supertest";
import { createPaymentSettingsRouter } from "@/modules/paymentSettings/paymentSettings.router";
import type { PaymentSettingsService } from "@/modules/paymentSettings/paymentSettings.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";
import { ValidationError } from "@/shared/errors";

const ESTADO = {
  activeMode: "sandbox" as const,
  credentials: {
    sandbox: { configured: true, last4: "c8f2" },
    production: { configured: false, last4: null },
  },
  webhookUrl: "https://api.test/api/billing/webhook",
  updatedAt: new Date("2026-08-06T12:00:00Z"),
  updatedBy: "admin@plataforma.com",
};

const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });
const tenantAdminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: "t-1", role: "tenant_admin" });

function makeApp(overrides: Partial<PaymentSettingsService> = {}) {
  const service = {
    get: jest.fn().mockResolvedValue(ESTADO),
    saveCredentials: jest.fn().mockResolvedValue({ verified: true, last4: "c8f2" }),
    activate: jest.fn().mockResolvedValue({
      activeMode: "production",
      orphanedSubscriptions: 3,
    }),
    ...overrides,
  } as unknown as PaymentSettingsService;

  const app = express();
  app.use(express.json());
  const auditor = { record: jest.fn().mockResolvedValue(undefined) };
  app.use("/api/admin/payment-settings", createPaymentSettingsRouter(service, auditor));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, auditor };
}

describe("permisos", () => {
  it.each([
    ["get", "/api/admin/payment-settings"],
    ["put", "/api/admin/payment-settings/sandbox"],
    ["post", "/api/admin/payment-settings/activate"],
  ] as const)("%s → 403 para tenant_admin", async (method, url) => {
    const { app } = makeApp();
    const res = await request(app)
      [method](url)
      .set("Authorization", `Bearer ${tenantAdminToken()}`);
    expect(res.status).toBe(403);
  });

  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/admin/payment-settings")).status).toBe(401);
  });
});

describe("GET /", () => {
  it("devuelve el estado", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/payment-settings")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.activeMode).toBe("sandbox");
    expect(res.body.credentials.sandbox).toEqual({ configured: true, last4: "c8f2" });
  });
});

describe("PUT /:mode", () => {
  it("guarda y registra la auditoría sin el token", async () => {
    const { app, service, auditor } = makeApp();

    const res = await request(app)
      .put("/api/admin/payment-settings/production")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" });

    expect(res.status).toBe(200);
    expect(service.saveCredentials).toHaveBeenCalledWith(
      "production",
      { accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" },
      "sa-1",
    );

    const [entrada] = (auditor.record as jest.Mock).mock.calls[0];
    expect(entrada).toMatchObject({
      action: "payment_settings.update",
      tenantId: null,
      userId: "sa-1",
      metadata: { mode: "production", last4: "c8f2" },
    });
    expect(JSON.stringify(entrada)).not.toContain("APP_USR-1234567890");
    expect(JSON.stringify(entrada)).not.toContain("un-secreto-largo");
  });

  it("modo inválido → 422 sin llegar al service", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .put("/api/admin/payment-settings/staging")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" });

    expect(res.status).toBe(422);
    expect(service.saveCredentials).not.toHaveBeenCalled();
  });

  it("body incompleto → 422: no hay actualización parcial", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .put("/api/admin/payment-settings/production")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890" });

    expect(res.status).toBe(422);
    expect(service.saveCredentials).not.toHaveBeenCalled();
  });

  it("propaga el 422 cuando MercadoPago rechaza el token", async () => {
    const { app } = makeApp({
      saveCredentials: jest.fn().mockRejectedValue(new ValidationError("rechazado")),
    } as Partial<PaymentSettingsService>);

    const res = await request(app)
      .put("/api/admin/payment-settings/production")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ accessToken: "APP_USR-1234567890", webhookSecret: "un-secreto-largo" });

    expect(res.status).toBe(422);
  });
});

describe("POST /activate", () => {
  it("cambia el modo, informa las huérfanas y lo audita", async () => {
    const { app, auditor } = makeApp();

    const res = await request(app)
      .post("/api/admin/payment-settings/activate")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ mode: "production" });

    expect(res.status).toBe(200);
    expect(res.body.orphanedSubscriptions).toBe(3);
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payment_settings.activate",
        metadata: { mode: "production" },
      }),
    );
  });
});
