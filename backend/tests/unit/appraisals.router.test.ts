import express from "express";
import request from "supertest";
import {
  createAdminAppraisalsRouter,
  createAppraisalsRouter,
  createPublicAppraisalsRouter,
} from "@/modules/appraisals/appraisals.router";
import {
  AppraisalsService,
  type AppraisalsRepository,
  type ParticipantAgency,
} from "@/modules/appraisals/appraisals.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

const NORTE = "11111111-1111-1111-1111-111111111111";

const PARTICIPANTE: ParticipantAgency = {
  id: NORTE,
  name: "Norte",
  slug: "norte",
  logoUrl: null,
  contactEmail: "norte@example.com",
  lastAssignedAt: null,
};

const CUERPO_MINIMO = {
  name: "Ana Pérez",
  phone: "+54 343 555 0000",
  email: "ana@example.com",
  city: "Paraná",
  address: "San Martín 123",
  propertyType: "house",
  purpose: "sale",
  acceptedTerms: true,
  declaredAccurate: true,
};

function makeApp(overrides: Partial<AppraisalsRepository> = {}) {
  const repo: AppraisalsRepository = {
    listParticipants: jest.fn().mockResolvedValue([PARTICIPANTE]),
    findParticipantById: jest.fn().mockResolvedValue(PARTICIPANTE),
    create: jest.fn().mockImplementation(async (data) => ({
      id: "ap-1",
      createdAt: new Date("2026-08-04"),
      ...data,
    })),
    touchAssignment: jest.fn().mockResolvedValue(undefined),
    attachMedia: jest.fn().mockResolvedValue(0),
    listByTenant: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findByIdForTenant: jest.fn().mockResolvedValue(null),
    updateStatus: jest.fn().mockResolvedValue(null),
    listUnassigned: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  };

  const service = new AppraisalsService(repo, {
    appraisalReceived: jest.fn().mockResolvedValue(undefined),
  });

  const app = express();
  app.use(express.json());
  app.use("/api/public/appraisals", createPublicAppraisalsRouter(service));
  app.use("/api/appraisals", createAppraisalsRouter(service));
  app.use("/api/admin/appraisals", createAdminAppraisalsRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo };
}

describe("alta pública de tasaciones", () => {
  it("acepta una solicitud sin login", async () => {
    const { app } = makeApp();

    const res = await request(app).post("/api/public/appraisals").send(CUERPO_MINIMO);

    expect(res.status).toBe(201);
  });

  it("lista los participantes sin login", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/public/appraisals/participants");

    expect(res.status).toBe(200);
    expect(res.body.agencies).toHaveLength(1);
  });

  it("no filtra la fecha del último turno de cada inmobiliaria", async () => {
    // Es información interna del reparto: publicarla deja ver quién viene
    // recibiendo trabajo y quién no.
    const { app } = makeApp();

    const res = await request(app).get("/api/public/appraisals/participants");

    expect(res.body.agencies[0]).not.toHaveProperty("lastAssignedAt");
  });

  it("ignora un tenantId que venga en el body sin ser el campo esperado", async () => {
    const { app, repo } = makeApp();

    await request(app)
      .post("/api/public/appraisals")
      .send({ ...CUERPO_MINIMO, status: "completed", assignedAutomatically: true });

    const creado = (repo.create as jest.Mock).mock.calls[0][0];
    // El estado lo decide el servidor, no el formulario.
    expect(creado.status).toBe("new");
  });

  it("responde 201 al bot del honeypot sin guardar nada", async () => {
    const { app, repo } = makeApp();

    const res = await request(app)
      .post("/api/public/appraisals")
      .send({ ...CUERPO_MINIMO, website: "http://spam.example" });

    expect(res.status).toBe(201);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("exige aceptar los términos", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/public/appraisals")
      .send({ ...CUERPO_MINIMO, acceptedTerms: false });

    expect(res.status).toBe(422);
  });

  it("exige la declaración de veracidad", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/public/appraisals")
      .send({ ...CUERPO_MINIMO, declaredAccurate: false });

    expect(res.status).toBe(422);
  });

  it("rechaza un tipo de propiedad que no está en la lista", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/public/appraisals")
      .send({ ...CUERPO_MINIMO, propertyType: "castillo" });

    expect(res.status).toBe(422);
  });

  it("exige teléfono: es la vía por la que la inmobiliaria contesta", async () => {
    const { app } = makeApp();
    const { phone, ...sinTelefono } = CUERPO_MINIMO;

    const res = await request(app).post("/api/public/appraisals").send(sinTelefono);

    expect(res.status).toBe(422);
  });

  it("acepta los bloques opcionales y los guarda en details", async () => {
    const { app, repo } = makeApp();

    await request(app)
      .post("/api/public/appraisals")
      .send({
        ...CUERPO_MINIMO,
        condition: "very_good",
        areaM2: 120.5,
        rooms: 3,
        details: {
          surfaces: { land: 300, covered: 120 },
          ageYears: 15,
          spaces: ["living", "cocina"],
          services: ["agua", "gas"],
          amenities: ["patio", "parrilla"],
          situation: { hasDeed: true, isRented: false },
          estimatedValue: "120000 USD",
          reason: "sale",
          timeframe: "1_to_3_months",
        },
      });

    const creado = (repo.create as jest.Mock).mock.calls[0][0];
    expect(creado.details.amenities).toEqual(["patio", "parrilla"]);
    expect(creado.details.ageYears).toBe(15);
  });

  it("descarta claves desconocidas dentro de details", async () => {
    const { app, repo } = makeApp();

    await request(app)
      .post("/api/public/appraisals")
      .send({ ...CUERPO_MINIMO, details: { amenities: ["patio"], inyectado: "x" } });

    const creado = (repo.create as jest.Mock).mock.calls[0][0];
    expect(creado.details).not.toHaveProperty("inyectado");
  });
});

describe("bandeja de la inmobiliaria", () => {
  it("exige login", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/appraisals");

    expect(res.status).toBe(401);
  });
});

describe("solicitudes sin asignar", () => {
  it("exige login: son solicitudes de terceros", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/admin/appraisals");

    expect(res.status).toBe(401);
  });
});
