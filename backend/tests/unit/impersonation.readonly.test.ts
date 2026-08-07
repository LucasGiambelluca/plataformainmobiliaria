import express from "express";
import request from "supertest";
import { authenticate } from "@/shared/middleware/authenticate";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import {
  signAccessToken,
  signImpersonationToken,
} from "@/shared/services/jwt.service";

const suplantado = () =>
  signImpersonationToken({ userId: "ta-1", tenantId: "t-1" }, "sa-1").token;
const normal = () =>
  signAccessToken({ sub: "ta-1", tenant: "t-1", role: "tenant_admin" });

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(authenticate);
  app.get("/cosa", (req, res) => {
    res.json({ user: req.user });
  });
  app.post("/cosa", (_req, res) => {
    res.status(201).json({ ok: true });
  });
  app.patch("/cosa", (_req, res) => {
    res.json({ ok: true });
  });
  app.delete("/cosa", (_req, res) => {
    res.status(204).end();
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("sesión de suplantación: solo lectura", () => {
  it("deja pasar un GET", async () => {
    const res = await request(makeApp())
      .get("/cosa")
      .set("Authorization", `Bearer ${suplantado()}`);
    expect(res.status).toBe(200);
  });

  it("expone al suplantador y la marca de solo lectura en req.user", async () => {
    const res = await request(makeApp())
      .get("/cosa")
      .set("Authorization", `Bearer ${suplantado()}`);
    expect(res.body.user).toMatchObject({
      id: "ta-1",
      tenantId: "t-1",
      role: "tenant_admin",
      impersonatorId: "sa-1",
      readOnly: true,
    });
  });

  it.each(["post", "patch", "delete"] as const)(
    "rechaza un %s con 403 IMPERSONATION_READ_ONLY",
    async (method) => {
      const res = await request(makeApp())
        [method]("/cosa")
        .set("Authorization", `Bearer ${suplantado()}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("IMPERSONATION_READ_ONLY");
    },
  );

  it("una sesión normal escribe igual que siempre", async () => {
    const res = await request(makeApp())
      .post("/cosa")
      .set("Authorization", `Bearer ${normal()}`);
    expect(res.status).toBe(201);
  });

  it("una sesión normal no queda marcada como suplantación", async () => {
    const res = await request(makeApp())
      .get("/cosa")
      .set("Authorization", `Bearer ${normal()}`);
    expect(res.body.user.impersonatorId).toBeUndefined();
    expect(res.body.user.readOnly).toBeUndefined();
  });
});
