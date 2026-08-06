import type { Frecuencia } from "@/shared/services/indices/catalogo";

/**
 * Aritmética de la calculadora de actualización de contratos.
 *
 * Este archivo es puro a propósito: no toca la base, no sale a la red y no
 * conoce Express. Todo lo que decide un monto vive acá, así que se puede
 * probar con números a mano contra la calculadora oficial.
 *
 * El import de `Frecuencia` apunta a `catalogo.ts` y no al barril del módulo de
 * índices: ese barril reexporta `index.provider.ts`, que importa `PuntoSerie`
 * de este archivo, y apuntarle armaría un ciclo. `catalogo.ts` no importa nada
 * de acá, así que la dependencia queda en una sola dirección.
 */

export interface PuntoSerie {
  /** Fecha del dato en ISO (YYYY-MM-DD). */
  fecha: string;
  valor: number;
}

/** Redondeo a centavos, que es la unidad en la que se firma un contrato. */
function aCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Último valor publicado en o antes de `fecha`, o null si la fecha es anterior
 * al primer dato de la serie.
 *
 * El BCRA no publica sus índices los sábados, domingos ni feriados: pedirle el
 * índice de un domingo tiene que devolver el del viernes, no un error. La
 * serie llega ordenada de forma ascendente por fecha.
 */
export function valorVigente(serie: PuntoSerie[], fecha: string): PuntoSerie | null {
  let encontrado: PuntoSerie | null = null;

  for (const punto of serie) {
    if (punto.fecha > fecha) break;
    encontrado = punto;
  }

  return encontrado;
}

/**
 * `fecha` + `meses` meses, en ISO.
 *
 * Si el día no existe en el mes destino, cae al último día de ese mes: un
 * contrato firmado el 31 de enero se ajusta el 28 de febrero, no el 3 de marzo.
 * Correrlo al mes siguiente desplazaría además todos los tramos posteriores.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);

  const total = anio * 12 + (mes - 1) + meses;
  const anioDestino = Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;

  // Día 0 del mes siguiente = último día del mes pedido.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();

  return `${anioDestino}-${pad(mesDestino)}-${pad(Math.min(dia, ultimoDia))}`;
}

/** Día 1 del mes anterior al de `fecha`, que es como el INDEC fecha su índice. */
export function claveMesAnterior(fecha: string): string {
  const [anio, mes] = fecha.split("-").map(Number);
  return mes === 1 ? `${anio - 1}-12-01` : `${anio}-${pad(mes - 1)}-01`;
}

/** Día 1 del mes siguiente al de `fecha`. Alimenta los mensajes de error. */
export function mesSiguiente(fecha: string): string {
  const [anio, mes] = fecha.split("-").map(Number);
  return mes === 12 ? `${anio + 1}-01-01` : `${anio}-${pad(mes + 1)}-01`;
}

/**
 * Índice que le corresponde a un tramo que cae en `fecha`, o null si todavía no
 * se puede calcular.
 *
 * Las dos ramas dicen cosas distintas:
 *
 * - **Diaria**: el último publicado en o antes de la fecha, porque el BCRA no
 *   publica sábados, domingos ni feriados. Pero una fecha **posterior** al
 *   último dato no tiene índice: devolver el último inventaría un ajuste que el
 *   organismo no publicó.
 * - **Mensual**: el índice del mes anterior, exacto. Si ese mes no está, el
 *   tramo no se puede calcular.
 */
export function indiceParaTramo(
  serie: PuntoSerie[],
  fecha: string,
  frecuencia: Frecuencia,
): PuntoSerie | null {
  if (serie.length === 0) return null;

  if (frecuencia === "mensual") {
    return serie.find((p) => p.fecha === claveMesAnterior(fecha)) ?? null;
  }

  if (fecha > serie[serie.length - 1].fecha) return null;
  return valorVigente(serie, fecha);
}

export interface Tramo {
  /** 1-based: el tramo 1 es el arranque del contrato, sin aumento. */
  numero: number;
  /** Fecha del ajuste, en ISO. */
  fecha: string;
  /** Valor del índice que se usó. */
  indice: number;
  /** Fracción respecto del tramo anterior: 0.3047 son 30,47 %. Cero en el primero. */
  aumento: number;
  /** El alquiler a partir de esa fecha. */
  valor: number;
}

/**
 * Tope de tramos.
 *
 * La serie más vieja arranca en 2016 y el período mínimo es de un mes, así que
 * un contrato real no pasa de ~120 tramos. Está para que una fecha disparatada
 * no deje el proceso girando.
 */
const MAX_TRAMOS = 240;

/**
 * Cronograma de actualizaciones de un contrato.
 *
 * Cada tramo se calcula contra el índice **inicial**, no contra el valor del
 * tramo anterior: encadenar montos ya redondeados a centavos acumularía el
 * error tramo a tramo. El cociente contra el índice inicial da el mismo número
 * que la calculadora oficial y no depende de cuántos tramos haya en el medio.
 *
 * Devuelve vacío si la fecha de inicio no tiene índice: el service es quien
 * traduce eso a un mensaje que diga desde cuándo rige la serie.
 */
export function calcularCronograma(params: {
  montoInicial: number;
  fechaInicio: string;
  mesesPeriodo: number;
  serie: PuntoSerie[];
  frecuencia: Frecuencia;
}): Tramo[] {
  const { montoInicial, fechaInicio, mesesPeriodo, serie, frecuencia } = params;

  const base = indiceParaTramo(serie, fechaInicio, frecuencia);
  if (!base) return [];

  const tramos: Tramo[] = [];
  let anterior = base;

  for (let n = 0; n < MAX_TRAMOS; n++) {
    const fecha = n === 0 ? fechaInicio : sumarMeses(fechaInicio, n * mesesPeriodo);
    const indice = indiceParaTramo(serie, fecha, frecuencia);

    // El primer tramo sin índice corta el cronograma: de ahí en adelante el
    // organismo todavía no publicó nada.
    if (!indice) break;

    tramos.push({
      numero: n + 1,
      fecha,
      indice: indice.valor,
      aumento: n === 0 ? 0 : indice.valor / anterior.valor - 1,
      valor: aCentavos(montoInicial * (indice.valor / base.valor)),
    });

    anterior = indice;
  }

  return tramos;
}
