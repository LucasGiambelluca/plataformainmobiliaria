import { CATALOGO, SERIES } from "@/shared/services/indices";

describe("CATALOGO de series", () => {
  it("tiene las seis series con API pública y ninguna más", () => {
    // CAC y CasaPropia quedaron afuera a propósito: no publican API y una
    // serie cargada a mano devuelve números viejos sin que nadie se entere.
    expect([...SERIES].sort()).toEqual(["cer", "icl", "ipc", "ipim", "is", "uva"]);
  });

  it("describe cada serie con su etiqueta, organismo y frecuencia", () => {
    expect(CATALOGO.icl).toMatchObject({
      etiqueta: "ICL",
      organismo: "BCRA",
      frecuencia: "diaria",
      fuente: { tipo: "bcra", idVariable: 40 },
    });

    expect(CATALOGO.ipc).toMatchObject({
      etiqueta: "IPC",
      organismo: "INDEC",
      frecuencia: "mensual",
      fuente: { tipo: "datosGob", idSerie: "148.3_INIVELNAL_DICI_M_26" },
    });
  });

  it("no repite el idVariable ni el idSerie entre dos series", () => {
    const ids = SERIES.map((s) => {
      const { fuente } = CATALOGO[s];
      return fuente.tipo === "bcra" ? `bcra:${fuente.idVariable}` : `datos:${fuente.idSerie}`;
    });

    expect(new Set(ids).size).toBe(SERIES.length);
  });

  it("marca como diarias solo las del BCRA", () => {
    // El BCRA publica día a día; el INDEC, una vez por mes. Si esto se
    // invierte, `indiceParaTramo` elige el índice equivocado.
    for (const serie of SERIES) {
      const d = CATALOGO[serie];
      expect(d.frecuencia).toBe(d.fuente.tipo === "bcra" ? "diaria" : "mensual");
    }
  });
});
