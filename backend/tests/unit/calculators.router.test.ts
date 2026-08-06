import express from "express";
import request from "supertest";
import { createCalculatorsRouter } from "@/modules/calculators/calculators.router";
import {
  CalculatorsService,
  type IndicesRepository,
} from "@/modules/calculators/calculators.service";
import { FakeIndexProvider, type PuntoSerie } from "@/shared/services/indices";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

const ICL: PuntoSerie[] = [
  { fecha: "2024-08-01", valor: 17.1 },
  { fecha: "2025-02-01", valor: 22.31 },
  { fecha: "2025-08-01", valor: 26.62 },
  { fecha: "2026-02-01", valor: 30.03 },
  { fecha: "2026-08-01", valor: 35.01 },
];

const IPC: PuntoSerie[] = [
  { fecha: "2025-05-01", valor: 8000 },
  { fecha: "2025-06-01", valor: 8855.5681 },
  { fecha: "2025-07-01", valor: 9023.973 },
];

const AHORA = new Date("2026-08-06T12:00:00Z");

const CUERPO = {
  montoInicial: 300000,
  fechaInicio: "2024-08-01",
  mesesPeriodo: 6,
  serie: "icl",
};

function makeApp() {
  const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
  const series: Partial<Record<string, PuntoSerie[]>> = {};

  const repo: IndicesRepository = {
    leerSerie: jest.fn(async (s) => series[s] ?? []),
    leerSync: jest.fn(async (s) =>
      series[s]
        ? { ultimoDato: series[s]![series[s]!.length - 1].fecha, sincronizadoEn: AHORA }
        : null,
    ),
    guardarSerie: jest.fn(async (s, puntos) => {
      series[s] = puntos;
    }),
  };

  const service = new CalculatorsService(repo, provider, {
    ttlHoras: 12,
    ahora: () => AHORA,
  });

  const app = express();
  app.use(express.json());
  app.use("/api/calculators", createCalculatorsRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo };
}

describe("calculators router", () => {
  it("responde sin token: es una herramienta abierta del portal", async () => {
    const { app } = makeApp();

    const res = await request(app).post("/api/calculators/cronograma").send(CUERPO);

    expect(res.status).toBe(200);
    expect(res.body.serie).toBe("icl");
    expect(res.body.tramos).toHaveLength(5);
    expect(res.body.tramos[4].valor).toBe(614210.53);
  });

  it("expone el rango y los datos de catálogo de cada serie", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/calculators/indices");

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["cer", "icl", "ipc", "ipim", "is", "uva"]);
    expect(res.body.icl).toMatchObject({
      desde: "2024-08-01",
      hasta: "2026-08-01",
      etiqueta: "ICL",
      organismo: "BCRA",
      frecuencia: "diaria",
    });
  });

  it("calcula sobre una serie mensual", async () => {
    const { app } = makeApp();

    const res = await request(app).post("/api/calculators/cronograma").send({
      montoInicial: 500000,
      fechaInicio: "2025-07-01",
      mesesPeriodo: 1,
      serie: "ipc",
    });

    expect(res.status).toBe(200);
    expect(res.body.tramos[0].indice).toBe(8855.5681);
  });

  it("rechaza un monto que no es un número positivo", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, montoInicial: -5 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza una fecha que no es una fecha", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, fechaInicio: "ayer" });

    expect(res.status).toBe(422);
  });

  it("rechaza un período fuera del 1..12", async () => {
    const { app } = makeApp();

    for (const mesesPeriodo of [0, 13, 6.5]) {
      const res = await request(app)
        .post("/api/calculators/cronograma")
        .send({ ...CUERPO, mesesPeriodo });

      expect(res.status).toBe(422);
    }
  });

  it("rechaza un índice que no está en el catálogo", async () => {
    const { app } = makeApp();

    // CAC quedó afuera a propósito: pedirlo tiene que ser un 422, no un 500.
    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, serie: "cac" });

    expect(res.status).toBe(422);
  });

  it("explica con un 422 cuando la fecha queda fuera de la serie", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, fechaInicio: "2019-01-01" });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/rige desde/i);
  });

  it("ya no expone los endpoints viejos", async () => {
    const { app } = makeApp();

    expect((await request(app).post("/api/calculators/icl").send({})).status).toBe(404);
    expect((await request(app).post("/api/calculators/ipc").send({})).status).toBe(404);
  });
});
