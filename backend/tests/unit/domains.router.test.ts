import express from "express";
import request from "supertest";
import {
  createAdminDomainsRouter,
  createDomainsRouter,
} from "@/modules/domains/domains.router";
import type { DomainsService } from "@/modules/domains/domains.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const DOMAIN_ID = "44444444-4444-4444-4444-444444444444";

const adminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: TENANT_ID, role: "tenant_admin" });
const agentToken = () =>
  signAccessToken({ sub: "ag-1", tenant: TENANT_ID, role: "agent" });
const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });

const DOMAIN = {
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  domain: "inmobiliarianorte.com",
  status: "pending",
  dnsTarget: "edge.plataforma.com",
  lastCheckedAt: null,
  verifiedAt: null,
  createdAt: new Date("2026-07-30"),
};

function makeApp(overrides: Partial<DomainsService> = {}) {
  const service = {
    list: jest
      .fn()
      .mockResolvedValue({ domains: [DOMAIN], dnsTarget: "edge.plataforma.com" }),
    create: jest.fn().mockResolvedValue(DOMAIN),
    verify: jest.fn().mockResolvedValue({ domain: DOMAIN, detail: null }),
    remove: jest.fn().mockResolvedValue(undefined),
    listAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }),
    verifyAny: jest.fn().mockResolvedValue({ domain: DOMAIN, detail: null }),
    removeAny: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as DomainsService;

  const auditor = { record: jest.fn().mockResolvedValue(undefined) };

  const app = express();
  app.use(express.json());
  app.use("/api/domains", createDomainsRouter(service, auditor));
  app.use("/api/admin/domains", createAdminDomainsRouter(service, auditor));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, auditor };
}

describe("domains router (inmobiliaria)", () => {
  it("401 sin token; 403 para un agente", async () => {
    const { app } = makeApp();

    expect((await request(app).get("/api/domains")).status).toBe(401);
    const res = await request(app)
      .get("/api/domains")
      .set("Authorization", `Bearer ${agentToken()}`);
    expect(res.status).toBe(403);
  });

  it("GET / lista los dominios del tenant del token, con el target del DNS", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/domains")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(TENANT_ID);
    // El panel muestra qué configurar antes de cargar el primer dominio.
    expect(res.body.dnsTarget).toBe("edge.plataforma.com");
  });

  it("POST / normaliza el dominio antes de guardarlo", async () => {
    // Pegar la URL del navegador es el error más común del formulario.
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/domains")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ domain: "  HTTPS://Inmobiliarianorte.com/inicio  " });

    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(TENANT_ID, "inmobiliarianorte.com");
  });

  it("POST / rechaza dominios inválidos con 422", async () => {
    const { app, service } = makeApp();

    for (const domain of ["sin-tld", "*.comodin.com", "espacio adentro.com", ""]) {
      const res = await request(app)
        .post("/api/domains")
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({ domain });
      expect(res.status).toBe(422);
    }
    expect(service.create).not.toHaveBeenCalled();
  });

  it("POST /:id/verify registra la auditoría con el estado resultante", async () => {
    const { app, service, auditor } = makeApp();
    const res = await request(app)
      .post(`/api/domains/${DOMAIN_ID}/verify`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(service.verify).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID);
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "domain.verify", tenantId: TENANT_ID }),
    );
  });

  it("DELETE /:id responde 204 y audita la baja", async () => {
    const { app, service, auditor } = makeApp();
    const res = await request(app)
      .delete(`/api/domains/${DOMAIN_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith(TENANT_ID, DOMAIN_ID);
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "domain.delete" }),
    );
  });

  it("el tenant no puede entrar al panel global de dominios", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/domains")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(403);
  });
});

describe("admin domains router (super admin)", () => {
  it("GET / lista cruzando inmobiliarias", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/admin/domains?status=active&page=2")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(200);
    expect(service.listAll).toHaveBeenCalledWith({ status: "active", page: 2 });
  });

  it("GET / con query inválida → 422", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/domains?status=inventado")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(422);
  });

  it("no existe forma de marcar un dominio activo a mano", async () => {
    // El estado sale siempre del DNS: si esto empieza a responder 200, alguien
    // agregó un atajo que permite servir el dominio de un tercero.
    const { app } = makeApp();
    const res = await request(app)
      .patch(`/api/admin/domains/${DOMAIN_ID}`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "active" });

    expect(res.status).toBe(404);
  });

  it("DELETE /:id libera un dominio reclamado de mala fe", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .delete(`/api/admin/domains/${DOMAIN_ID}`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(res.status).toBe(204);
    expect(service.removeAny).toHaveBeenCalledWith(DOMAIN_ID);
  });
});
