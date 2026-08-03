import request from "supertest";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * Dominios propios (tarea 5.4, hasta donde se puede sin un servidor público) y
 * el endpoint que autoriza a Caddy a emitir un certificado.
 *
 * La regla que sostiene todo esto: el estado de un dominio sale siempre del
 * DNS, nunca de un botón. No hay endpoint para marcarlo activo a mano, ni
 * siquiera para el super admin — un dominio activo hace que `resolveTenant`
 * sirva la web de esa inmobiliaria en ese host.
 */
describe("alta de dominio propio", () => {
  it("el plan decide cuántos entran; con maxDomains 0 no entra ninguno", async () => {
    // El plan básico se sirve solo por slug y subdominio: el dominio propio es
    // parte de lo que se paga.
    // maxDomains 0 explícito aunque sea el default de la fábrica: lo que este
    // test afirma es el 0, y dejarlo implícito lo volvería verde por accidente
    // si mañana el default cambiara.
    await crearInmobiliariaCompleta("basica", { maxDomains: 0 });
    const token = await loguear(app, "admin@basica.test");

    const res = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(token))
      .send({ domain: "basica.com.ar" });

    // 402 y no 403: LimitExceededError es Payment Required a propósito, igual
    // que el tope de propiedades en properties.test.ts — el pedido está
    // permitido, lo que falta es pagar un plan que incluya dominio propio.
    expect(res.status).toBe(402);
    expect(await prisma.tenantDomain.count()).toBe(0);
  });

  it("un dominio nace pendiente de verificar, nunca activo", async () => {
    // Activarlo sin comprobar el DNS haría que resolveTenant sirva la web de
    // esa inmobiliaria en un host que puede no ser suyo. El alta no dispara
    // ninguna consulta DNS —eso lo hace POST /:id/verify— así que el estado
    // inicial es "pending" (el default del schema), no "verifying": ese es
    // el resultado de un chequeo sin registros, y acá todavía no se chequeó.
    await crearInmobiliariaCompleta("pro", { maxDomains: 1 });
    const token = await loguear(app, "admin@pro.test");

    const res = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(token))
      .send({ domain: "inmobiliariapro.com.ar" });

    expect(res.status).toBe(201);
    const guardado = await prisma.tenantDomain.findFirst();
    expect(guardado?.status).toBe("pending");
  });

  it("no hay endpoint para marcarlo activo a mano", async () => {
    await crearInmobiliariaCompleta("pro", { maxDomains: 1 });
    const token = await loguear(app, "admin@pro.test");

    const alta = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(token))
      .send({ domain: "inmobiliariapro.com.ar" });

    // domains.router.ts no define ningún PATCH: ni "/:id" ni ninguna otra
    // ruta lo acepta. Express no genera un 405 automático por método no
    // soportado — la request simplemente no matchea ninguna ruta y cae en el
    // notFoundHandler global, el mismo 404 que una URL inexistente.
    const res = await request(app)
      .patch(`/api/domains/${alta.body.domain.id}`)
      .set(...comoUsuario(token))
      .send({ status: "active" });

    expect(res.status).toBe(404);
    const guardado = await prisma.tenantDomain.findFirst();
    expect(guardado?.status).not.toBe("active");
  });

  it("un dominio ya reclamado por otra inmobiliaria devuelve 409", async () => {
    await crearInmobiliariaCompleta("pro", { maxDomains: 1 });
    await crearInmobiliariaCompleta("otra", { maxDomains: 1 });

    const tokenPro = await loguear(app, "admin@pro.test");
    await request(app)
      .post("/api/domains")
      .set(...comoUsuario(tokenPro))
      .send({ domain: "disputado.com.ar" });

    const tokenOtra = await loguear(app, "admin@otra.test");
    const res = await request(app)
      .post("/api/domains")
      .set(...comoUsuario(tokenOtra))
      .send({ domain: "disputado.com.ar" });

    expect(res.status).toBe(409);
    // Sigue habiendo un solo dominio con ese nombre: el índice único de la
    // base frenó el segundo insert, no lo dejó a medio hacer.
    expect(await prisma.tenantDomain.count({ where: { domain: "disputado.com.ar" } })).toBe(1);
  });
});

describe("endpoint que autoriza los certificados de Caddy", () => {
  const ask = (host: string, token = env.CADDY_ASK_TOKEN) =>
    request(app).get(`/api/internal/caddy/ask?token=${token}&domain=${host}`);

  it("un host que no es de nadie no recibe certificado", async () => {
    // Sin esto, cualquiera apunta su dominio a la IP del VPS y consume la cuota
    // de emisión de Let's Encrypt hasta dejar sin renovar a los clientes reales.
    const res = await ask("dominio-de-un-tercero.com");
    expect(res.status).toBe(403);
  });

  it("un dominio verificado sí lo recibe", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "active" },
    });

    const res = await ask("inmobiliariapro.com.ar");
    expect(res.status).toBe(200);
  });

  it("sin el token compartido no autoriza, aunque el dominio exista", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "active" },
    });

    const res = await ask("inmobiliariapro.com.ar", "token-equivocado");
    expect(res.status).toBe(403);
  });
});

describe("resolución por Host", () => {
  it("un dominio propio verificado sirve la web de su inmobiliaria", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantSiteConfig.create({
      data: { tenantId: tenant.id, isPublished: true },
    });
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "active" },
    });

    const res = await request(app)
      .get("/api/public/sites/current")
      .set("Host", "inmobiliariapro.com.ar");

    expect(res.status).toBe(200);
    expect(res.body.tenant.slug).toBe("pro");
  });

  it("un dominio sin verificar NO sirve ninguna web", async () => {
    // La regla dura: si no está verificado en tenant_domains, no hay web, ni
    // siquiera si el slug coincide con el dominio.
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantDomain.create({
      data: { tenantId: tenant.id, domain: "inmobiliariapro.com.ar", status: "verifying" },
    });

    const res = await request(app)
      .get("/api/public/sites/current")
      .set("Host", "inmobiliariapro.com.ar");

    expect(res.status).toBe(404);
  });

  it("una web sin publicar responde 404 igual que una inexistente", async () => {
    const { tenant } = await crearInmobiliariaCompleta("pro");
    await prisma.tenantSiteConfig.create({
      data: { tenantId: tenant.id, isPublished: false },
    });

    const res = await request(app).get("/api/public/sites/pro");
    expect(res.status).toBe(404);
  });
});
