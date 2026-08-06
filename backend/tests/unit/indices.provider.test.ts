import {
  FakeIndexProvider,
  OficialIndexProvider,
  SERIES,
} from "@/shared/services/indices";

/** Arma un fetch falso que responde según la URL pedida. */
function fetchFalso(rutas: Record<string, unknown>) {
  const llamadas: string[] = [];

  const fn = jest.fn(async (url: string | URL) => {
    const href = url.toString();
    llamadas.push(href);

    const clave = Object.keys(rutas).find((k) => href.includes(k));
    if (!clave) {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => rutas[clave],
    } as Response;
  });

  return { fn: fn as unknown as typeof fetch, llamadas };
}

/**
 * Respuesta del BCRA para un tramo de la serie diaria del ICL.
 *
 * `results` es un ARRAY de variables, cada una con su `detalle`, aunque se
 * pida una sola. Verificado contra la API real: darlo por objeto hacía que el
 * parseo devolviera siempre una serie vacía.
 */
function paginaBcra(
  detalle: Array<{ fecha: string; valor: number }>,
  count: number,
  offset: number,
) {
  return {
    status: 200,
    metadata: { resultset: { count, offset, limit: 1000 } },
    results: [{ idVariable: 40, detalle }],
  };
}

describe("OficialIndexProvider - ICL contra el BCRA", () => {
  it("pagina hasta traer la serie completa y la devuelve ascendente", async () => {
    // El BCRA corta de a 1000 y devuelve lo más nuevo primero.
    const primera = paginaBcra(
      [
        { fecha: "2026-08-16", valor: 35.25 },
        { fecha: "2026-08-15", valor: 35.23 },
      ],
      3,
      0,
    );
    const segunda = paginaBcra([{ fecha: "2020-07-01", valor: 1 }], 3, 2);

    const { fn, llamadas } = fetchFalso({
      "offset=2": segunda,
      "monetarias/40": primera,
    });

    const provider = new OficialIndexProvider(fn);
    const serie = await provider.obtener("icl");

    expect(llamadas).toHaveLength(2);
    expect(serie).toEqual([
      { fecha: "2020-07-01", valor: 1 },
      { fecha: "2026-08-15", valor: 35.23 },
      { fecha: "2026-08-16", valor: 35.25 },
    ]);
  });

  it("falla con un error claro cuando el BCRA no responde 200", async () => {
    const { fn } = fetchFalso({});
    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("icl")).rejects.toThrow(/BCRA/i);
  });
});

describe("OficialIndexProvider - IPC contra datos.gob.ar", () => {
  it("mapea los pares [fecha, valor] de la serie de índice", async () => {
    const { fn } = fetchFalso({
      "apis.datos.gob.ar": {
        data: [
          ["2025-06-01", 8855.5681],
          ["2026-06-01", 11826.4103],
        ],
      },
    });

    const provider = new OficialIndexProvider(fn);
    const serie = await provider.obtener("ipc");

    expect(serie).toEqual([
      { fecha: "2025-06-01", valor: 8855.5681 },
      { fecha: "2026-06-01", valor: 11826.4103 },
    ]);
  });

  it("descarta los meses sin dato publicado", async () => {
    const { fn } = fetchFalso({
      "apis.datos.gob.ar": {
        data: [
          ["2026-05-01", 11607.5],
          ["2026-06-01", null],
        ],
      },
    });

    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("ipc")).resolves.toEqual([
      { fecha: "2026-05-01", valor: 11607.5 },
    ]);
  });
});

describe("OficialIndexProvider - las series nuevas", () => {
  it("pide al BCRA la variable que dice el catálogo", async () => {
    const { fn, llamadas } = fetchFalso({
      "monetarias/30": paginaBcra([{ fecha: "2026-08-15", valor: 822.89 }], 1, 0),
      "monetarias/31": paginaBcra([{ fecha: "2026-08-15", valor: 2076.82 }], 1, 0),
    });

    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("cer")).resolves.toEqual([
      { fecha: "2026-08-15", valor: 822.89 },
    ]);
    await expect(provider.obtener("uva")).resolves.toEqual([
      { fecha: "2026-08-15", valor: 2076.82 },
    ]);

    expect(llamadas[0]).toContain("monetarias/30");
    expect(llamadas[1]).toContain("monetarias/31");
  });

  it("pide a datos.gob.ar el id de serie que dice el catálogo", async () => {
    const { fn, llamadas } = fetchFalso({
      "149.1_TL_INDIIOS_OCTU_0_21": { data: [["2026-04-01", 512.3]] },
      "448.1_NIVEL_GENERAL_0_0_13_46": { data: [["2026-05-01", 9012.4]] },
    });

    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("is")).resolves.toEqual([
      { fecha: "2026-04-01", valor: 512.3 },
    ]);
    await expect(provider.obtener("ipim")).resolves.toEqual([
      { fecha: "2026-05-01", valor: 9012.4 },
    ]);

    expect(llamadas[0]).toContain("ids=149.1_TL_INDIIOS_OCTU_0_21");
    expect(llamadas[1]).toContain("ids=448.1_NIVEL_GENERAL_0_0_13_46");
  });

  it("nombra el organismo en el error, no un genérico", async () => {
    const { fn } = fetchFalso({});
    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("uva")).rejects.toThrow(/BCRA/i);
    await expect(provider.obtener("ipim")).rejects.toThrow(/datos\.gob\.ar/i);
  });
});

describe("FakeIndexProvider", () => {
  it("devuelve las seis series, deterministas y sin salir a la red", async () => {
    const provider = new FakeIndexProvider();

    for (const serie of SERIES) {
      const puntos = await provider.obtener(serie);

      expect(puntos.length).toBeGreaterThan(0);
      // Ascendente: el resto del código asume ese orden.
      expect(puntos[0].fecha < puntos[puntos.length - 1].fecha).toBe(true);
    }
  });

  it("respeta la frecuencia de cada serie", async () => {
    const provider = new FakeIndexProvider();

    // Una serie mensual está fechada el día 1 de cada mes, como la publica el
    // INDEC: si el falso trajera días sueltos, `indiceParaTramo` no encontraría
    // nunca el mes anterior y los tests pasarían por el motivo equivocado.
    const ipc = await provider.obtener("ipc");
    expect(ipc.every((p) => p.fecha.endsWith("-01"))).toBe(true);

    const icl = await provider.obtener("icl");
    expect(icl.some((p) => !p.fecha.endsWith("-01"))).toBe(true);
  });

  it("deja fijar la serie desde el test", async () => {
    const provider = new FakeIndexProvider({
      icl: [{ fecha: "2020-07-01", valor: 1 }],
    });

    await expect(provider.obtener("icl")).resolves.toEqual([
      { fecha: "2020-07-01", valor: 1 },
    ]);
  });
});
