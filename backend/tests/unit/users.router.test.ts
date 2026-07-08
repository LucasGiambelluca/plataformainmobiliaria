import express from "express";
import request from "supertest";
import { createUsersRouter } from "@/modules/users/users.router";
import type { UsersService } from "@/modules/users/users.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const AGENT_ID = "22222222-2222-2222-2222-222222222222";

const USER = {
  id: AGENT_ID,
  tenantId: TENANT_ID,
  email: "agente@inmo.com",
  role: "agent",
  name: "Agente",
  phone: null,
  isActive: true,
};

const adminToken = () =>
  signAccessToken({ sub: ADMIN_ID, tenant: TENANT_ID, role: "tenant_admin" });
const agentToken = () =>
  signAccessToken({ sub: AGENT_ID, tenant: TENANT_ID, role: "agent" });
const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });

function makeApp(overrides: Partial<UsersService> = {}) {
  const service = {
    list: jest.fn().mockResolvedValue([USER]),
    create: jest.fn().mockResolvedValue(USER),
    update: jest.fn().mockResolvedValue({ ...USER, name: "Nuevo" }),
    deactivate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as UsersService;

  const app = express();
  app.use(express.json());
  app.use("/api/users", createUsersRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service };
}

describe("users router (panel inmobiliaria)", () => {
  it("401 sin token", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/users")).status).toBe(401);
  });

  it("403 para agent (solo tenant_admin gestiona usuarios)", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${agentToken()}`);
    expect(res.status).toBe(403);
  });

  it("403 para super_admin (gestión de usuarios es del tenant_admin)", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(403);
  });

  it("GET /: lista usuarios del tenant del token", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([USER]);
    expect(service.list).toHaveBeenCalledWith(TENANT_ID);
  });

  it("POST /: crea usuario → 201; tenant y actor salen del token", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        email: "NUEVO@inmo.com",
        password: "secreto-123",
        role: "agent",
        name: "Nuevo",
      });
    expect(res.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(TENANT_ID, {
      email: "nuevo@inmo.com",
      password: "secreto-123",
      role: "agent",
      name: "Nuevo",
    });
  });

  it("POST /: role super_admin rechazado por schema → 422", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ email: "x@inmo.com", password: "secreto-123", role: "super_admin" });
    expect(res.status).toBe(422);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id: actualiza pasando el actor del token", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .patch(`/api/users/${AGENT_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ name: "Nuevo" });
    expect(res.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(TENANT_ID, AGENT_ID, ADMIN_ID, {
      name: "Nuevo",
    });
  });

  it("PATCH /:id: body vacío → 422", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .patch(`/api/users/${AGENT_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBe(422);
    expect(service.update).not.toHaveBeenCalled();
  });

  it("DELETE /:id: desactiva → 204", async () => {
    const { app, service } = makeApp();
    const res = await request(app)
      .delete(`/api/users/${AGENT_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(204);
    expect(service.deactivate).toHaveBeenCalledWith(TENANT_ID, AGENT_ID, ADMIN_ID);
  });
});
