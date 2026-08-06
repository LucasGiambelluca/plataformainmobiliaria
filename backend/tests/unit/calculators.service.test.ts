import {
  CalculatorsService,
  type IndicesRepository,
} from "@/modules/calculators/calculators.service";
import { FakeIndexProvider, type PuntoSerie, type Serie } from "@/shared/services/indices";
import { AppError, ValidationError } from "@/shared/errors";

const ICL: PuntoSerie[] = [
  { fecha: "2024-08-01", valor: 17.1 },
  { fecha: "2025-02-01", valor: 22.31 },
  { fecha: "2025-08-01", valor: 26.62 },
  { fecha: "2026-02-01", valor: 30.03 },
  { fecha: "2026-08-01", valor: 35.01 },
];

// Índice IPC mensual: el de un mes es el nivel de precios de ese mes.
const IPC: PuntoSerie[] = [
  { fecha: "2025-05-01", valor: 8000 },
  { fecha: "2025-06-01", valor: 8855.5681 },
  { fecha: "2025-07-01", valor: 9023.973 },
  { fecha: "2026-06-01", valor: 11826.4103 },
];

const AHORA = new Date("2026-08-06T12:00:00Z");

/** Repositorio en memoria: guarda lo que le mandan y lo devuelve tal cual. */
function makeRepo(inicial: Partial<Record<Serie, PuntoSerie[]>> = {}) {
  const series: Partial<Record<Serie, PuntoSerie[]>> = { ...inicial };
  const syncs: Partial<Record<Serie, { ultimoDato: string; sincronizadoEn: Date }>> = {};

  for (const serie of Object.keys(inicial) as Serie[]) {
    const puntos = inicial[serie] ?? [];
    if (puntos.length > 0) {
      syncs[serie] = {
        ultimoDato: puntos[puntos.length - 1].fecha,
        sincronizadoEn: AHORA,
      };
    }
  }

  const repo: IndicesRepository = {
    leerSerie: jest.fn(async (serie: Serie) => series[serie] ?? []),
    leerSync: jest.fn(async (serie: Serie) => syncs[serie] ?? null),
    guardarSerie: jest.fn(async (serie: Serie, puntos: PuntoSerie[]) => {
      series[serie] = puntos;
      syncs[serie] = {
        ultimoDato: puntos[puntos.length - 1]?.fecha ?? "",
        sincronizadoEn: AHORA,
      };
    }),
  };

  return { repo, syncs };
}

function makeService(
  repo: IndicesRepository,
  provider = new FakeIndexProvider({ icl: ICL, ipc: IPC }),
  ttlHoras = 12,
) {
  return new CalculatorsService(repo, provider, { ttlHoras, ahora: () => AHORA });
}

const ENTRADA = {
  montoInicial: 300000,
  fechaInicio: "2024-08-01",
  mesesPeriodo: 6,
  serie: "icl" as const,
};

describe("CalculatorsService - refresco de la caché", () => {
  it("baja la serie cuando la caché está vacía", async () => {
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).toHaveBeenCalledWith("icl");
    expect(repo.guardarSerie).toHaveBeenCalledWith("icl", ICL);
  });

  it("no vuelve a pedirla mientras la última sincronización esté dentro del TTL", async () => {
    const { repo } = makeRepo({ icl: ICL });
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).not.toHaveBeenCalled();
  });

  it("la vuelve a pedir cuando la última sincronización venció el TTL", async () => {
    const { repo, syncs } = makeRepo({ icl: ICL });
    syncs.icl = {
      ultimoDato: "2026-08-01",
      sincronizadoEn: new Date(AHORA.getTime() - 13 * 60 * 60 * 1000),
    };
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).toHaveBeenCalledWith("icl");
  });

  it("no dispara dos bajadas simultáneas de la misma serie", async () => {
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");
    const service = makeService(repo, provider);

    await Promise.all([
      service.calcularCronograma(ENTRADA),
      service.calcularCronograma(ENTRADA),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("baja solo la serie que se pidió, no las seis", async () => {
    // Con seis series, bajarlas todas en cada cálculo sería seis viajes contra
    // dos organismos para responder una sola pregunta.
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("CalculatorsService - la fuente oficial caída", () => {
  function providerCaido() {
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    jest.spyOn(provider, "obtener").mockRejectedValue(new Error("BCRA 500"));
    return provider;
  }

  it("responde con lo cacheado en vez de romper la pantalla", async () => {
    const { repo, syncs } = makeRepo({ icl: ICL });
    // Caché vencida: se intenta refrescar y falla.
    syncs.icl = {
      ultimoDato: "2026-08-01",
      sincronizadoEn: new Date(AHORA.getTime() - 48 * 60 * 60 * 1000),
    };

    const r = await makeService(repo, providerCaido()).calcularCronograma(ENTRADA);

    expect(r.tramos).toHaveLength(5);
  });

  it("devuelve 503 solo si además no hay nada cacheado", async () => {
    const { repo } = makeRepo();

    const error = await makeService(repo, providerCaido())
      .calcularCronograma(ENTRADA)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
  });

  it("nombra la serie que no pudo bajar", async () => {
    const { repo } = makeRepo();

    const error = await makeService(repo, providerCaido())
      .calcularCronograma({ ...ENTRADA, serie: "uva" })
      .catch((e: unknown) => e);

    expect((error as AppError).message).toMatch(/UVA/);
  });
});

describe("CalculatorsService - cronograma", () => {
  it("devuelve los tramos con la serie y cuándo se sincronizó", async () => {
    const { repo } = makeRepo({ icl: ICL });

    const r = await makeService(repo).calcularCronograma(ENTRADA);

    expect(r.serie).toBe("icl");
    expect(r.sincronizadoEn).toBe(AHORA.toISOString());
    expect(r.tramos.map((t) => t.valor)).toEqual([
      300000, 391403.51, 467017.54, 526842.11, 614210.53,
    ]);
  });

  it("usa el índice del mes anterior en una serie mensual", async () => {
    const { repo } = makeRepo({ ipc: IPC });

    const r = await makeService(repo).calcularCronograma({
      montoInicial: 500000,
      fechaInicio: "2025-07-01",
      mesesPeriodo: 1,
      serie: "ipc",
    });

    // Julio 2025 se calcula con el índice de junio 2025.
    expect(r.tramos[0].indice).toBe(8855.5681);
  });

  it("rechaza un inicio anterior al primer dato publicado", async () => {
    const { repo } = makeRepo({ icl: ICL });

    const error = await makeService(repo)
      .calcularCronograma({ ...ENTRADA, fechaInicio: "2019-01-01" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/ICL/);
  });

  it("explica que una serie mensual no admite arrancar en su primer mes", async () => {
    // El IPC de esta caché arranca en mayo 2025; un contrato que arranque en
    // mayo se ajustaría contra abril, que no existe.
    const { repo } = makeRepo({ ipc: IPC });

    const error = await makeService(repo)
      .calcularCronograma({
        montoInicial: 500000,
        fechaInicio: "2025-05-10",
        mesesPeriodo: 1,
        serie: "ipc",
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/2025-06-01/);
  });

  it("rechaza un inicio posterior al último dato publicado", async () => {
    const { repo } = makeRepo({ icl: ICL });

    const error = await makeService(repo)
      .calcularCronograma({ ...ENTRADA, fechaInicio: "2027-01-01" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/todavía no hay índice/i);
  });
});

describe("CalculatorsService - estado de las series", () => {
  it("informa el rango, la sincronización y los datos del catálogo", async () => {
    const { repo } = makeRepo({ icl: ICL, ipc: IPC });

    const estado = await makeService(repo).estadoIndices();

    expect(estado.icl).toMatchObject({
      desde: "2024-08-01",
      hasta: "2026-08-01",
      etiqueta: "ICL",
      nombre: "Índice para Contratos de Locación",
      organismo: "BCRA",
      frecuencia: "diaria",
      sincronizadoEn: AHORA.toISOString(),
    });
  });

  it("informa las seis series", async () => {
    const { repo } = makeRepo();

    const estado = await makeService(repo).estadoIndices();

    expect(Object.keys(estado).sort()).toEqual(["cer", "icl", "ipc", "ipim", "is", "uva"]);
  });

  it("informa la sincronización que acaba de hacer, no la de antes", async () => {
    // Con la caché vacía, estadoIndices baja la serie y recién ahí hay un sync
    // que informar. Leerlo en paralelo con la bajada devolvía null y la
    // pantalla decía "nunca actualizado" justo después de actualizar.
    const { repo } = makeRepo();

    const estado = await makeService(repo).estadoIndices();

    expect(estado.icl?.sincronizadoEn).toBe(AHORA.toISOString());
    expect(estado.ipim?.sincronizadoEn).toBe(AHORA.toISOString());
  });

  it("informa las series que sí pudo resolver aunque una falle", async () => {
    // Una serie caída no puede voltear la pantalla: es la regla del módulo, y
    // antes un Promise.all la rompía. Acá el proveedor solo sabe del ICL, así
    // que las otras cinco quedan sin caché y sin bajada posible.
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL });
    jest.spyOn(provider, "obtener").mockImplementation(async (serie) => {
      if (serie !== "icl") throw new Error(`${serie} caído`);
      return ICL;
    });

    const estado = await makeService(repo, provider).estadoIndices();

    expect(Object.keys(estado)).toEqual(["icl"]);
    expect(estado.icl?.desde).toBe("2024-08-01");
  });

  it("recién tira 503 cuando no se pudo resolver ninguna", async () => {
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL });
    jest.spyOn(provider, "obtener").mockRejectedValue(new Error("todo caído"));

    const error = await makeService(repo, provider)
      .estadoIndices()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
  });
});
