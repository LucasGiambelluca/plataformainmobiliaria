import express from "express";
import request from "supertest";
import {
  createInquiriesRouter,
  createPublicInquiriesRouter,
} from "@/modules/inquiries/inquiries.router";
import {
  InquiriesService,
  type InquiriesRepository,
  type InquiryRecord,
} from "@/modules/inquiries/inquiries.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { signAccessToken } from "@/shared/services/jwt.service";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const OTRO_TENANT = "44444444-4444-4444-4444-444444444444";
const PROPERTY_ID = "55555555-5555-5555-5555-555555555555";
const INQUIRY_ID = "66666666-6666-6666-6666-666666666666";

const INQUIRY: InquiryRecord = {
  id: INQUIRY_ID,
  tenantId: TENANT_ID,
  propertyId: PROPERTY_ID,
  name: "Martín Pérez",
  email: "martin@correo.com",
  phone: null,
  message: "Me interesa la propiedad, ¿podemos coordinar una visita?",
  status: "new",
  createdAt: new Date("2026-07-28"),
  propertyTitle: "Casa 3 ambientes",
};

const BODY = {
  name: "Martín Pérez",
  email: "MARTIN@correo.com",
  message: "Me interesa la propiedad, ¿podemos coordinar una visita?",
};

function makeRepo(overrides: Partial<InquiriesRepository> = {}) {
  const repo: InquiriesRepository = {
    findPublicProperty: jest
      .fn()
      .mockResolvedValue({ id: PROPERTY_ID, tenantId: TENANT_ID, title: "Casa" }),
    findNotificationTarget: jest
      .fn()
      .mockResolvedValue({ email: "inmo@correo.com", agencyName: "Inmobiliaria Demo" }),
    createInquiry: jest.fn().mockResolvedValue(INQUIRY),
    list: jest.fn().mockResolvedValue({ items: [INQUIRY], total: 1 }),
    countNew: jest.fn().mockResolvedValue(1),
    findById: jest.fn().mockResolvedValue(INQUIRY),
    updateStatus: jest.fn().mockResolvedValue({ ...INQUIRY, status: "contacted" }),
    ...overrides,
  };
  return repo;
}

function makeApp(repo: InquiriesRepository) {
  // Notificador espía: verifica el aviso sin mandar un solo correo.
  const notifier = {
    leadRecibido: jest.fn().mockResolvedValue(undefined),
    inmobiliariaCreada: jest.fn().mockResolvedValue(undefined),
    pagoConfirmado: jest.fn().mockResolvedValue(undefined),
    pagoFallido: jest.fn().mockResolvedValue(undefined),
  };
  const service = new InquiriesService(repo, notifier, "https://app.test/panel/leads");
  const app = express();
  app.use(express.json());
  app.use(
    "/api/public/properties/:propertyId/inquiries",
    createPublicInquiriesRouter(service),
  );
  app.use("/api/inquiries", createInquiriesRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo, notifier };
}

const adminToken = () =>
  signAccessToken({ sub: "u1", tenant: TENANT_ID, role: "tenant_admin" });
const agentToken = () =>
  signAccessToken({ sub: "u2", tenant: TENANT_ID, role: "agent" });
const superAdminToken = () =>
  signAccessToken({ sub: "sa", tenant: null, role: "super_admin" });

const post = (app: express.Express, body: Record<string, unknown>) =>
  request(app).post(`/api/public/properties/${PROPERTY_ID}/inquiries`).send(body);

describe("alta pública de consultas", () => {
  it("un visitante sin login puede consultar", async () => {
    const { app } = makeApp(makeRepo());
    const res = await post(app, BODY);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it("el tenant sale de la propiedad, nunca del cliente", async () => {
    // Si se aceptara del body, cualquiera podría escribir en la bandeja de
    // otra inmobiliaria.
    const { app, repo } = makeApp(makeRepo());

    await post(app, { ...BODY, tenantId: OTRO_TENANT, propertyId: "otra" });

    const [data] = (repo.createInquiry as jest.Mock).mock.calls[0];
    expect(data.tenantId).toBe(TENANT_ID);
    expect(data.propertyId).toBe(PROPERTY_ID);
  });

  it("no se puede consultar sobre una propiedad no visible", async () => {
    // Un borrador o una propiedad de inmobiliaria suspendida no existen para
    // el público, ni siquiera conociendo el id.
    const { app, repo } = makeApp(
      makeRepo({ findPublicProperty: jest.fn().mockResolvedValue(null) }),
    );

    const res = await post(app, BODY);

    expect(res.status).toBe(404);
    expect(repo.createInquiry).not.toHaveBeenCalled();
  });

  it("normaliza el email a minúsculas", async () => {
    const { app, repo } = makeApp(makeRepo());
    await post(app, BODY);

    const [data] = (repo.createInquiry as jest.Mock).mock.calls[0];
    expect(data.email).toBe("martin@correo.com");
  });

  it("mensaje demasiado corto → 422", async () => {
    const { app, repo } = makeApp(makeRepo());
    const res = await post(app, { ...BODY, message: "hola" });

    expect(res.status).toBe(422);
    expect(repo.createInquiry).not.toHaveBeenCalled();
  });

  it("email inválido → 422", async () => {
    const { app } = makeApp(makeRepo());
    expect((await post(app, { ...BODY, email: "no-es-un-mail" })).status).toBe(422);
  });

  it("mensaje kilométrico → 422", async () => {
    const { app } = makeApp(makeRepo());
    const res = await post(app, { ...BODY, message: "a".repeat(2100) });
    expect(res.status).toBe(422);
  });

  it("el honeypot descarta al bot sin decirle por qué", async () => {
    const { app, repo } = makeApp(makeRepo());

    const res = await post(app, { ...BODY, website: "http://spam.com" });

    // Respuesta idéntica a un alta buena: un 422 le avisaría que lo detectamos
    // y probaría de nuevo sin ese campo.
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(repo.createInquiry).not.toHaveBeenCalled();
  });

  it("avisa por correo a la inmobiliaria", async () => {
    const { app, notifier } = makeApp(makeRepo());

    await post(app, BODY);

    expect(notifier.leadRecibido).toHaveBeenCalledWith(
      "inmo@correo.com",
      expect.objectContaining({
        propertyTitle: "Casa",
        name: "Martín Pérez",
        email: "martin@correo.com",
      }),
    );
  });

  it("el bot del honeypot no dispara ningún correo", async () => {
    const { app, notifier } = makeApp(makeRepo());

    await post(app, { ...BODY, website: "http://spam.com" });

    expect(notifier.leadRecibido).not.toHaveBeenCalled();
  });

  it("la respuesta no filtra datos internos de la inmobiliaria", async () => {
    const { app } = makeApp(makeRepo());
    const res = await post(app, BODY);

    const cuerpo = JSON.stringify(res.body);
    expect(cuerpo).not.toContain(TENANT_ID);
    expect(cuerpo).not.toContain(INQUIRY_ID);
  });
});

describe("bandeja de la inmobiliaria", () => {
  it("401 sin token", async () => {
    const { app } = makeApp(makeRepo());
    expect((await request(app).get("/api/inquiries")).status).toBe(401);
  });

  it("403 para super_admin: las consultas son del tenant", async () => {
    const { app } = makeApp(makeRepo());
    const res = await request(app)
      .get("/api/inquiries")
      .set("Authorization", `Bearer ${superAdminToken()}`);
    expect(res.status).toBe(403);
  });

  it("el agente puede atender consultas", async () => {
    const { app } = makeApp(makeRepo());
    const res = await request(app)
      .get("/api/inquiries")
      .set("Authorization", `Bearer ${agentToken()}`);
    expect(res.status).toBe(200);
  });

  it("lista con el contador de nuevas", async () => {
    const { app } = makeApp(makeRepo());
    const res = await request(app)
      .get("/api/inquiries")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.newCount).toBe(1);
  });

  it("pasa los filtros ya tipados", async () => {
    const { app, repo } = makeApp(makeRepo());
    await request(app)
      .get("/api/inquiries?status=contacted&page=2")
      .set("Authorization", `Bearer ${adminToken()}`);

    const [tenantId, input] = (repo.list as jest.Mock).mock.calls[0];
    expect(tenantId).toBe(TENANT_ID);
    expect(input).toMatchObject({ status: "contacted", page: 2 });
  });

  it("estado fuera del enum → 422", async () => {
    const { app } = makeApp(makeRepo());
    const res = await request(app)
      .get("/api/inquiries?status=archivada")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(422);
  });

  it("marca como contactada", async () => {
    const { app, repo } = makeApp(makeRepo());
    const res = await request(app)
      .patch(`/api/inquiries/${INQUIRY_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "contacted" });

    expect(res.status).toBe(200);
    expect(repo.updateStatus).toHaveBeenCalledWith(INQUIRY_ID, TENANT_ID, "contacted");
  });

  it("consulta de otro tenant → 404, sin escribir", async () => {
    const { app, repo } = makeApp(
      makeRepo({ findById: jest.fn().mockResolvedValue(null) }),
    );
    const res = await request(app)
      .patch(`/api/inquiries/${INQUIRY_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "closed" });

    expect(res.status).toBe(404);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it("poner el estado que ya tiene no escribe", async () => {
    const { app, repo } = makeApp(makeRepo());
    await request(app)
      .patch(`/api/inquiries/${INQUIRY_ID}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "new" });

    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
});
