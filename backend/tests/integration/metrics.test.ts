import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import {
  crearInmobiliariaCompleta,
  crearPropiedad,
  crearUsuario,
} from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * Las métricas de una inmobiliaria tienen que contar SOLO lo suyo.
 *
 * Acá no hay id ajeno que pedir —el tenant sale del token—, así que lo que se
 * verifica no es un 404 sino un número: si un agregado se olvida el tenantId,
 * el endpoint responde 200 con los totales de toda la plataforma y cada
 * inmobiliaria se entera de cuánto mueve la competencia.
 */
describe("métricas por inmobiliaria", () => {
  let tokenNorte: string;

  beforeEach(async () => {
    const norte = await crearInmobiliariaCompleta("norte");
    const sur = await crearInmobiliariaCompleta("sur");

    // Cantidades distintas a propósito: con una y una, un agregado roto daría
    // 2 y se confundiría con cualquier otro error de conteo.
    await crearPropiedad(norte.tenant.id, { title: "Única del norte" });
    for (const i of [1, 2, 3]) {
      await crearPropiedad(sur.tenant.id, { title: `Del sur ${i}` });
    }

    // Norte no tiene ninguna consulta: su total tiene que ser 0, no 4.
    await prisma.inquiry.createMany({
      data: [1, 2, 3, 4].map((i) => ({
        tenantId: sur.tenant.id,
        name: `Consulta ajena ${i}`,
        email: `alguien${i}@test.com`,
        message: "Me interesa una propiedad del sur.",
      })),
    });

    tokenNorte = await loguear(app, "admin@norte.test");
  });

  it("cuenta solo las propiedades propias", async () => {
    const res = await request(app)
      .get("/api/metrics")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    // 1, no 4: si diera 4 el agregado está contando toda la plataforma.
    expect(res.body.metrics.properties.total).toBe(1);
  });

  it("cuenta solo las consultas propias", async () => {
    const res = await request(app)
      .get("/api/metrics")
      .set(...comoUsuario(tokenNorte));

    expect(res.body.metrics.inquiries.total).toBe(0);
  });

  it("las propiedades más vistas son todas propias", async () => {
    const res = await request(app)
      .get("/api/metrics")
      .set(...comoUsuario(tokenNorte));

    const titulos = res.body.metrics.topProperties.map(
      (p: { title: string }) => p.title,
    );
    expect(titulos).toContain("Única del norte");
    for (const t of titulos) {
      expect(t).not.toContain("Del sur");
    }
  });

  it("un agente ve las métricas de su inmobiliaria", async () => {
    // El endpoint lo comparten tenant_admin y agent: si el rol se restringiera
    // de más, el dashboard del agente quedaría vacío sin que nadie se entere.
    const { tenant } = await crearInmobiliariaCompleta("tercera");
    await crearUsuario(tenant.id, { email: "agente@tercera.test", role: "agent" });

    const token = await loguear(app, "agente@tercera.test");
    const res = await request(app)
      .get("/api/metrics")
      .set(...comoUsuario(token));

    expect(res.status).toBe(200);
  });

  it("las métricas globales son solo del super admin", async () => {
    const res = await request(app)
      .get("/api/admin/metrics")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(403);
  });
});
