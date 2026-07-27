import express from "express";
import request from "supertest";
import { createPropertiesRouter } from "@/modules/properties/properties.router";
import type { PropertiesService } from "@/modules/properties/properties.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const AGENT_ID = "22222222-2222-2222-2222-222222222222";
const PROPERTY_ID = "55555555-5555-5555-5555-555555555555";

const PROPERTY = {
  id: PROPERTY_ID,
  tenantId: TENANT_ID,
  title: "Casa 3 ambientes",
  status: "draft",
  price: "185000.00",
};

const adminToken = () =>
  signAccessToken({ sub: ADMIN_ID, tenant: TENANT_ID, role: "tenant_admin" });
const agentToken = () =>
  signAccessToken({ sub: AGENT_ID, tenant: TENANT_ID, role: "agent" });
const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });

function makeApp(overrides: Partial<PropertiesService> = {}) {
  const service = {
    list: jest.fn().mockResolvedValue({ items: [PROPERTY], total: 1, page: 1, pageSize: 20 }),
    getById: jest.fn().mockResolvedValue(PROPERTY),
    create: jest.fn().mockResolvedValue(PROPERTY),
    update: jest.fn().mockResolvedValue(PROPERTY),
    changeStatus: jest.fn().mockResolvedValue({ ...PROPERTY, status: "published" }),
    remove: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PropertiesService;

  const app = express();
  app.use(express.json());
  app.use("/api/properties", createPropertiesRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service };
}

const CREATE_BODY = {
  title: "Casa 3 ambientes",
  propertyType: "house",
  operationType: "sale",
  price: "185000.00",
};

describe("properties router (panel inmobiliaria)", () => {
  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/properties")).status).toBe(401);
  });

  it("403 para super_admin: las propiedades son del tenant", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/properties")
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(403);
  });

  it("el agente sí puede listar: cargar publicaciones es su trabajo", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/properties")
      .set("Authorization", `Bearer ${agentToken()}`);
    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(TENANT_ID, expect.objectContaining({ sort: "recent" }));
  });

  it("GET /: pasa los filtros de la query ya tipados", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/properties?status=published&minPrice=1000&page=2&sort=price_asc")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(TENANT_ID, {
      status: "published",
      minPrice: 1000,
      page: 2,
      sort: "price_asc",
    });
  });

  it("GET /: filtro inexistente en el enum → 422", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/properties?status=vendida")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(422);
    expect(service.list).not.toHaveBeenCalled();
  });

  it("POST /: crea → 201, con tenant y autor sacados del token", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/properties")
      .set("Authorization", `Bearer ${agentToken()}`)
      .send(CREATE_BODY);

    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ title: "Casa 3 ambientes" }),
      AGENT_ID,
    );
  });

  it("POST /: precio con formato de float → 422", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/properties")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ...CREATE_BODY, price: "185000.999" });

    expect(res.status).toBe(422);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("POST /: el status no se puede fijar al crear (nace en draft)", async () => {
    const { app, service } = makeApp();
    await request(app)
      .post("/api/properties")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ ...CREATE_BODY, status: "published" });

    const [, body] = (service.create as jest.Mock).mock.calls[0];
    expect(body).not.toHaveProperty("status");
  });

  it("PATCH /:id/status: cambia de estado", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .patch(`/api/properties/${PROPERTY_ID}/status`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "published" });

    expect(res.status).toBe(200);
    expect(service.changeStatus).toHaveBeenCalledWith(PROPERTY_ID, TENANT_ID, "published");
  });

  it("PATCH /:id: body vacío → 422", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .patch(`/api/properties/${PROPERTY_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(422);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("DELETE /:id → 204", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .delete(`/api/properties/${PROPERTY_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith(PROPERTY_ID, TENANT_ID);
  });
});
