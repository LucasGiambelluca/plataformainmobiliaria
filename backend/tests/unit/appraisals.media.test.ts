import {
  AppraisalMediaService,
  MAX_FILES_POR_SOLICITUD,
  MAX_SIZE_BYTES,
  type AppraisalMediaRepository,
} from "@/modules/appraisals/appraisals.media.service";
import { FakeStorageProvider } from "@/shared/services/storage";
import { LimitExceededError, NotFoundError, ValidationError } from "@/shared/errors";

const DRAFT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function makeRepo(overrides: Partial<AppraisalMediaRepository> = {}) {
  const repo: AppraisalMediaRepository = {
    countByDraft: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation(async (data) => ({
      id: "media-1",
      confirmedAt: null,
      ...data,
    })),
    findPending: jest.fn().mockResolvedValue({
      id: "media-1",
      draftId: DRAFT,
      url: `https://storage.local/appraisals/${DRAFT}/foto.jpg`,
      sizeBytes: 1000,
      confirmedAt: null,
    }),
    confirm: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    deleteExpiredDrafts: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return repo;
}

function makeService(repo: AppraisalMediaRepository, storage = new FakeStorageProvider()) {
  return { service: new AppraisalMediaService(repo, storage), storage };
}

describe("AppraisalMediaService - firma de subida", () => {
  it("firma una imagen y devuelve el draft al que pertenece", async () => {
    const { service } = makeService(makeRepo());

    const r = await service.createUploadUrl({
      contentType: "image/jpeg",
      sizeBytes: 500_000,
    });

    expect(r.uploadUrl).toBeTruthy();
    expect(r.draftId).toBeTruthy();
    expect(r.mediaId).toBe("media-1");
  });

  it("reusa el draft cuando ya tiene fotos: es la segunda de la misma solicitud", async () => {
    // `countByDraft` > 0 es la prueba de que ese draft salió de una llamada
    // anterior a este mismo método.
    const repo = makeRepo({ countByDraft: jest.fn().mockResolvedValue(1) });
    const { service } = makeService(repo);

    const r = await service.createUploadUrl({
      draftId: DRAFT,
      contentType: "image/png",
      sizeBytes: 1000,
    });

    expect(r.draftId).toBe(DRAFT);
  });

  it("ignora un draft inventado y emite uno propio", async () => {
    // El draft lo emite el servidor. Si se aceptara el que manda el cliente,
    // cualquiera elegiría el identificador con el que se guardan los archivos y
    // al que se le cuentan las fotos, sin haber subido nada.
    const repo = makeRepo({ countByDraft: jest.fn().mockResolvedValue(0) });
    const { service } = makeService(repo);

    const r = await service.createUploadUrl({
      draftId: DRAFT,
      contentType: "image/png",
      sizeBytes: 1000,
    });

    expect(r.draftId).not.toBe(DRAFT);
    expect(r.draftId).toBeTruthy();
  });

  it("guarda el objeto bajo un prefijo propio, fuera del árbol de propiedades", async () => {
    const repo = makeRepo();
    const { service } = makeService(repo);

    await service.createUploadUrl({ contentType: "image/jpeg", sizeBytes: 1000 });

    const guardado = (repo.create as jest.Mock).mock.calls[0][0];
    expect(guardado.url).toContain("appraisals/");
  });

  it("rechaza un video: acá solo entran fotos", async () => {
    const { service } = makeService(makeRepo());

    await expect(
      service.createUploadUrl({
        contentType: "video/mp4" as never,
        sizeBytes: 1000,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza un archivo más grande que el tope por foto", async () => {
    const { service } = makeService(makeRepo());

    await expect(
      service.createUploadUrl({
        contentType: "image/jpeg",
        sizeBytes: MAX_SIZE_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("corta cuando el draft ya llegó al tope de fotos", async () => {
    // Sin cupo de plan detrás, la cantidad por solicitud es el único freno.
    const repo = makeRepo({
      countByDraft: jest.fn().mockResolvedValue(MAX_FILES_POR_SOLICITUD),
    });
    const { service } = makeService(repo);

    await expect(
      service.createUploadUrl({ draftId: DRAFT, contentType: "image/jpeg", sizeBytes: 1000 }),
    ).rejects.toBeInstanceOf(LimitExceededError);
  });
});

describe("AppraisalMediaService - confirmación", () => {
  it("confirma contra el tamaño real del objeto, no el declarado", async () => {
    const repo = makeRepo();
    const storage = new FakeStorageProvider();
    jest
      .spyOn(storage, "head")
      .mockResolvedValue({ sizeBytes: 2222, contentType: "image/jpeg" });

    const { service } = makeService(repo, storage);
    await service.confirm("media-1", DRAFT);

    expect(repo.confirm).toHaveBeenCalledWith("media-1", 2222);
  });

  it("borra el objeto y la fila si el tamaño real supera el tope", async () => {
    // Declarar 1 byte y subir 4 GB no puede saltearse el límite.
    const repo = makeRepo();
    const storage = new FakeStorageProvider();
    jest
      .spyOn(storage, "head")
      .mockResolvedValue({ sizeBytes: MAX_SIZE_BYTES + 1, contentType: "image/jpeg" });
    const borrar = jest.spyOn(storage, "remove");

    const { service } = makeService(repo, storage);

    await expect(service.confirm("media-1", DRAFT)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(borrar).toHaveBeenCalled();
    expect(repo.remove).toHaveBeenCalledWith("media-1");
  });

  it("rechaza cuando lo almacenado no es del tipo que se firmó", async () => {
    // El bucket es de lectura pública: un HTML servido desde el CDN es un
    // problema, aunque la clave termine en .jpg.
    const repo = makeRepo();
    const storage = new FakeStorageProvider();
    jest
      .spyOn(storage, "head")
      .mockResolvedValue({ sizeBytes: 1000, contentType: "text/html" });

    const { service } = makeService(repo, storage);

    await expect(service.confirm("media-1", DRAFT)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("no deja confirmar una foto de otro draft", async () => {
    const repo = makeRepo({ findPending: jest.fn().mockResolvedValue(null) });
    const { service } = makeService(repo);

    await expect(service.confirm("media-1", DRAFT)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("falla si el objeto no llegó al storage", async () => {
    const repo = makeRepo();
    const storage = new FakeStorageProvider();
    jest.spyOn(storage, "head").mockResolvedValue(null);

    const { service } = makeService(repo, storage);

    await expect(service.confirm("media-1", DRAFT)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("AppraisalMediaService - limpieza de huérfanos", () => {
  it("borra del storage los drafts vencidos que nunca se enviaron", async () => {
    const repo = makeRepo({
      deleteExpiredDrafts: jest
        .fn()
        .mockResolvedValue([`https://storage.local/appraisals/${DRAFT}/a.jpg`]),
    });
    const storage = new FakeStorageProvider();
    const borrar = jest.spyOn(storage, "remove");

    const { service } = makeService(repo, storage);
    await service.limpiarHuerfanos();

    expect(borrar).toHaveBeenCalled();
  });

  it("no rompe el alta si la limpieza falla", async () => {
    const repo = makeRepo({
      deleteExpiredDrafts: jest.fn().mockRejectedValue(new Error("base caída")),
    });
    const { service } = makeService(repo);

    await expect(service.limpiarHuerfanos()).resolves.toBeUndefined();
  });
});
