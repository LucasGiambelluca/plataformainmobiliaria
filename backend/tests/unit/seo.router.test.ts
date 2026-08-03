import express from "express";
import request from "supertest";
import { createSeoRouter } from "@/modules/seo/seo.router";
import {
  PublicService,
  type PublicRepository,
  type SitemapEntry,
} from "@/modules/public/public.service";
import type { TenantResolverRepository } from "@/shared/middleware/resolveTenant";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

// PLATFORM_DOMAIN por defecto en env.ts es "plataforma.com": los hosts de las
// pruebas se eligen en función de eso.
const PROPIEDADES: SitemapEntry[] = [
  { path: "/propiedad/p1", updatedAt: new Date("2026-03-04T10:00:00Z") },
];
const INMOBILIARIAS: SitemapEntry[] = [
  { path: "/inmobiliaria/demo", updatedAt: new Date("2026-02-01T10:00:00Z") },
];

function makeApp(tenantPorHost: Record<string, { id: string; slug: string }> = {}) {
  const repo = {
    listProperties: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findPropertyById: jest.fn().mockResolvedValue(null),
    incrementViews: jest.fn().mockResolvedValue(undefined),
    listAgencies: jest.fn().mockResolvedValue([]),
    listCities: jest.fn().mockResolvedValue([]),
    listActivePlans: jest.fn().mockResolvedValue([]),
    listSitemapProperties: jest.fn().mockResolvedValue(PROPIEDADES),
    listSitemapAgencies: jest.fn().mockResolvedValue(INMOBILIARIAS),
  } satisfies PublicRepository;

  const resolverRepo: TenantResolverRepository = {
    findActiveBySlug: jest.fn(async (slug: string) => tenantPorHost[slug] ?? null),
    findActiveByVerifiedDomain: jest.fn(
      async (domain: string) => tenantPorHost[domain] ?? null,
    ),
  };

  const app = express();
  app.use(createSeoRouter(new PublicService(repo), resolverRepo));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo };
}

describe("sitemap.xml", () => {
  it("en el portal lista las páginas fijas, las inmobiliarias y las propiedades", async () => {
    const { app, repo } = makeApp();

    const res = await request(app).get("/sitemap.xml").set("Host", "plataforma.com");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("xml");
    expect(res.text).toContain("<loc>http://plataforma.com/</loc>");
    expect(res.text).toContain("<loc>http://plataforma.com/buscar</loc>");
    expect(res.text).toContain("<loc>http://plataforma.com/inmobiliarias</loc>");
    expect(res.text).toContain("<loc>http://plataforma.com/inmobiliaria/demo</loc>");
    expect(res.text).toContain("<loc>http://plataforma.com/propiedad/p1</loc>");
    // Sin tenant: el catálogo entero.
    expect(repo.listSitemapProperties).toHaveBeenCalledWith(undefined);
  });

  it("en el dominio propio de una inmobiliaria lista solo sus propiedades", async () => {
    // Publicar el catálogo entero bajo el dominio de un cliente sería contenido
    // duplicado, y encima de otras inmobiliarias.
    const { app, repo } = makeApp({
      "inmobiliarianorte.com.ar": { id: "t1", slug: "norte" },
    });

    const res = await request(app)
      .get("/sitemap.xml")
      .set("Host", "inmobiliarianorte.com.ar");

    expect(res.status).toBe(200);
    expect(repo.listSitemapProperties).toHaveBeenCalledWith("t1");
    expect(repo.listSitemapAgencies).not.toHaveBeenCalled();
    expect(res.text).toContain("<loc>http://inmobiliarianorte.com.ar/</loc>");
    expect(res.text).not.toContain("/inmobiliarias<");
    expect(res.text).not.toContain("/inmobiliaria/demo");
  });

  it("el subdominio de una inmobiliaria se resuelve igual que su dominio propio", async () => {
    const { app, repo } = makeApp({ demo: { id: "t2", slug: "demo" } });

    const res = await request(app)
      .get("/sitemap.xml")
      .set("Host", "demo.plataforma.com");

    expect(res.status).toBe(200);
    expect(repo.listSitemapProperties).toHaveBeenCalledWith("t2");
  });

  it("un host desconocido responde el sitemap del portal en vez de 404", async () => {
    // El resolutor va en modo opcional: sin tenant el portal tiene que seguir
    // sirviendo su sitemap.
    const { app, repo } = makeApp();

    const res = await request(app).get("/sitemap.xml").set("Host", "cualquiera.test");

    expect(res.status).toBe(200);
    expect(repo.listSitemapProperties).toHaveBeenCalledWith(undefined);
  });

  it("escapa el host en las URLs", async () => {
    // El Host lo elige quien hace el pedido: sin escapar, rompe el documento.
    const { app } = makeApp();

    const res = await request(app).get("/sitemap.xml").set("Host", 'a"<b>.test');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<loc>http://a"<b>');
    expect(res.text).toContain("&quot;&lt;b&gt;");
  });
});

describe("robots.txt", () => {
  it("bloquea los paneles y la API, y apunta al sitemap del mismo host", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/robots.txt").set("Host", "plataforma.com");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("Disallow: /panel/");
    expect(res.text).toContain("Disallow: /admin/");
    expect(res.text).toContain("Disallow: /api/");
    expect(res.text).toContain("Sitemap: http://plataforma.com/sitemap.xml");
  });

  it("el sitemap que declara es el del host del pedido, no el del portal", async () => {
    const { app } = makeApp({ "inmobiliarianorte.com.ar": { id: "t1", slug: "norte" } });

    const res = await request(app)
      .get("/robots.txt")
      .set("Host", "inmobiliarianorte.com.ar");

    expect(res.text).toContain("Sitemap: http://inmobiliarianorte.com.ar/sitemap.xml");
  });
});
