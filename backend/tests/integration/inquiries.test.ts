import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPropiedad } from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * Alta pública de consultas (leads) y bandeja de la inmobiliaria.
 *
 * Las dos reglas que gobiernan el módulo: el tenantId sale siempre de la
 * propiedad consultada, nunca del body —el endpoint es público y sin login,
 * así que si el body pudiera fijarlo cualquiera llenaría la bandeja de la
 * competencia—; y un correo caído nunca puede costar un lead —es la plata del
 * cliente—.
 */
const CONSULTA = {
  name: "Juan Pérez",
  email: "juan@test.com",
  phone: "0343 400-0000",
  message: "Me interesa la propiedad, ¿sigue disponible?",
};

describe("alta pública de consultas", () => {
  let propiedadVisible: string;
  let propiedadBorrador: string;
  let tenantId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    tenantId = tenant.id;
    propiedadVisible = (await crearPropiedad(tenant.id, { status: "published" })).id;
    propiedadBorrador = (await crearPropiedad(tenant.id, { status: "draft" })).id;
  });

  it("guarda la consulta sin login", async () => {
    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send(CONSULTA);

    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(1);
  });

  it("el tenantId sale de la propiedad, nunca del body", async () => {
    // Si viniera del body, cualquiera llenaría la bandeja de la competencia.
    const otra = await crearInmobiliariaCompleta("sur");

    await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send({ ...CONSULTA, tenantId: otra.tenant.id });

    const guardada = await prisma.inquiry.findFirst();
    expect(guardada?.tenantId).toBe(tenantId);
  });

  it("no se puede consultar por una propiedad en borrador", async () => {
    // Mismo 404 que el catálogo público: conocer el id de un borrador no
    // alcanza para generarle consultas a la inmobiliaria.
    const res = await request(app)
      .post(`/api/public/properties/${propiedadBorrador}/inquiries`)
      .send(CONSULTA);

    expect(res.status).toBe(404);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it("el honeypot responde 201 al bot pero no guarda nada", async () => {
    // 201 y no 422 a propósito: un 422 le avisaría al bot qué campo lo delató.
    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send({ ...CONSULTA, website: "http://spam.test" });

    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(0);
  });

  it("un mensaje demasiado corto devuelve 422", async () => {
    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send({ ...CONSULTA, message: "hola" });

    expect(res.status).toBe(422);
  });

  it("una consulta se guarda aunque el proveedor de correo esté caído", async () => {
    // El proveedor fake no falla solo, así que se fuerza la falla en el punto
    // real donde vive: EmailProvider.send. NotificationsService.enviar()
    // (notifications.service.ts) la atrapa ahí adentro y nunca la deja llegar
    // a quien llamó a leadRecibido. Mockear leadRecibido directamente
    // saltearía esa protección en vez de probarla: comprobado a mano, eso da
    // 500 y no 201, porque inquiries.service.ts no envuelve el aviso en su
    // propio try/catch — confía en que el Notifier nunca rechaza. El punto
    // real que CLAUDE.md promete blindado es el proveedor de correo, no
    // cualquier fallo posible del propio Notifier.
    const { emailProvider } = await import("@/shared/services/email");
    const spy = jest
      .spyOn(emailProvider, "send")
      .mockRejectedValue(new Error("proveedor de correo caído"));

    const res = await request(app)
      .post(`/api/public/properties/${propiedadVisible}/inquiries`)
      .send(CONSULTA);

    expect(res.status).toBe(201);
    expect(await prisma.inquiry.count()).toBe(1);
    spy.mockRestore();
  });
});

describe("bandeja de la inmobiliaria", () => {
  it("el agente ve las consultas, con el contador de nuevas, y puede cambiarles el estado", async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    const prop = await crearPropiedad(tenant.id, { status: "published" });
    await request(app).post(`/api/public/properties/${prop.id}/inquiries`).send(CONSULTA);

    const token = await loguear(app, "admin@norte.test");

    const lista = await request(app)
      .get("/api/inquiries")
      .set(...comoUsuario(token));
    expect(lista.status).toBe(200);
    expect(lista.body.items).toHaveLength(1);
    // El badge del panel se arma con esto: nace "new" y todavía no se leyó.
    expect(lista.body.newCount).toBe(1);

    const id = lista.body.items[0].id;
    const cambio = await request(app)
      .patch(`/api/inquiries/${id}`)
      .set(...comoUsuario(token))
      .send({ status: "contacted" });

    expect(cambio.status).toBe(200);

    const enBase = await prisma.inquiry.findUniqueOrThrow({ where: { id } });
    expect(enBase.status).toBe("contacted");
  });

  it("cambiar el estado de una consulta ajena devuelve 404 y no la modifica", async () => {
    // El complemento en escritura de "la bandeja de consultas solo muestra las
    // propias" de isolation.test.ts: ahí se prueba que norte no LEE la
    // consulta de sur; acá que norte tampoco puede ESCRIBIRLE. Marcar como
    // cerrado un lead de la competencia es la versión dañina de esto.
    await crearInmobiliariaCompleta("norte");
    const sur = await crearInmobiliariaCompleta("sur");
    const propDeSur = await crearPropiedad(sur.tenant.id, { status: "published" });
    const consultaDeSur = await prisma.inquiry.create({
      data: {
        tenantId: sur.tenant.id,
        propertyId: propDeSur.id,
        name: "Consulta del sur",
        email: "alguien@test.com",
        message: "Me interesa la casa del sur.",
      },
    });

    const tokenNorte = await loguear(app, "admin@norte.test");

    const res = await request(app)
      .patch(`/api/inquiries/${consultaDeSur.id}`)
      .set(...comoUsuario(tokenNorte))
      .send({ status: "contacted" });

    expect(res.status).toBe(404);

    // El 404 no alcanza: si el endpoint escribiera antes de chequear la
    // pertenencia, respondería igual y el daño ya estaría hecho.
    const enBase = await prisma.inquiry.findUnique({ where: { id: consultaDeSur.id } });
    expect(enBase?.status).toBe("new");
  });
});
