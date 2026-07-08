import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { createAuthRouter, REFRESH_COOKIE } from "@/modules/auth/auth.router";
import type { AuthService } from "@/modules/auth/auth.service";
import type { TenantsService } from "@/modules/tenants/tenants.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";
import { UnauthorizedError } from "@/shared/errors";

const SAFE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  email: "agente@inmo.com",
  role: "agent" as const,
  name: "Agente Uno",
};

const OK_RESULT = {
  accessToken: "access-abc",
  refreshToken: "refresh-abc",
  refreshExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  user: SAFE_USER,
};

function makeApp(
  overrides: Partial<AuthService> = {},
  tenantsOverrides: Partial<TenantsService> = {},
) {
  const service = {
    login: jest.fn().mockResolvedValue(OK_RESULT),
    refresh: jest.fn().mockResolvedValue(OK_RESULT),
    logout: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthService;

  const tenantsService = {
    provision: jest.fn().mockResolvedValue({
      tenant: { id: "t1", name: "Inmo Uno", slug: "inmo-uno", isActive: true },
      user: SAFE_USER,
    }),
    ...tenantsOverrides,
  } as unknown as TenantsService;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter(service, tenantsService));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, tenantsService };
}

describe("auth router", () => {
  describe("POST /api/auth/login", () => {
    it("200: devuelve user + accessToken y setea cookie httpOnly con el refresh", async () => {
      const { app } = makeApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "agente@inmo.com", password: "secreto-123" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { ...SAFE_USER },
        accessToken: "access-abc",
      });
      // Refresh nunca en el body, solo cookie httpOnly limitada a /api/auth.
      expect(JSON.stringify(res.body)).not.toContain("refresh-abc");
      const cookie = res.headers["set-cookie"]?.[0] ?? "";
      expect(cookie).toContain(`${REFRESH_COOKIE}=refresh-abc`);
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Path=/api/auth");
      expect(cookie).toContain("SameSite=Lax");
    });

    it("422: body inválido no llega al service", async () => {
      const { app, service } = makeApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "no-es-email" });
      expect(res.status).toBe(422);
      expect(service.login).not.toHaveBeenCalled();
    });

    it("401: credenciales inválidas → error serializado", async () => {
      const { app } = makeApp({
        login: jest.fn().mockRejectedValue(new UnauthorizedError("Credenciales inválidas")),
      } as Partial<AuthService>);
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "a@b.com", password: "12345678" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("200: lee cookie, rota y setea la nueva", async () => {
      const { app, service } = makeApp();
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `${REFRESH_COOKIE}=viejo-token`);

      expect(res.status).toBe(200);
      expect(service.refresh).toHaveBeenCalledWith("viejo-token");
      expect(res.body.accessToken).toBe("access-abc");
      expect(res.headers["set-cookie"]?.[0]).toContain(`${REFRESH_COOKIE}=refresh-abc`);
    });

    it("401: sin cookie", async () => {
      const { app, service } = makeApp();
      const res = await request(app).post("/api/auth/refresh");
      expect(res.status).toBe(401);
      expect(service.refresh).not.toHaveBeenCalled();
    });

    it("401: token inválido → limpia la cookie", async () => {
      const { app } = makeApp({
        refresh: jest.fn().mockRejectedValue(new UnauthorizedError()),
      } as Partial<AuthService>);
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `${REFRESH_COOKIE}=robado`);
      expect(res.status).toBe(401);
      // Cookie borrada (expira en el pasado / vacía).
      expect(res.headers["set-cookie"]?.[0]).toMatch(new RegExp(`${REFRESH_COOKIE}=;`));
    });
  });

  describe("POST /api/auth/logout", () => {
    it("204: revoca y limpia cookie", async () => {
      const { app, service } = makeApp();
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", `${REFRESH_COOKIE}=algun-token`);
      expect(res.status).toBe(204);
      expect(service.logout).toHaveBeenCalledWith("algun-token");
      expect(res.headers["set-cookie"]?.[0]).toMatch(new RegExp(`${REFRESH_COOKIE}=;`));
    });

    it("204: sin cookie también responde ok (idempotente)", async () => {
      const { app, service } = makeApp();
      const res = await request(app).post("/api/auth/logout");
      expect(res.status).toBe(204);
      expect(service.logout).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/register", () => {
    const REGISTER_BODY = {
      tenantName: "Inmo Uno",
      slug: "Inmo-Uno",
      email: "DUENO@inmo.com",
      password: "secreto-123",
      name: "Dueño",
    };

    it("201: provisiona inmobiliaria, auto-loguea y setea cookie", async () => {
      const { app, service, tenantsService } = makeApp();
      const res = await request(app).post("/api/auth/register").send(REGISTER_BODY);

      expect(res.status).toBe(201);
      // Slug y email normalizados a minúsculas.
      expect(tenantsService.provision).toHaveBeenCalledWith({
        tenantName: "Inmo Uno",
        slug: "inmo-uno",
        adminEmail: "dueno@inmo.com",
        adminPassword: "secreto-123",
        adminName: "Dueño",
      });
      // Auto-login con las credenciales recién creadas.
      expect(service.login).toHaveBeenCalledWith("dueno@inmo.com", "secreto-123");
      expect(res.body).toEqual({
        tenant: { id: "t1", name: "Inmo Uno", slug: "inmo-uno", isActive: true },
        user: { ...SAFE_USER },
        accessToken: "access-abc",
      });
      expect(res.headers["set-cookie"]?.[0]).toContain(`${REFRESH_COOKIE}=refresh-abc`);
    });

    it("422: slug con espacios o password corto no llegan al service", async () => {
      const { app, tenantsService } = makeApp();
      const res = await request(app)
        .post("/api/auth/register")
        .send({ ...REGISTER_BODY, slug: "inmo uno", password: "corta" });
      expect(res.status).toBe(422);
      expect(tenantsService.provision).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/auth/me", () => {
    it("200: con access token válido devuelve el usuario del payload", async () => {
      const { app } = makeApp();
      const token = signAccessToken({
        sub: SAFE_USER.id,
        tenant: SAFE_USER.tenantId,
        role: "agent",
      });
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: SAFE_USER.id,
        tenantId: SAFE_USER.tenantId,
        role: "agent",
      });
    });

    it("401: sin token", async () => {
      const { app } = makeApp();
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });
  });
});
