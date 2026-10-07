import {
  PropertiesService,
  type PropertiesRepository,
  type PropertyRecord,
} from "@/modules/properties/properties.service";
import type { LimitService } from "@/modules/subscriptions/limit.service";
import { BadRequestError, LimitExceededError, NotFoundError } from "@/shared/errors";
import { FakeStorageProvider } from "@/shared/services/storage";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const OTRO_TENANT = "44444444-4444-4444-4444-444444444444";
const PROPERTY_ID = "55555555-5555-5555-5555-555555555555";
const AGENT_ID = "22222222-2222-2222-2222-222222222222";

const PROPERTY: PropertyRecord = {
  id: PROPERTY_ID,
  tenantId: TENANT_ID,
  title: "Casa 3 ambientes",
  description: null,
  propertyType: "house",
  operationType: "sale",
  price: "185000.00",
  currency: "USD",
  address: null,
  city: "Paraná",
  state: null,
  country: null,
  lat: null,
  lng: null,
  areaM2: null,
  rooms: 3,
  bathrooms: 1,
  parking: null,
  floor: null,
  yearBuilt: null,
  status: "draft",
  viewsCount: 0,
  createdBy: AGENT_ID,
  createdAt: new Date("2026-07-01"),
  updatedAt: new Date("2026-07-01"),
  features: [],
  media: [],
};

function makeRepo(overrides: Partial<PropertiesRepository> = {}) {
  const repo: PropertiesRepository = {
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findDetail: jest.fn().mockResolvedValue(PROPERTY),
    createProperty: jest.fn().mockResolvedValue(PROPERTY),
    updateProperty: jest.fn().mockResolvedValue(PROPERTY),
    deleteProperty: jest.fn().mockResolvedValue({ mediaUrls: [] }),
    ...overrides,
  };
  return repo;
}

// LimitService fake: por defecto hay cupo.
function makeLimits(overrides: Partial<LimitService> = {}) {
  return {
    assertCanAddProperty: jest.fn().mockResolvedValue(undefined),
    assertCanFeatureProperty: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LimitService;
}

function makeService(
  repo: PropertiesRepository = makeRepo(),
  limits: LimitService = makeLimits(),
  storage = new FakeStorageProvider(),
) {
  return { service: new PropertiesService(repo, limits, storage), repo, limits, storage };
}

const CREATE_INPUT = {
  title: "Casa 3 ambientes",
  propertyType: "house" as const,
  operationType: "sale" as const,
  price: "185000.00",
};

describe("PropertiesService", () => {
  describe("create", () => {
    it("crea dentro del tenant y guarda el autor", async () => {
      const { service, repo } = makeService();

      await service.create(TENANT_ID, CREATE_INPUT, AGENT_ID);

      const [tenantId, data, features, createdBy] = (repo.createProperty as jest.Mock).mock
        .calls[0];
      expect(tenantId).toBe(TENANT_ID);
      expect(data).toMatchObject({ title: "Casa 3 ambientes", price: "185000.00" });
      expect(features).toEqual([]);
      expect(createdBy).toBe(AGENT_ID);
    });

    it("límite maxProperties alcanzado → LimitExceededError, sin escribir", async () => {
      const limits = makeLimits({
        assertCanAddProperty: jest
          .fn()
          .mockRejectedValue(new LimitExceededError("propiedades")),
      } as Partial<LimitService>);
      const { service, repo } = makeService(makeRepo(), limits);

      await expect(service.create(TENANT_ID, CREATE_INPUT, AGENT_ID)).rejects.toBeInstanceOf(
        LimitExceededError,
      );
      expect(repo.createProperty).not.toHaveBeenCalled();
    });

    it("normaliza características repetidas conservando el orden", async () => {
      const { service, repo } = makeService();

      await service.create(
        TENANT_ID,
        { ...CREATE_INPUT, features: ["Pileta", "  parrilla ", "pileta", ""] },
        AGENT_ID,
      );

      const [, , features] = (repo.createProperty as jest.Mock).mock.calls[0];
      expect(features).toEqual(["Pileta", "parrilla"]);
    });
  });

  describe("aislamiento por tenant", () => {
    it("propiedad de otro tenant → NotFoundError", async () => {
      const repo = makeRepo({ findDetail: jest.fn().mockResolvedValue(null) });
      const { service } = makeService(repo);

      await expect(service.getById(PROPERTY_ID, OTRO_TENANT)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("update sobre propiedad ajena no escribe", async () => {
      const repo = makeRepo({ findDetail: jest.fn().mockResolvedValue(null) });
      const { service } = makeService(repo);

      await expect(
        service.update(PROPERTY_ID, OTRO_TENANT, { title: "Robada" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.updateProperty).not.toHaveBeenCalled();
    });
  });

  describe("transiciones de estado", () => {
    const conEstado = (status: PropertyRecord["status"]) =>
      makeRepo({ findDetail: jest.fn().mockResolvedValue({ ...PROPERTY, status }) });

    it("draft → published", async () => {
      const repo = conEstado("draft");
      const { service } = makeService(repo);

      await service.changeStatus(PROPERTY_ID, TENANT_ID, "published");

      expect(repo.updateProperty).toHaveBeenCalledWith(
        PROPERTY_ID,
        TENANT_ID,
        { status: "published" },
        undefined,
      );
    });

    it("draft → featured rechazado: no se destaca algo que no está publicado", async () => {
      const repo = conEstado("draft");
      const { service } = makeService(repo);

      await expect(
        service.changeStatus(PROPERTY_ID, TENANT_ID, "featured"),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repo.updateProperty).not.toHaveBeenCalled();
    });

    it("published → featured permitido", async () => {
      const repo = conEstado("published");
      const { service } = makeService(repo);

      await expect(
        service.changeStatus(PROPERTY_ID, TENANT_ID, "featured"),
      ).resolves.toBeDefined();
    });

    it("destacar sin cupo en el plan se rechaza y no escribe", async () => {
      const repo = conEstado("published");
      const limits = makeLimits({
        assertCanFeatureProperty: jest
          .fn()
          .mockRejectedValue(new LimitExceededError("propiedades destacadas")),
      });
      const { service } = makeService(repo, limits);

      await expect(
        service.changeStatus(PROPERTY_ID, TENANT_ID, "featured"),
      ).rejects.toBeInstanceOf(LimitExceededError);
      expect(repo.updateProperty).not.toHaveBeenCalled();
    });

    it("el cupo también se controla al destacar por update", async () => {
      // Hay dos caminos para cambiar el estado: si uno no controla, el cupo no existe.
      const repo = conEstado("published");
      const limits = makeLimits({
        assertCanFeatureProperty: jest
          .fn()
          .mockRejectedValue(new LimitExceededError("propiedades destacadas")),
      });
      const { service } = makeService(repo, limits);

      await expect(
        service.update(PROPERTY_ID, TENANT_ID, { status: "featured" }),
      ).rejects.toBeInstanceOf(LimitExceededError);
      expect(repo.updateProperty).not.toHaveBeenCalled();
    });

    it("sacar de destacada no pide cupo", async () => {
      const repo = conEstado("featured");
      const limits = makeLimits();
      const { service } = makeService(repo, limits);

      await service.changeStatus(PROPERTY_ID, TENANT_ID, "published");

      expect(limits.assertCanFeatureProperty).not.toHaveBeenCalled();
    });

    it("draft → paused rechazado", async () => {
      const repo = conEstado("draft");
      const { service } = makeService(repo);

      await expect(
        service.changeStatus(PROPERTY_ID, TENANT_ID, "paused"),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("pasar al estado actual es idempotente y no escribe", async () => {
      const repo = conEstado("published");
      const { service } = makeService(repo);

      const result = await service.changeStatus(PROPERTY_ID, TENANT_ID, "published");

      expect(result.status).toBe("published");
      expect(repo.updateProperty).not.toHaveBeenCalled();
    });

    it("update con status inválido también se valida", async () => {
      const repo = conEstado("draft");
      const { service } = makeService(repo);

      await expect(
        service.update(PROPERTY_ID, TENANT_ID, { status: "featured" }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("list", () => {
    it("rango de precio invertido → BadRequestError", async () => {
      const { service } = makeService();

      await expect(
        service.list(TENANT_ID, { minPrice: 900, maxPrice: 100 }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("acota el pageSize al máximo permitido", async () => {
      const { service, repo } = makeService();

      await service.list(TENANT_ID, { pageSize: 5000 });

      const [, input] = (repo.list as jest.Mock).mock.calls[0];
      expect(input.pageSize).toBe(100);
    });

    it("normaliza página y tamaño por defecto", async () => {
      const { service, repo } = makeService();

      const result = await service.list(TENANT_ID, {});

      const [tenantId, input] = (repo.list as jest.Mock).mock.calls[0];
      expect(tenantId).toBe(TENANT_ID);
      expect(input).toMatchObject({ page: 1, pageSize: 20 });
      expect(result).toMatchObject({ page: 1, pageSize: 20, total: 0 });
    });
  });

  describe("remove", () => {
    it("borra también los objetos del storage", async () => {
      const storage = new FakeStorageProvider();
      const repo = makeRepo({
        deleteProperty: jest.fn().mockResolvedValue({
          mediaUrls: [
            storage.publicUrlFor("tenants/t/properties/p/uno.jpg"),
            storage.publicUrlFor("tenants/t/properties/p/dos.jpg"),
          ],
        }),
      });
      const { service } = makeService(repo, makeLimits(), storage);

      await service.remove(PROPERTY_ID, TENANT_ID);

      expect(storage.removed).toEqual([
        "tenants/t/properties/p/uno.jpg",
        "tenants/t/properties/p/dos.jpg",
      ]);
    });

    it("ignora URLs que no son de este storage en vez de romper", async () => {
      const storage = new FakeStorageProvider();
      const repo = makeRepo({
        deleteProperty: jest
          .fn()
          .mockResolvedValue({ mediaUrls: ["https://viejo-proveedor.com/foto.jpg"] }),
      });
      const { service } = makeService(repo, makeLimits(), storage);

      await expect(service.remove(PROPERTY_ID, TENANT_ID)).resolves.toBeUndefined();
      expect(storage.removed).toEqual([]);
    });

    it("propiedad ajena → NotFoundError, sin borrar nada", async () => {
      const repo = makeRepo({ findDetail: jest.fn().mockResolvedValue(null) });
      const { service } = makeService(repo);

      await expect(service.remove(PROPERTY_ID, OTRO_TENANT)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repo.deleteProperty).not.toHaveBeenCalled();
    });
  });
});
