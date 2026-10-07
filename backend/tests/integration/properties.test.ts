import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import {
  crearInmobiliariaCompleta,
  crearPlan,
  crearPropiedad,
  crearUsuario,
} from "./helpers/factories";
import { comoUsuario, loguear } from "./helpers/auth";

const app = createApp();

/**
 * CRUD de propiedades, transiciones de estado y el límite de plan que las
 * sostiene. Complementa a `isolation.test.ts`: ahí se prueba que lo ajeno da
 * 404; acá se prueba que lo propio funciona de verdad y que las reglas de
 * negocio del módulo —borrador por defecto, transiciones válidas, cupo del
 * plan— se cumplen.
 */

const NUEVA = {
  title: "Departamento 2 ambientes",
  propertyType: "apartment",
  operationType: "rent",
  price: "350000.00",
  currency: "ARS",
  city: "Paraná",
  rooms: 2,
};

describe("alta de propiedades", () => {
  let token: string;
  let tenantId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    tenantId = tenant.id;
    token = await loguear(app, "admin@norte.test");
  });

  it("nace en borrador aunque no se pida", async () => {
    // Publicar es una acción explícita: si el alta publicara sola, una carga a
    // medio terminar aparecería en el catálogo público.
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(201);
    expect(res.body.property.status).toBe("draft");

    const creada = await prisma.property.findFirst({ where: { tenantId } });
    expect(creada?.status).toBe("draft");
  });

  it("el precio se guarda como decimal exacto, sin pasar por float", async () => {
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send({ ...NUEVA, price: "189500.55" });

    expect(res.status).toBe(201);
    expect(res.body.property.price).toBe("189500.55");

    const creada = await prisma.property.findFirst({ where: { tenantId } });
    expect(creada?.price.toString()).toBe("189500.55");
  });

  it("rechaza un precio con formato de float", async () => {
    // El schema exige un string decimal (`priceSchema = z.string().regex(...)`):
    // mandar un número JS es justo el caso que se quiere impedir, porque un
    // float pierde precisión en operaciones aritméticas.
    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send({ ...NUEVA, price: 189500.55 });

    expect(res.status).toBe(422);
    expect(await prisma.property.count({ where: { tenantId } })).toBe(0);
  });

  it("sin token devuelve 401", async () => {
    const res = await request(app).post("/api/properties").send(NUEVA);
    expect(res.status).toBe(401);
  });
});

describe("edición de una propiedad propia", () => {
  // El control positivo de los 404 de `isolation.test.ts`: ahí se verifica que
  // editar una propiedad ajena no toca nada, pero sin este caso nadie verifica
  // que editar la propia sí funcione. Un endpoint que devolviera 404 siempre
  // pasaría todos los tests de aislamiento y ninguno de estos.
  let token: string;
  let propiedadId: string;
  let tenantId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    tenantId = tenant.id;
    propiedadId = (await crearPropiedad(tenant.id, { title: "Casa original" })).id;
    token = await loguear(app, "admin@norte.test");
  });

  it("editar la propia devuelve 200 y guarda el cambio", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}`)
      .set(...comoUsuario(token))
      .send({ title: "Casa renovada", rooms: 5 });

    expect(res.status).toBe(200);
    expect(res.body.property.title).toBe("Casa renovada");

    const enBase = await prisma.property.findUniqueOrThrow({
      where: { id: propiedadId },
    });
    expect(enBase.title).toBe("Casa renovada");
    expect(enBase.rooms).toBe(5);
  });

  it("un body vacío devuelve 422", async () => {
    // El schema lo rechaza a propósito (`.refine` de updatePropertySchema): un
    // PATCH sin campos es casi siempre un error del cliente, y aceptarlo
    // escondería el bug.
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}`)
      .set(...comoUsuario(token))
      .send({});

    expect(res.status).toBe(422);
  });

  it("borrar la propia devuelve 204 y la saca de la base", async () => {
    // El router responde `res.status(204).end()`: se pin-ea exacto en vez de
    // `toBeLessThan(300)`, que dejaría pasar un 200 con body si alguien lo
    // cambiara sin querer.
    const res = await request(app)
      .delete(`/api/properties/${propiedadId}`)
      .set(...comoUsuario(token));

    expect(res.status).toBe(204);
    expect(await prisma.property.count({ where: { tenantId } })).toBe(0);
  });
});

describe("transiciones de estado", () => {
  let token: string;
  let propiedadId: string;

  beforeEach(async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    const prop = await crearPropiedad(tenant.id, { status: "draft" });
    propiedadId = prop.id;
    token = await loguear(app, "admin@norte.test");
  });

  it("publicar un borrador lo hace visible", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}/status`)
      .set(...comoUsuario(token))
      .send({ status: "published" });

    expect(res.status).toBe(200);
    const enBase = await prisma.property.findUnique({ where: { id: propiedadId } });
    expect(enBase?.status).toBe("published");
  });

  it("un estado inventado devuelve 422", async () => {
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}/status`)
      .set(...comoUsuario(token))
      .send({ status: "vendida" });

    expect(res.status).toBe(422);

    // El 422 no alcanza: si el endpoint escribiera antes de validar Zod (no
    // debería, porque `validate` corre antes del handler), la propiedad
    // quedaría con un estado que ni siquiera existe en el enum.
    const enBase = await prisma.property.findUnique({ where: { id: propiedadId } });
    expect(enBase?.status).toBe("draft");
  });

  it("no se puede saltar de borrador a destacada", async () => {
    // `featured` ("super destacada") solo se alcanza desde `published`: no se
    // promociona algo que todavía no está visible.
    const res = await request(app)
      .patch(`/api/properties/${propiedadId}/status`)
      .set(...comoUsuario(token))
      .send({ status: "featured" });

    expect(res.status).toBe(400);
    const enBase = await prisma.property.findUnique({ where: { id: propiedadId } });
    expect(enBase?.status).toBe("draft");
  });
});

describe("límite de propiedades del plan", () => {
  it("al llegar al tope el alta se rechaza", async () => {
    // Es la regla que sostiene el modelo de negocio: sin esto, cualquiera
    // publica mil propiedades con el plan gratuito. LimitExceededError es 402
    // (Payment Required), no 403: el pedido está permitido, lo que falta es
    // pagar un plan más grande.
    const { tenant } = await crearInmobiliariaCompleta("tope", { maxProperties: 2 });
    const token = await loguear(app, "admin@tope.test");

    await crearPropiedad(tenant.id);
    await crearPropiedad(tenant.id);

    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(402);
    expect(await prisma.property.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  describe("plan pago vencido", () => {
    const DIA = 24 * 60 * 60 * 1000;

    /**
     * Inmobiliaria en un plan pago de 10 propiedades, con 1 cargada, y un
     * plan gratuito de 1. Lo único que cambia entre los casos es cuándo venció
     * el período: eso decide qué cupo rige.
     */
    async function vencidaHace(dias: number) {
      await crearPlan({ slug: "basico", priceAmount: "0", maxProperties: 1 });
      const { tenant, subscription } = await crearInmobiliariaCompleta("morosa", {
        maxProperties: 10,
      });
      await prisma.plan.update({
        where: { id: subscription.planId },
        data: { priceAmount: "29999" },
      });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "past_due", currentPeriodEnd: new Date(Date.now() - dias * DIA) },
      });
      await crearPropiedad(tenant.id);
      return loguear(app, "admin@morosa.test");
    }

    it("pasada la gracia rigen los cupos del plan gratuito", async () => {
      // C3 de AUDITORIA.md: antes, dejar de pagar no tenía consecuencia y la
      // inmobiliaria conservaba los cupos del plan pago para siempre.
      const token = await vencidaHace(10);

      const res = await request(app)
        .post("/api/properties")
        .set(...comoUsuario(token))
        .send(NUEVA);

      expect(res.status).toBe(402);
    });

    it("dentro de la gracia sigue rigiendo el plan pago", async () => {
      // Los reintentos de débito de MercadoPago tardan días: cortar el día
      // del vencimiento castigaría a quien sí va a pagar.
      const token = await vencidaHace(3);

      const res = await request(app)
        .post("/api/properties")
        .set(...comoUsuario(token))
        .send(NUEVA);

      expect(res.status).toBe(201);
    });
  });

  it("borrar una propiedad libera el cupo", async () => {
    const { tenant } = await crearInmobiliariaCompleta("tope", { maxProperties: 1 });
    const token = await loguear(app, "admin@tope.test");
    const primera = await crearPropiedad(tenant.id);

    const borrado = await request(app)
      .delete(`/api/properties/${primera.id}`)
      .set(...comoUsuario(token));
    expect(borrado.status).toBe(204);

    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(201);
  });
});

describe("permisos por rol", () => {
  it("un agente puede cargar propiedades", async () => {
    const { tenant } = await crearInmobiliariaCompleta("norte");
    await crearUsuario(tenant.id, { email: "agente@norte.test", role: "agent" });
    const token = await loguear(app, "agente@norte.test");

    const res = await request(app)
      .post("/api/properties")
      .set(...comoUsuario(token))
      .send(NUEVA);

    expect(res.status).toBe(201);
  });

  it("un agente no puede tocar la configuración del sitio", async () => {
    // /api/site solo autoriza a tenant_admin (sites.router.ts): cargar y editar
    // publicaciones es el trabajo diario de un agente, pero la identidad del
    // sitio público no.
    const { tenant } = await crearInmobiliariaCompleta("norte");
    await crearUsuario(tenant.id, { email: "agente@norte.test", role: "agent" });
    const token = await loguear(app, "agente@norte.test");

    const res = await request(app)
      .patch("/api/site")
      .set(...comoUsuario(token))
      .send({ heroTitle: "Cambiado por un agente" });

    expect(res.status).toBe(403);
  });

  it("un tenant_admin no entra al panel global", async () => {
    // /api/admin/tenants exige super_admin: un tenant_admin es dueño de SU
    // inmobiliaria, no de la plataforma entera.
    await crearInmobiliariaCompleta("norte");
    const token = await loguear(app, "admin@norte.test");

    const res = await request(app)
      .get("/api/admin/tenants")
      .set(...comoUsuario(token));

    expect(res.status).toBe(403);
  });
});
