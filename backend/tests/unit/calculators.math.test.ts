import {
  calcularCronograma,
  claveMesAnterior,
  indiceParaTramo,
  mesSiguiente,
  sumarMeses,
  valorVigente,
  type PuntoSerie,
} from "@/modules/calculators/calculators.math";

// Serie diaria recortada: el BCRA no publica sábados, domingos ni feriados.
const ICL: PuntoSerie[] = [
  { fecha: "2020-07-01", valor: 1 },
  { fecha: "2021-05-03", valor: 1.28 },
  { fecha: "2021-05-04", valor: 1.29 },
  { fecha: "2021-05-07", valor: 1.31 },
];

// Serie mensual: el INDEC fecha cada índice el día 1 del mes que mide.
const IPC: PuntoSerie[] = [
  { fecha: "2025-05-01", valor: 8000 },
  { fecha: "2025-06-01", valor: 8855.5681 },
  { fecha: "2025-07-01", valor: 9023.973 },
];

describe("valorVigente", () => {
  it("devuelve el valor del día cuando ese día se publicó", () => {
    expect(valorVigente(ICL, "2021-05-04")).toEqual({ fecha: "2021-05-04", valor: 1.29 });
  });

  it("cae al último día hábil publicado cuando la fecha no tiene dato", () => {
    // 2021-05-05 y 06 no están en la serie: corresponde el del 04.
    expect(valorVigente(ICL, "2021-05-06")).toEqual({ fecha: "2021-05-04", valor: 1.29 });
  });

  it("devuelve null antes del primer dato publicado", () => {
    expect(valorVigente(ICL, "2020-06-30")).toBeNull();
  });
});

describe("sumarMeses", () => {
  it("suma meses conservando el día", () => {
    expect(sumarMeses("2024-08-01", 6)).toBe("2025-02-01");
    expect(sumarMeses("2024-08-15", 12)).toBe("2025-08-15");
  });

  it("cruza el año", () => {
    expect(sumarMeses("2024-11-10", 3)).toBe("2025-02-10");
    expect(sumarMeses("2024-12-05", 1)).toBe("2025-01-05");
  });

  it("cae al último día del mes cuando el día no existe ahí", () => {
    // Un contrato firmado el 31 de enero se ajusta el 28 o 29 de febrero: no
    // hay 31 de febrero, y correrlo al 3 de marzo movería todos los tramos.
    expect(sumarMeses("2024-01-31", 1)).toBe("2024-02-29"); // bisiesto
    expect(sumarMeses("2025-01-31", 1)).toBe("2025-02-28");
    expect(sumarMeses("2025-03-31", 1)).toBe("2025-04-30");
  });

  it("devuelve la misma fecha al sumar cero", () => {
    expect(sumarMeses("2024-08-01", 0)).toBe("2024-08-01");
  });
});

describe("claveMesAnterior y mesSiguiente", () => {
  it("da el día 1 del mes anterior, sin importar el día de la fecha", () => {
    expect(claveMesAnterior("2024-08-15")).toBe("2024-07-01");
    expect(claveMesAnterior("2024-08-01")).toBe("2024-07-01");
  });

  it("cruza el año hacia atrás", () => {
    expect(claveMesAnterior("2025-01-09")).toBe("2024-12-01");
  });

  it("mesSiguiente da el día 1 del mes que sigue", () => {
    expect(mesSiguiente("2016-12-01")).toBe("2017-01-01");
  });
});

describe("indiceParaTramo - series diarias", () => {
  it("usa el último día hábil publicado", () => {
    expect(indiceParaTramo(ICL, "2021-05-06", "diaria")).toEqual({
      fecha: "2021-05-04",
      valor: 1.29,
    });
  });

  it("devuelve null para una fecha posterior al último dato", () => {
    // Sin esto, `valorVigente` devolvería el último índice para cualquier fecha
    // futura y el cronograma inventaría ajustes que el BCRA no publicó.
    expect(indiceParaTramo(ICL, "2021-05-08", "diaria")).toBeNull();
  });

  it("devuelve null antes del primer dato", () => {
    expect(indiceParaTramo(ICL, "2020-06-30", "diaria")).toBeNull();
  });
});

describe("indiceParaTramo - series mensuales", () => {
  it("usa el índice del mes ANTERIOR al del tramo", () => {
    // Un alquiler que arranca en julio se pactó con los precios de junio: el
    // índice de un mes mide el nivel de precios de ese mes.
    expect(indiceParaTramo(IPC, "2025-07-01", "mensual")).toEqual({
      fecha: "2025-06-01",
      valor: 8855.5681,
    });
  });

  it("ignora el día de la fecha", () => {
    expect(indiceParaTramo(IPC, "2025-07-23", "mensual")).toEqual({
      fecha: "2025-06-01",
      valor: 8855.5681,
    });
  });

  it("devuelve null cuando el mes anterior no está publicado", () => {
    expect(indiceParaTramo(IPC, "2025-09-01", "mensual")).toBeNull();
    expect(indiceParaTramo(IPC, "2025-05-01", "mensual")).toBeNull();
  });
});

/**
 * Vector de referencia: la corrida real de la calculadora que usa el Colegio de
 * Corredores de Entre Ríos, con 300.000, inicio 1/8/2024, cada 6 meses, ICL.
 * Los cinco valores y los cuatro porcentajes tienen que dar exactamente esto.
 */
const ICL_SEMESTRAL: PuntoSerie[] = [
  { fecha: "2024-08-01", valor: 17.1 },
  { fecha: "2025-02-01", valor: 22.31 },
  { fecha: "2025-08-01", valor: 26.62 },
  { fecha: "2026-02-01", valor: 30.03 },
  { fecha: "2026-08-01", valor: 35.01 },
];

describe("calcularCronograma - contra la calculadora del Colegio", () => {
  const tramos = calcularCronograma({
    montoInicial: 300000,
    fechaInicio: "2024-08-01",
    mesesPeriodo: 6,
    serie: ICL_SEMESTRAL,
    frecuencia: "diaria",
  });

  it("emite un tramo por cada ajuste con índice publicado", () => {
    expect(tramos).toHaveLength(5);
    expect(tramos.map((t) => t.fecha)).toEqual([
      "2024-08-01",
      "2025-02-01",
      "2025-08-01",
      "2026-02-01",
      "2026-08-01",
    ]);
    expect(tramos.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it("da los mismos montos que la calculadora oficial", () => {
    expect(tramos.map((t) => t.valor)).toEqual([
      300000, 391403.51, 467017.54, 526842.11, 614210.53,
    ]);
  });

  it("informa el aumento de cada tramo respecto del anterior", () => {
    expect(tramos[0].aumento).toBe(0);
    expect(tramos[1].aumento).toBeCloseTo(0.3047, 4);
    expect(tramos[2].aumento).toBeCloseTo(0.1932, 4);
    expect(tramos[3].aumento).toBeCloseTo(0.1281, 4);
    expect(tramos[4].aumento).toBeCloseTo(0.1658, 4);
  });

  it("expone el índice que usó cada tramo", () => {
    expect(tramos.map((t) => t.indice)).toEqual([17.1, 22.31, 26.62, 30.03, 35.01]);
  });
});

describe("calcularCronograma - corte y bordes", () => {
  it("corta en el último tramo con índice publicado", () => {
    // La serie llega hasta 2026-08-01: el tramo de 2027-02-01 no existe todavía.
    const tramos = calcularCronograma({
      montoInicial: 300000,
      fechaInicio: "2024-08-01",
      mesesPeriodo: 6,
      serie: ICL_SEMESTRAL,
      frecuencia: "diaria",
    });

    expect(tramos[tramos.length - 1].fecha).toBe("2026-08-01");
  });

  it("devuelve un solo tramo cuando el contrato todavía no se ajustó", () => {
    const tramos = calcularCronograma({
      montoInicial: 300000,
      fechaInicio: "2026-08-01",
      mesesPeriodo: 6,
      serie: ICL_SEMESTRAL,
      frecuencia: "diaria",
    });

    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({ numero: 1, valor: 300000, aumento: 0 });
  });

  it("devuelve vacío cuando el inicio queda fuera de la serie", () => {
    expect(
      calcularCronograma({
        montoInicial: 300000,
        fechaInicio: "2019-01-01",
        mesesPeriodo: 6,
        serie: ICL_SEMESTRAL,
        frecuencia: "diaria",
      }),
    ).toEqual([]);
  });

  it("no arrastra el redondeo del tramo anterior", () => {
    // Cada valor sale de montoInicial x indice[n]/indice[0], no del valor
    // anterior: encadenar montos ya redondeados a centavos corre el resultado.
    const serie: PuntoSerie[] = [
      { fecha: "2024-01-01", valor: 3 },
      { fecha: "2024-02-01", valor: 7 },
      { fecha: "2024-03-01", valor: 11 },
    ];

    const tramos = calcularCronograma({
      montoInicial: 100000,
      fechaInicio: "2024-01-01",
      mesesPeriodo: 1,
      serie,
      frecuencia: "diaria",
    });

    // 100000 x 7/3 = 233333.333... ; 100000 x 11/3 = 366666.666...
    expect(tramos[1].valor).toBe(233333.33);
    expect(tramos[2].valor).toBe(366666.67);
  });

  it("aplica el corrimiento de mes en las series mensuales", () => {
    const serie: PuntoSerie[] = [
      { fecha: "2025-06-01", valor: 100 },
      { fecha: "2025-07-01", valor: 110 },
      { fecha: "2025-08-01", valor: 121 },
    ];

    // Contrato que arranca en julio 2025 y se ajusta cada mes: el tramo de
    // julio usa el índice de junio y el de agosto el de julio.
    const tramos = calcularCronograma({
      montoInicial: 500000,
      fechaInicio: "2025-07-01",
      mesesPeriodo: 1,
      serie,
      frecuencia: "mensual",
    });

    expect(tramos).toHaveLength(3);
    expect(tramos.map((t) => t.indice)).toEqual([100, 110, 121]);
    expect(tramos.map((t) => t.valor)).toEqual([500000, 550000, 605000]);
  });
});
