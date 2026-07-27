import {
  MediaService,
  type MediaRecord,
  type MediaRepository,
} from "@/modules/media/media.service";
import type { LimitService } from "@/modules/subscriptions/limit.service";
import { BadRequestError, LimitExceededError, NotFoundError } from "@/shared/errors";
import { FakeStorageProvider } from "@/shared/services/storage";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const OTRO_TENANT = "44444444-4444-4444-4444-444444444444";
const PROPERTY_ID = "55555555-5555-5555-5555-555555555555";
const MEDIA_ID = "66666666-6666-6666-6666-666666666666";

const MB = 1024 * 1024;

const media = (overrides: Partial<MediaRecord> = {}): MediaRecord => ({
  id: MEDIA_ID,
  propertyId: PROPERTY_ID,
  tenantId: TENANT_ID,
  type: "image",
  url: `https://storage.local/tenants/${TENANT_ID}/properties/${PROPERTY_ID}/${MEDIA_ID}.jpg`,
  thumbnailUrl: null,
  sizeBytes: 2 * MB,
  durationSec: null,
  sortOrder: 0,
  isCover: true,
  status: "processing",
  createdAt: new Date("2026-07-01"),
  ...overrides,
});

function makeRepo(overrides: Partial<MediaRepository> = {}) {
  const repo: MediaRepository = {
    propertyExists: jest.fn().mockResolvedValue(true),
    listByProperty: jest.fn().mockResolvedValue([media()]),
    findById: jest.fn().mockResolvedValue(media()),
    nextSortOrder: jest.fn().mockResolvedValue(0),
    countByProperty: jest.fn().mockResolvedValue(0),
    createMedia: jest.fn().mockImplementation((data) => Promise.resolve(media(data))),
    updateMedia: jest
      .fn()
      .mockImplementation((_id, _t, data) => Promise.resolve(media(data))),
    setCover: jest.fn().mockResolvedValue(media({ isCover: true, status: "ready" })),
    reorder: jest.fn().mockResolvedValue([media()]),
    deleteMedia: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
}

function makeLimits(overrides: Partial<LimitService> = {}) {
  return {
    assertCanAddStorage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LimitService;
}

function makeService(
  repo: MediaRepository = makeRepo(),
  limits: LimitService = makeLimits(),
  storage = new FakeStorageProvider(),
) {
  return { service: new MediaService(repo, limits, storage), repo, limits, storage };
}

const UPLOAD = { contentType: "image/jpeg" as const, sizeBytes: 2 * MB };

describe("MediaService", () => {
  describe("createUpload", () => {
    it("firma la subida bajo una clave con tenant y propiedad", async () => {
      const { service, storage } = makeService();

      const result = await service.createUpload(PROPERTY_ID, TENANT_ID, UPLOAD);

      expect(storage.uploads).toHaveLength(1);
      expect(storage.uploads[0].key).toMatch(
        new RegExp(`^tenants/${TENANT_ID}/properties/${PROPERTY_ID}/[0-9a-f-]+\\.jpg$`),
      );
      expect(result.upload.contentType).toBe("image/jpeg");
      expect(result.upload.uploadUrl).toContain("upload");
    });

    it("descuenta el tamaño declarado del plan antes de firmar", async () => {
      const { service, limits } = makeService();

      await service.createUpload(PROPERTY_ID, TENANT_ID, UPLOAD);

      expect(limits.assertCanAddStorage).toHaveBeenCalledWith(TENANT_ID, 2 * MB);
    });

    it("sin cupo de storage → LimitExceededError y no firma nada", async () => {
      const limits = makeLimits({
        assertCanAddStorage: jest
          .fn()
          .mockRejectedValue(new LimitExceededError("almacenamiento")),
      } as Partial<LimitService>);
      const { service, storage, repo } = makeService(makeRepo(), limits);

      await expect(
        service.createUpload(PROPERTY_ID, TENANT_ID, UPLOAD),
      ).rejects.toBeInstanceOf(LimitExceededError);
      expect(storage.uploads).toHaveLength(0);
      expect(repo.createMedia).not.toHaveBeenCalled();
    });

    it("imagen por encima del tope por archivo → BadRequestError", async () => {
      const { service, storage } = makeService();

      await expect(
        service.createUpload(PROPERTY_ID, TENANT_ID, { ...UPLOAD, sizeBytes: 20 * MB }),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(storage.uploads).toHaveLength(0);
    });

    it("el video tiene un tope mayor que la imagen", async () => {
      const { service } = makeService();

      await expect(
        service.createUpload(PROPERTY_ID, TENANT_ID, {
          contentType: "video/mp4",
          sizeBytes: 100 * MB,
        }),
      ).resolves.toBeDefined();
    });

    it("propiedad de otro tenant → NotFoundError", async () => {
      const repo = makeRepo({ propertyExists: jest.fn().mockResolvedValue(false) });
      const { service, storage } = makeService(repo);

      await expect(
        service.createUpload(PROPERTY_ID, OTRO_TENANT, UPLOAD),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(storage.uploads).toHaveLength(0);
    });

    it("la primera carga de la propiedad queda como portada", async () => {
      const { service, repo } = makeService();

      await service.createUpload(PROPERTY_ID, TENANT_ID, UPLOAD);

      expect((repo.createMedia as jest.Mock).mock.calls[0][0].isCover).toBe(true);
    });

    it("las siguientes no pisan la portada existente", async () => {
      const repo = makeRepo({ countByProperty: jest.fn().mockResolvedValue(3) });
      const { service } = makeService(repo);

      await service.createUpload(PROPERTY_ID, TENANT_ID, UPLOAD);

      expect((repo.createMedia as jest.Mock).mock.calls[0][0].isCover).toBe(false);
    });
  });

  describe("confirmUpload", () => {
    const keyOf = (record: MediaRecord) =>
      record.url.replace("https://storage.local/", "");

    it("marca ready y guarda el tamaño real del objeto", async () => {
      const record = media();
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
      const storage = new FakeStorageProvider();
      storage.pretendUploaded(keyOf(record), 2 * MB);
      const { service } = makeService(repo, makeLimits(), storage);

      await service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID);

      expect(repo.updateMedia).toHaveBeenCalledWith(MEDIA_ID, TENANT_ID, {
        sizeBytes: 2 * MB,
        status: "ready",
      });
    });

    it("archivo que nunca llegó → BadRequestError y queda failed", async () => {
      const repo = makeRepo();
      const { service } = makeService(repo); // storage vacío: head devuelve null

      await expect(
        service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repo.updateMedia).toHaveBeenCalledWith(MEDIA_ID, TENANT_ID, {
        status: "failed",
      });
    });

    it("si el archivo real pesa más, valida solo la diferencia contra el plan", async () => {
      const record = media({ sizeBytes: 1 * MB });
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
      const storage = new FakeStorageProvider();
      storage.pretendUploaded(keyOf(record), 3 * MB);
      const limits = makeLimits();
      const { service } = makeService(repo, limits, storage);

      await service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID);

      expect(limits.assertCanAddStorage).toHaveBeenCalledWith(TENANT_ID, 2 * MB);
    });

    it("declarar poco y subir mucho no saltea el límite: borra archivo y fila", async () => {
      const record = media({ sizeBytes: 1 });
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
      const storage = new FakeStorageProvider();
      storage.pretendUploaded(keyOf(record), 4096 * MB);
      const limits = makeLimits({
        assertCanAddStorage: jest
          .fn()
          .mockRejectedValue(new LimitExceededError("almacenamiento")),
      } as Partial<LimitService>);
      const { service } = makeService(repo, limits, storage);

      await expect(
        service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(LimitExceededError);
      expect(storage.removed).toEqual([keyOf(record)]);
      expect(repo.deleteMedia).toHaveBeenCalledWith(MEDIA_ID, TENANT_ID);
    });

    it("si lo subido no es del tipo firmado, se descarta archivo y fila", async () => {
      // El bucket es de lectura pública: un objeto text/html sería contenido
      // arbitrario servido desde nuestro dominio.
      const record = media();
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
      const storage = new FakeStorageProvider();
      storage.pretendUploaded(keyOf(record), 2 * MB, "text/html");
      const { service } = makeService(repo, makeLimits(), storage);

      await expect(
        service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(storage.removed).toEqual([keyOf(record)]);
      expect(repo.deleteMedia).toHaveBeenCalledWith(MEDIA_ID, TENANT_ID);
    });

    it("acepta el tipo que corresponde a la extensión de la clave", async () => {
      const record = media();
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
      const storage = new FakeStorageProvider();
      storage.pretendUploaded(keyOf(record), 2 * MB, "image/jpeg");
      const { service } = makeService(repo, makeLimits(), storage);

      await expect(
        service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID),
      ).resolves.toBeDefined();
      expect(storage.removed).toEqual([]);
    });

    it("confirmar dos veces es idempotente", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(media({ status: "ready" })),
      });
      const { service } = makeService(repo);

      const result = await service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID);

      expect(result.status).toBe("ready");
      expect(repo.updateMedia).not.toHaveBeenCalled();
    });

    it("media de otra propiedad del mismo tenant → NotFoundError", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(media({ propertyId: "otra-propiedad" })),
      });
      const { service } = makeService(repo);

      await expect(
        service.confirmUpload(PROPERTY_ID, MEDIA_ID, TENANT_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("update", () => {
    it("marcar portada delega en setCover para desmarcar la anterior", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(media({ status: "ready" })),
      });
      const { service } = makeService(repo);

      await service.update(PROPERTY_ID, MEDIA_ID, TENANT_ID, { isCover: true });

      expect(repo.setCover).toHaveBeenCalledWith(MEDIA_ID, PROPERTY_ID, TENANT_ID);
    });

    it("no se puede usar de portada algo que todavía se está subiendo", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(media({ status: "processing" })),
      });
      const { service } = makeService(repo);

      await expect(
        service.update(PROPERTY_ID, MEDIA_ID, TENANT_ID, { isCover: true }),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repo.setCover).not.toHaveBeenCalled();
    });

    it("destildar la portada se rechaza: siempre tiene que haber una", async () => {
      const { service } = makeService();

      await expect(
        service.update(PROPERTY_ID, MEDIA_ID, TENANT_ID, { isCover: false }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe("reorder", () => {
    it("ids repetidos → BadRequestError", async () => {
      const { service, repo } = makeService();

      await expect(
        service.reorder(PROPERTY_ID, TENANT_ID, [MEDIA_ID, MEDIA_ID]),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repo.reorder).not.toHaveBeenCalled();
    });

    it("propiedad ajena → NotFoundError", async () => {
      const repo = makeRepo({ propertyExists: jest.fn().mockResolvedValue(false) });
      const { service } = makeService(repo);

      await expect(
        service.reorder(PROPERTY_ID, OTRO_TENANT, [MEDIA_ID]),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("remove", () => {
    it("borra la fila y después el objeto del storage", async () => {
      const record = media();
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
      const storage = new FakeStorageProvider();
      const { service } = makeService(repo, makeLimits(), storage);

      await service.remove(PROPERTY_ID, MEDIA_ID, TENANT_ID);

      expect(repo.deleteMedia).toHaveBeenCalledWith(MEDIA_ID, TENANT_ID);
      expect(storage.removed).toEqual([
        record.url.replace("https://storage.local/", ""),
      ]);
    });

    it("media de otro tenant → NotFoundError y no borra nada", async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
      const storage = new FakeStorageProvider();
      const { service } = makeService(repo, makeLimits(), storage);

      await expect(
        service.remove(PROPERTY_ID, MEDIA_ID, OTRO_TENANT),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.deleteMedia).not.toHaveBeenCalled();
      expect(storage.removed).toEqual([]);
    });
  });
});
