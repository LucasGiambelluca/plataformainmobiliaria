import { CATALOGO, SERIES, type Serie } from "./catalogo";
import type { IndexProvider, PuntoSerie } from "./index.provider";

/**
 * Series sintéticas para tests y para desarrollo sin red.
 *
 * No pretenden parecerse a la inflación real: solo crecen de forma monótona y
 * determinista, que es lo que hace falta para que las pantallas tengan algo que
 * mostrar y para que un test pueda afirmar sobre un número concreto.
 *
 * Lo que sí respetan es la **forma** de la serie real, porque de eso depende que
 * el resto del código se ejercite de verdad: las diarias traen un punto por día
 * y las mensuales uno por mes fechado el día 1, que es como las publica el
 * INDEC.
 *
 * Van hasta 2030 a propósito: en desarrollo uno prueba con la fecha de hoy, y
 * una serie que termina en el pasado haría fallar todo con "fuera de rango".
 */

const DIARIA_DESDE = "2020-07-01";
const MENSUAL_DESDE = "2016-12-01";
const HASTA_ANIO = 2030;

/** El ICL arranca en 1 por definición del BCRA (base 30.6.20 = 1). */
const DIARIA_BASE = 1;
const DIARIA_PASO = 0.0009;
const MENSUAL_BASE = 1000;
const MENSUAL_PASO = 0.02;

function serieDiaria(): PuntoSerie[] {
  const puntos: PuntoSerie[] = [];
  const cursor = new Date(`${DIARIA_DESDE}T00:00:00Z`);
  let valor = DIARIA_BASE;

  while (cursor.getUTCFullYear() <= HASTA_ANIO) {
    puntos.push({ fecha: cursor.toISOString().slice(0, 10), valor: Number(valor.toFixed(4)) });
    valor *= 1 + DIARIA_PASO;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return puntos;
}

function serieMensual(): PuntoSerie[] {
  const puntos: PuntoSerie[] = [];
  const cursor = new Date(`${MENSUAL_DESDE}T00:00:00Z`);
  let valor = MENSUAL_BASE;

  while (cursor.getUTCFullYear() <= HASTA_ANIO) {
    puntos.push({ fecha: cursor.toISOString().slice(0, 10), valor: Number(valor.toFixed(4)) });
    valor *= 1 + MENSUAL_PASO;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return puntos;
}

export class FakeIndexProvider implements IndexProvider {
  readonly name = "fake";

  private readonly series: Record<Serie, PuntoSerie[]>;

  constructor(overrides: Partial<Record<Serie, PuntoSerie[]>> = {}) {
    // Las series se arman una sola vez por frecuencia y se comparten: son
    // inmutables y generarlas seis veces es tiempo de test regalado.
    const diaria = serieDiaria();
    const mensual = serieMensual();

    this.series = Object.fromEntries(
      SERIES.map((serie) => [
        serie,
        overrides[serie] ?? (CATALOGO[serie].frecuencia === "diaria" ? diaria : mensual),
      ]),
    ) as Record<Serie, PuntoSerie[]>;
  }

  async obtener(serie: Serie): Promise<PuntoSerie[]> {
    return this.series[serie];
  }
}
