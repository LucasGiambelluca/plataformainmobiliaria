import express from "express";
import request from "supertest";
import {
  createResolveTenant,
  subdominioDe,
  type TenantResolverRepository,
} from "@/shared/middleware/resolveTenant";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

const TENANT = { id: "t-1", slug: "demo" };

// PLATFORM_DOMAIN por defecto en tests (config/env.ts): plataforma.com
const PLATFORM = "plataforma.com";

function makeRepo(overrides: Partial<TenantResolverRepository> = {}) {
  const repo: TenantResolverRepository = {
    findActiveBySlug: jest.fn().mockResolvedValue(TENANT),
    findActiveByVerifiedDomain: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return repo;
}

function makeApp(repo: TenantResolverRepository, options = {}) {
  const app = express();
  // Dos montajes: uno con slug en la ruta y otro que resuelve por host.
  app.get("/sitios/:slug", createResolveTenant(repo, options), (req, res) => {
    res.json({ resolved: req.resolvedTenant, tenantId: req.tenantId });
  });
  app.get("/actual", createResolveTenant(repo, options), (req, res) => {
    res.json({ resolved: req.resolvedTenant, tenantId: req.tenantId });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("subdominioDe", () => {
  it("extrae el subdominio del dominio de la plataforma", () => {
    expect(subdominioDe("demo.plataforma.com", PLATFORM)).toBe("demo");
  });

  it("el dominio pelado no es un tenant", () => {
    expect(subdominioDe("plataforma.com", PLATFORM)).toBeNull();
  });

  it("www no es un tenant", () => {
    // Sin esta guarda, entrar a www.plataforma.com buscaría la inmobiliaria "www".
    expect(subdominioDe("www.plataforma.com", PLATFORM)).toBeNull();
  });

  it("api y admin tampoco", () => {
    expect(subdominioDe("api.plataforma.com", PLATFORM)).toBeNull();
    expect(subdominioDe("admin.plataforma.com", PLATFORM)).toBeNull();
  });

  it("solo acepta un nivel de subdominio", () => {
    expect(subdominioDe("a.b.plataforma.com", PLATFORM)).toBeNull();
  });

  it("un dominio ajeno no se confunde con la plataforma", () => {
    expect(subdominioDe("demo.otraplataforma.com", PLATFORM)).toBeNull();
    // Ojo con el sufijo: "malaplataforma.com" termina en "plataforma.com"
    // como texto, pero no cuelga de él.
    expect(subdominioDe("malaplataforma.com", PLATFORM)).toBeNull();
  });
});

describe("createResolveTenant", () => {
  it("resuelve por el slug de la ruta", async () => {
    const repo = makeRepo();
    const res = await request(makeApp(repo)).get("/sitios/demo");

    expect(res.status).toBe(200);
    expect(res.body.resolved).toEqual({ ...TENANT, source: "slug" });
    expect(res.body.tenantId).toBe("t-1");
    expect(repo.findActiveBySlug).toHaveBeenCalledWith("demo");
  });

  it("normaliza el slug a minúsculas", async () => {
    const repo = makeRepo();
    await request(makeApp(repo)).get("/sitios/DEMO");
    expect(repo.findActiveBySlug).toHaveBeenCalledWith("demo");
  });

  it("resuelve por subdominio cuando no hay slug en la ruta", async () => {
    const repo = makeRepo();
    const res = await request(makeApp(repo))
      .get("/actual")
      .set("Host", "demo.plataforma.com");

    expect(res.body.resolved).toEqual({ ...TENANT, source: "subdomain" });
  });

  it("ignora el puerto del host", async () => {
    const repo = makeRepo();
    const res = await request(makeApp(repo))
      .get("/actual")
      .set("Host", "demo.plataforma.com:5173");

    expect(res.body.resolved.source).toBe("subdomain");
  });

  it("resuelve un dominio propio contra tenant_domains", async () => {
    const repo = makeRepo({
      findActiveByVerifiedDomain: jest.fn().mockResolvedValue(TENANT),
    });
    const res = await request(makeApp(repo))
      .get("/actual")
      .set("Host", "www.inmobiliarianorte.com");

    expect(res.body.resolved).toEqual({ ...TENANT, source: "custom_domain" });
    expect(repo.findActiveByVerifiedDomain).toHaveBeenCalledWith(
      "www.inmobiliarianorte.com",
    );
  });

  it("un dominio propio no se resuelve por slug", async () => {
    // Si buscara por slug, cualquiera apuntando su dominio al servidor se
    // quedaría con la web de la inmobiliaria que adivine el nombre.
    const repo = makeRepo();
    await request(makeApp(repo)).get("/actual").set("Host", "otrodominio.com");

    expect(repo.findActiveBySlug).not.toHaveBeenCalled();
  });

  it("inmobiliaria inexistente o inactiva → 404", async () => {
    const repo = makeRepo({ findActiveBySlug: jest.fn().mockResolvedValue(null) });
    const res = await request(makeApp(repo)).get("/sitios/fantasma");

    expect(res.status).toBe(404);
  });

  it("con required false deja pasar sin tenant", async () => {
    const repo = makeRepo({ findActiveBySlug: jest.fn().mockResolvedValue(null) });
    const res = await request(makeApp(repo, { required: false })).get("/sitios/fantasma");

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBeUndefined();
  });
});
