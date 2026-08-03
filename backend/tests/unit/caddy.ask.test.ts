import express from "express";
import request from "supertest";
import { createCaddyRouter } from "@/modules/domains/caddy.router";
import {
  CaddyAskService,
  type CertificateAuthorizationRepository,
} from "@/modules/domains/caddy.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

const TOKEN = "b7f3a1c9d2e84f0a5b6c7d8e9f0a1b2c";
const PLATFORM = "plataforma.com";

/** Zona de prueba: una inmobiliaria activa y tres dominios propios. */
function makeRepo(
  overrides: Partial<CertificateAuthorizationRepository> = {},
): CertificateAuthorizationRepository {
  return {
    hasActiveTenantWithSlug: jest.fn(async (slug: string) => slug === "litoral"),
    hasCertifiableDomain: jest.fn(
      async (domain: string) =>
        domain === "litoral.com.ar" || domain === "propagando.com.ar",
    ),
    ...overrides,
  };
}

function makeApp(
  repo: CertificateAuthorizationRepository = makeRepo(),
  askToken = TOKEN,
) {
  const service = new CaddyAskService(repo, {
    platformDomain: PLATFORM,
    askToken,
  });
  const app = express();
  app.use("/api/internal/caddy", createCaddyRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo };
}

/** Lo mismo que hace Caddy: GET con el token y el host que quiere certificar. */
const ask = (app: express.Express, domain: string, token: string | null = TOKEN) =>
  request(app)
    .get("/api/internal/caddy/ask")
    .query({ ...(token === null ? {} : { token }), domain });

describe("autorización de certificados para Caddy", () => {
  describe("el token", () => {
    it("sin token no autoriza ni un host válido", async () => {
      const { app } = makeApp();
      expect((await ask(app, PLATFORM, null)).status).toBe(403);
    });

    it("con el token equivocado tampoco", async () => {
      const { app } = makeApp();
      expect((await ask(app, PLATFORM, "no-es-el-token")).status).toBe(403);
    });

    it("un token de otro largo no rompe la comparación", async () => {
      // timingSafeEqual explota si los buffers miden distinto: hay que
      // cortar antes, no dejar que tire una excepción.
      const { app } = makeApp();
      expect((await ask(app, PLATFORM, "corto")).status).toBe(403);
    });

    it("sin CADDY_ASK_TOKEN configurado no autoriza nada", async () => {
      // Falla cerrado a propósito: con el token vacío, un atacante que mande
      // ?token= vacío entraría a autorizar cualquier dominio.
      const { app } = makeApp(makeRepo(), "");
      expect((await ask(app, PLATFORM, "")).status).toBe(403);
      expect((await ask(app, "litoral.com.ar", "")).status).toBe(403);
    });
  });

  describe("hosts de la plataforma", () => {
    it("autoriza el dominio de la plataforma", async () => {
      const { app } = makeApp();
      expect((await ask(app, PLATFORM)).status).toBe(200);
    });

    it("autoriza www y el cdn", async () => {
      const { app } = makeApp();
      expect((await ask(app, `www.${PLATFORM}`)).status).toBe(200);
      expect((await ask(app, `cdn.${PLATFORM}`)).status).toBe(200);
    });

    it("autoriza el subdominio de una inmobiliaria activa", async () => {
      const { app } = makeApp();
      expect((await ask(app, `litoral.${PLATFORM}`)).status).toBe(200);
    });

    it("rechaza el subdominio de una inmobiliaria que no existe", async () => {
      const { app } = makeApp();
      expect((await ask(app, `noexiste.${PLATFORM}`)).status).toBe(403);
    });

    it("rechaza un subdominio de dos niveles", async () => {
      // "a.litoral.plataforma.com" no es la inmobiliaria "a.litoral".
      const { app } = makeApp();
      expect((await ask(app, `a.litoral.${PLATFORM}`)).status).toBe(403);
    });
  });

  describe("dominios propios", () => {
    it("autoriza un dominio cargado y verificado", async () => {
      const { app } = makeApp();
      expect((await ask(app, "litoral.com.ar")).status).toBe(200);
    });

    it("autoriza el www de un dominio cargado pelado", async () => {
      // Nadie carga las dos variantes, y resolveTenant ya sirve el www.
      const { app } = makeApp();
      expect((await ask(app, "www.litoral.com.ar")).status).toBe(200);
    });

    it("rechaza un dominio que nadie cargó", async () => {
      const { app } = makeApp();
      expect((await ask(app, "dominio-ajeno.com")).status).toBe(403);
    });

    it("rechaza aunque el atacante apunte su dominio al VPS", async () => {
      // Es el caso que justifica todo el endpoint: sin esto, Caddy pediría un
      // certificado para cualquier host que resuelva a esta IP y agotaría la
      // cuota semanal de Let's Encrypt.
      const { app, repo } = makeApp();
      const res = await ask(app, "sitio-de-un-tercero.io");

      expect(res.status).toBe(403);
      expect(repo.hasCertifiableDomain).toHaveBeenCalledWith("sitio-de-un-tercero.io");
    });
  });

  describe("normalización del host", () => {
    it("ignora mayúsculas, puerto y punto final", async () => {
      const { app } = makeApp();
      expect((await ask(app, "Litoral.COM.ar:443")).status).toBe(200);
      expect((await ask(app, "litoral.com.ar.")).status).toBe(200);
    });

    it("sin dominio no autoriza", async () => {
      const { app } = makeApp();
      expect((await ask(app, "")).status).toBe(403);
    });

    it("no consulta la base por un host vacío", async () => {
      const { app, repo } = makeApp();
      await ask(app, "");
      expect(repo.hasCertifiableDomain).not.toHaveBeenCalled();
      expect(repo.hasActiveTenantWithSlug).not.toHaveBeenCalled();
    });
  });

  it("nunca devuelve un cuerpo: Caddy solo mira el código", async () => {
    const { app } = makeApp();
    const permitido = await ask(app, PLATFORM);
    const denegado = await ask(app, "dominio-ajeno.com");

    expect(permitido.text).toBe("");
    expect(denegado.text).toBe("");
  });
});
