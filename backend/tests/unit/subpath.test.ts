import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { AuthService } from "@/modules/auth/auth.service";
import type { TenantsService } from "@/modules/tenants/tenants.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

/**
 * Despliegue bajo un subpath.
 *
 * La app se puede servir en la raíz del host (lo normal) o debajo de un
 * subpath, cuando el dominio ya tiene otro sitio en la raíz. Lo segundo obliga
 * a que tres cosas coincidan con la ruta por la que realmente viajan las
 * peticiones: el `path` de la cookie de refresh, las URL absolutas del sitemap y
 * las reglas de robots.txt. Si una sola se queda en la raíz, el síntoma es el
 * mismo en los tres casos y es el que más cuesta diagnosticar: la web anda,
 * pero la sesión se cae en cada recarga.
 *
 * Estos tests fijan APP_BASE_PATH y releen los módulos, porque tanto el path de
 * la cookie como el de las URL se calculan al importar, no por pedido.
 */

const TOKENS = {
  accessToken: "access-abc",
  refreshToken: "refresh-abc",
  refreshExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  user: {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "22222222-2222-2222-2222-222222222222",
    email: "agente@inmo.com",
    role: "agent" as const,
    name: "Agente Uno",
  },
};

/** Monta solo el router de auth con services falsos, como auth.router.test.ts. */
function appDeAuth(createAuthRouter: (s: AuthService, t: TenantsService) => express.Router) {
  const service = {
    login: jest.fn().mockResolvedValue(TOKENS),
    refresh: jest.fn().mockResolvedValue(TOKENS),
  } as unknown as AuthService;
  const tenants = { provision: jest.fn() } as unknown as TenantsService;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter(service, tenants));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("APP_BASE_PATH", () => {
  const original = process.env.APP_BASE_PATH;

  afterEach(() => {
    if (original === undefined) delete process.env.APP_BASE_PATH;
    else process.env.APP_BASE_PATH = original;
    jest.resetModules();
  });

  async function leerBase(valor: string | undefined): Promise<string> {
    if (valor === undefined) delete process.env.APP_BASE_PATH;
    else process.env.APP_BASE_PATH = valor;
    jest.resetModules();
    const { env } = await import("@/config/env");
    return env.APP_BASE_PATH;
  }

  it("vacío en la raíz del host", async () => {
    await expect(leerBase(undefined)).resolves.toBe("");
    await expect(leerBase("")).resolves.toBe("");
    await expect(leerBase("/")).resolves.toBe("");
  });

  it("normaliza a una barra inicial y ninguna final, venga como venga", async () => {
    await expect(leerBase("m2props")).resolves.toBe("/m2props");
    await expect(leerBase("/m2props")).resolves.toBe("/m2props");
    await expect(leerBase("/m2props/")).resolves.toBe("/m2props");
    await expect(leerBase("  //m2props//  ")).resolves.toBe("/m2props");
  });
});

describe("cookie de refresh bajo un subpath", () => {
  const original = process.env.APP_BASE_PATH;

  afterEach(() => {
    if (original === undefined) delete process.env.APP_BASE_PATH;
    else process.env.APP_BASE_PATH = original;
    jest.resetModules();
  });

  async function cookieDeLogin(): Promise<string> {
    process.env.APP_BASE_PATH = "/m2props";
    jest.resetModules();
    const { createAuthRouter, REFRESH_COOKIE } = await import("@/modules/auth/auth.router");
    const res = await request(appDeAuth(createAuthRouter))
      .post("/api/auth/login")
      .send({ email: "agente@inmo.com", password: "secreto-123" });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toContain(`${REFRESH_COOKIE}=refresh-abc`);
    return res.headers["set-cookie"]?.[0] ?? "";
  }

  it("el Path acompaña al subpath", async () => {
    // Sin esto el navegador no manda la cookie a /m2props/api/auth/refresh y la
    // sesión muere en el primer F5, aunque el login haya sido correcto.
    expect(await cookieDeLogin()).toContain("Path=/m2props/api/auth");
  });

  it("sigue siendo httpOnly y sameSite lax", async () => {
    const cookie = await cookieDeLogin();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("en la raíz del host el Path es /api/auth, como siempre", async () => {
    delete process.env.APP_BASE_PATH;
    jest.resetModules();
    const { createAuthRouter, REFRESH_COOKIE } = await import("@/modules/auth/auth.router");
    const res = await request(appDeAuth(createAuthRouter))
      .post("/api/auth/login")
      .send({ email: "agente@inmo.com", password: "secreto-123" });

    expect(res.headers["set-cookie"]?.[0]).toContain(`${REFRESH_COOKIE}=refresh-abc`);
    expect(res.headers["set-cookie"]?.[0]).toContain("Path=/api/auth");
  });
});
