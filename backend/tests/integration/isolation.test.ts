import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPropiedad } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * El riesgo crítico del proyecto: que una inmobiliaria vea o toque datos de
 * otra. Todo lo de acá corre contra la base real, con dos inmobiliarias
 * cargadas de verdad.
 *
 * La regla que se verifica en cada caso es la misma: pedir un recurso ajeno
 * devuelve 404, no 403. Un 403 confirmaría que el recurso existe, y saber que
 * la propiedad X existe ya es filtrar información de la competencia.
 *
 * Cada caso afirma además lo propio, no solo la ausencia de lo ajeno: un
 * listado vacío pasaría igual si el endpoint estuviera roto y no devolviera
 * nada nunca, y ese test no probaría el aislamiento sino la nada.
 */
describe("aislamiento entre inquilinos", () => {
  let tokenNorte: string;
  let propiedadDeSur: string;
  let tenantNorteId: string;
  let tenantSurId: string;

  // En beforeEach y no en beforeAll: el truncate de setup-db.ts corre en
  // beforeEach, y Jest lanza todos los beforeAll antes del primer beforeEach.
  beforeEach(async () => {
    const norte = await crearInmobiliariaCompleta("norte");
    const sur = await crearInmobiliariaCompleta("sur");
    tenantNorteId = norte.tenant.id;
    tenantSurId = sur.tenant.id;

    await crearPropiedad(norte.tenant.id, { title: "Casa del norte" });
    const ajena = await crearPropiedad(sur.tenant.id, { title: "Casa del sur" });
    propiedadDeSur = ajena.id;

    tokenNorte = await loguear(app, "admin@norte.test");
  });

  it("el listado solo trae las propiedades propias", async () => {
    const res = await request(app)
      .get("/api/properties")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe("Casa del norte");
  });

  it("leer una propiedad ajena devuelve 404, no 403", async () => {
    const res = await request(app)
      .get(`/api/properties/${propiedadDeSur}`)
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(404);
  });

  it("editar una propiedad ajena devuelve 404 y no la modifica", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadDeSur}`)
      .set(...comoUsuario(tokenNorte))
      .send({ title: "Secuestrada" });

    expect(res.status).toBe(404);

    const enBase = await prisma.property.findUnique({ where: { id: propiedadDeSur } });
    expect(enBase?.title).toBe("Casa del sur");
  });

  it("cambiar el estado de una propiedad ajena devuelve 404", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadDeSur}/status`)
      .set(...comoUsuario(tokenNorte))
      .send({ status: "paused" });

    expect(res.status).toBe(404);

    const enBase = await prisma.property.findUnique({ where: { id: propiedadDeSur } });
    expect(enBase?.status).toBe("published");
  });

  it("borrar una propiedad ajena devuelve 404 y la deja viva", async () => {
    const res = await request(app)
      .delete(`/api/properties/${propiedadDeSur}`)
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(404);
    expect(await prisma.property.findUnique({ where: { id: propiedadDeSur } })).not.toBeNull();
  });

  it("mandar el tenantId de otro en el body no cambia dónde se crea", async () => {
    // El tenantId sale del JWT: si el body pudiera pisarlo, cualquiera
    // publicaría en la web de la competencia.
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(tokenNorte))
      .send({
        tenantId: tenantSurId,
        title: "Intento de intrusión",
        propertyType: "house",
        operationType: "sale",
        price: "100000.00",
      });

    expect(res.status).toBe(201);

    const creada = await prisma.property.findFirst({
      where: { title: "Intento de intrusión" },
    });
    expect(creada?.tenantId).not.toBe(tenantSurId);
    expect(creada?.tenantId).toBe(tenantNorteId);
  });

  it("la bandeja de consultas solo muestra las propias", async () => {
    // Una consulta de cada lado: si solo hubiera la ajena, un endpoint roto
    // que nunca devuelve nada pasaría el test sin aislar nada.
    await prisma.inquiry.create({
      data: {
        tenantId: tenantSurId,
        propertyId: propiedadDeSur,
        name: "Consulta ajena",
        email: "alguien@test.com",
        message: "Me interesa la casa del sur.",
      },
    });
    await prisma.inquiry.create({
      data: {
        tenantId: tenantNorteId,
        name: "Consulta propia",
        email: "otro@test.com",
        message: "Me interesa la casa del norte.",
      },
    });

    const res = await request(app)
      .get("/api/inquiries")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("Consulta propia");
  });

  it("el equipo solo lista usuarios de la propia inmobiliaria", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    // Este endpoint devuelve `users`, no `items` como los paginados.
    const emails = res.body.users.map((u: { email: string }) => u.email);
    // El propio tiene que estar: sin esto, una lista vacía pasaría el for.
    expect(emails).toContain("admin@norte.test");
    for (const email of emails) {
      expect(email).not.toContain("@sur.test");
    }
  });

  it("la configuración del sitio que se lee es la propia", async () => {
    // La del vecino se siembra primero y es la única que existe al entrar: si
    // el endpoint tomara "la primera config que encuentre" en vez de la del
    // tenant del JWT, norte vería este hero y el test lo cazaría. Sin esta
    // fila el caso pasaría por no haber nada ajeno que confundir.
    await prisma.tenantSiteConfig.create({
      data: { tenantId: tenantSurId, heroTitle: "Hero del sur" },
    });

    // GET /api/site crea la config al vuelo (upsert) si el tenant todavía no
    // la tiene, así que la de norte nace acá. El slug sale del tenant dueño de
    // la config: es lo que delataría haber leído la del vecino.
    const res = await request(app)
      .get("/api/site")
      .set(...comoUsuario(tokenNorte));

    expect(res.status).toBe(200);
    expect(res.body.site.slug).toBe("norte");
    expect(res.body.site.tenantId).toBe(tenantNorteId);
    expect(res.body.site.heroTitle).toBeNull();

    // Y de paso: leer lo propio no le pisó nada a la de al lado.
    const ajena = await prisma.tenantSiteConfig.findUnique({
      where: { tenantId: tenantSurId },
    });
    expect(ajena?.heroTitle).toBe("Hero del sur");
  });
});
