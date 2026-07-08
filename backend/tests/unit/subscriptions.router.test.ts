import express from "express";
import request from "supertest";
import { createSubscriptionsRouter } from "@/modules/subscriptions/subscriptions.router";
import { createPlansRouter } from "@/modules/subscriptions/plans.router";
import type { SubscriptionsService } from "@/modules/subscriptions/subscriptions.service";
import type { PlansService } from "@/modules/subscriptions/plans.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";

const adminToken = () =>
  signAccessToken({ sub: "ta-1", tenant: TENANT_ID, role: "tenant_admin" });
const agentToken = () =>
  signAccessToken({ sub: "ag-1", tenant: TENANT_ID, role: "agent" });
const superAdminToken = () =>
  signAccessToken({ sub: "sa-1", tenant: null, role: "super_admin" });

const STATUS = { subscription: { id: "sub-1" }, usage: { users: { used: 1, limit: 2 } } };
const PLAN = { id: "plan-1", name: "Pro", slug: "pro" };

function makeApp(
  subOverrides: Partial<SubscriptionsService> = {},
  planOverrides: Partial<PlansService> = {},
) {
  const subService = {
    getStatus: jest.fn().mockResolvedValue(STATUS),
    cancel: jest.fn().mockResolvedValue(undefined),
    ...subOverrides,
  } as unknown as SubscriptionsService;

  const plansService = {
    list: jest.fn().mockResolvedValue([PLAN]),
    create: jest.fn().mockResolvedValue(PLAN),
    update: jest.fn().mockResolvedValue({ ...PLAN, name: "Pro+" }),
    ...planOverrides,
  } as unknown as PlansService;

  const app = express();
  app.use(express.json());
  app.use("/api/subscription", createSubscriptionsRouter(subService));
  app.use("/api/admin/plans", createPlansRouter(plansService));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, subService, plansService };
}

describe("subscriptions router (tenant)", () => {
  it("401 sin token / 403 agent", async () => {
    const { app } = makeApp();
    expect((await request(app).get("/api/subscription")).status).toBe(401);
    const res = await request(app)
      .get("/api/subscription")
      .set("Authorization", `Bearer ${agentToken()}`);
    expect(res.status).toBe(403);
  });

  it("GET /: estado + uso del tenant del token", async () => {
    const { app, subService } = makeApp();
    const res = await request(app)
      .get("/api/subscription")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(STATUS);
    expect(subService.getStatus).toHaveBeenCalledWith(TENANT_ID);
  });

  it("POST /cancel → 204", async () => {
    const { app, subService } = makeApp();
    const res = await request(app)
      .post("/api/subscription/cancel")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(204);
    expect(subService.cancel).toHaveBeenCalledWith(TENANT_ID);
  });
});

describe("plans router (super admin)", () => {
  it("403 para tenant_admin", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/plans")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it("GET /: lista planes", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get("/api/admin/plans")
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.plans).toEqual([PLAN]);
  });

  it("POST /: crea plan → 201; body inválido → 422", async () => {
    const { app, plansService } = makeApp();
    const ok = await request(app)
      .post("/api/admin/plans")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        name: "Pro",
        slug: "pro",
        priceAmount: "29999",
        maxProperties: 100,
        maxUsers: 10,
        maxStorageMb: 5000,
      });
    expect(ok.status).toBe(201);
    expect(plansService.create).toHaveBeenCalled();

    const bad = await request(app)
      .post("/api/admin/plans")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ name: "X" });
    expect(bad.status).toBe(422);
  });

  it("PATCH /:id: actualiza plan", async () => {
    const { app, plansService } = makeApp();
    const res = await request(app)
      .patch("/api/admin/plans/plan-1")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ name: "Pro+", isActive: false });
    expect(res.status).toBe(200);
    expect(plansService.update).toHaveBeenCalledWith("plan-1", {
      name: "Pro+",
      isActive: false,
    });
  });
});
