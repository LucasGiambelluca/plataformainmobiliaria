import express from "express";
import request from "supertest";
import { createPublicRouter } from "@/modules/public/public.router";
import {
  PublicService,
  type PublicPropertyCard,
  type PublicRepository,
} from "@/modules/public/public.service";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

const CARD: PublicPropertyCard = {
  id: "p1",
  title: "Casa 4 ambientes",
  propertyType: "house",
  operationType: "sale",
  price: "189500.00",
  currency: "USD",
  address: "Los Aromos 450",
  city: "Oro Verde",
  state: "Entre Ríos",
  rooms: 4,
  bathrooms: 2,
  areaM2: "185.00",
  featured: false,
  coverUrl: "https://cdn.test/foto.png",
  agency: { name: "Inmobiliaria Demo", slug: "demo", logoUrl: null },
};

function makeApp(overrides: Partial<PublicRepository> = {}) {
  const repo: PublicRepository = {
    listProperties: jest.fn().mockResolvedValue({ items: [CARD], total: 1 }),
    findPropertyById: jest.fn().mockResolvedValue(null),
    incrementViews: jest.fn().mockResolvedValue(undefined),
    listAgencies: jest.fn().mockResolvedValue([]),
    listCities: jest.fn().mockResolvedValue([]),
    listActivePlans: jest.fn().mockResolvedValue([]),
    ...overrides,
  };

  const app = express();
  app.use(express.json());
  app.use("/api/public", createPublicRouter(new PublicService(repo)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo };
}

describe("public router (catálogo abierto)", () => {
  it("responde sin token: es la cara pública de la plataforma", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/public/properties");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it("no acepta filtrar por estado: qué es visible lo decide el servidor", async () => {
    // Si esto pasara al repositorio, cualquiera podría listar los borradores
    // ajenos agregando ?status=draft a la URL.
    const { app, repo } = makeApp();

    await request(app).get("/api/public/properties?status=draft");

    const [input] = (repo.listProperties as jest.Mock).mock.calls[0];
    expect(input).not.toHaveProperty("status");
  });

  it("pasa los filtros legítimos ya tipados", async () => {
    const { app, repo } = makeApp();

    await request(app).get(
      "/api/public/properties?operationType=rent&city=Paran%C3%A1&minPrice=1000&minRooms=2&sort=price_asc",
    );

    const [input] = (repo.listProperties as jest.Mock).mock.calls[0];
    expect(input).toMatchObject({
      operationType: "rent",
      city: "Paraná",
      minPrice: 1000,
      minRooms: 2,
      sort: "price_asc",
    });
  });

  it("rechaza un valor fuera del enum en vez de ignorarlo", async () => {
    const { app, repo } = makeApp();
    const res = await request(app).get("/api/public/properties?operationType=permuta");
    expect(res.status).toBe(422);
    expect(repo.listProperties).not.toHaveBeenCalled();
  });

  it("acota el pageSize: el catálogo no se baja entero de una", async () => {
    const { app, repo } = makeApp();
    const res = await request(app).get("/api/public/properties?pageSize=5000");
    expect(res.status).toBe(422);
    expect(repo.listProperties).not.toHaveBeenCalled();
  });

  it("rango de precio invertido → 400", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/public/properties?minPrice=900&maxPrice=100");
    expect(res.status).toBe(400);
  });

  describe("ficha", () => {
    it("propiedad no visible → 404 sin revelar que existe", async () => {
      const { app } = makeApp({ findPropertyById: jest.fn().mockResolvedValue(null) });
      const res = await request(app).get("/api/public/properties/p1");
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("borrador");
    });

    it("suma una vista cuando la ficha se muestra", async () => {
      const detalle = {
        ...CARD,
        description: null,
        country: null,
        lat: null,
        lng: null,
        parking: null,
        floor: null,
        yearBuilt: null,
        viewsCount: 7,
        createdAt: new Date("2026-07-01"),
        features: [],
        media: [],
        agencyContact: { email: null, phone: null, description: null },
      };
      const { app, repo } = makeApp({
        findPropertyById: jest.fn().mockResolvedValue(detalle),
      });

      const res = await request(app).get("/api/public/properties/p1");

      expect(res.status).toBe(200);
      expect(repo.incrementViews).toHaveBeenCalledWith("p1");
    });

    it("si contar la vista falla, la ficha se muestra igual", async () => {
      const detalle = {
        ...CARD,
        description: null,
        country: null,
        lat: null,
        lng: null,
        parking: null,
        floor: null,
        yearBuilt: null,
        viewsCount: 0,
        createdAt: new Date(),
        features: [],
        media: [],
        agencyContact: { email: null, phone: null, description: null },
      };
      const { app } = makeApp({
        findPropertyById: jest.fn().mockResolvedValue(detalle),
        incrementViews: jest.fn().mockRejectedValue(new Error("db caída")),
      });

      const res = await request(app).get("/api/public/properties/p1");

      expect(res.status).toBe(200);
    });
  });
});
