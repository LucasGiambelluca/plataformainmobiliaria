import { CATALOGO, type Fuente, type Serie } from "./catalogo";
import type { IndexProvider, PuntoSerie } from "./index.provider";
import { fetchConTimeout, TIMEOUT_MS } from "@/shared/http/fetch-con-timeout";

/**
 * Series contra los organismos que las publican.
 *
 * Dos fuentes, dos formas de respuesta:
 *
 * - **BCRA** (`estadisticas/v4.0/monetarias/<idVariable>`): ICL, CER y UVA. Son
 *   diarias y no se publican sábados, domingos ni feriados.
 * - **datos.gob.ar** (`series/api/series/?ids=<idSerie>`): IPC, IS e IPIM, del
 *   INDEC. Se toma el **índice**, no la variación mensual publicada: la
 *   variación viene redondeada y encadenar doce redondeos arrastra error. El
 *   índice da el resultado exacto en una división.
 *
 * Qué serie va a qué fuente lo dice `CATALOGO`, no un `if` acá adentro.
 *
 * El `fetch` entra por constructor para que los tests no salgan a la red.
 */

const BCRA_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";
const BCRA_PAGINA = 1000;
// Tope de vueltas: la serie más larga es diaria desde 2020, así que veinte
// páginas de mil dan para varias décadas. Está para que un `count` disparatado
// no deje el proceso girando.
const BCRA_MAX_PAGINAS = 20;

const DATOS_GOB_BASE = "https://apis.datos.gob.ar/series/api/series/";

interface RespuestaBcra {
  metadata?: { resultset?: { count?: number; offset?: number; limit?: number } };
  // `results` es un array de variables aunque se pida una sola: cada elemento
  // trae su propio `detalle`. Tratarlo como objeto devuelve una serie vacía sin
  // ningún error visible, que es justo lo que pasó la primera vez.
  results?: Array<{ idVariable?: number; detalle?: Array<{ fecha?: string; valor?: number }> }>;
}

interface RespuestaDatosGob {
  data?: Array<[string, number | null]>;
}

function ascendente(serie: PuntoSerie[]): PuntoSerie[] {
  return [...serie].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export class OficialIndexProvider implements IndexProvider {
  readonly name = "oficial";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async obtener(serie: Serie): Promise<PuntoSerie[]> {
    const { fuente, etiqueta } = CATALOGO[serie];
    return this.bajar(fuente, etiqueta);
  }

  private bajar(fuente: Fuente, etiqueta: string): Promise<PuntoSerie[]> {
    return fuente.tipo === "bcra"
      ? this.bcra(fuente.idVariable, etiqueta)
      : this.datosGob(fuente.idSerie, etiqueta);
  }

  /** Serie diaria del BCRA. Pagina de a 1000 puntos y hay que seguir el offset. */
  private async bcra(idVariable: number, etiqueta: string): Promise<PuntoSerie[]> {
    const base = `${BCRA_BASE}/${idVariable}`;
    const puntos: PuntoSerie[] = [];
    let offset = 0;

    for (let pagina = 0; pagina < BCRA_MAX_PAGINAS; pagina++) {
      const url = offset === 0 ? base : `${base}?offset=${offset}`;
      // El corte va POR PETICIÓN, no por descarga: la serie del ICL pasa los
      // 2000 puntos y son tres páginas, así que una sola señal para toda la
      // bajada la mataría a mitad de camino. `BCRA_MAX_PAGINAS` es el límite
      // superior de intentos, que es lo que impide el bucle infinito.
      const res = await fetchConTimeout(url, TIMEOUT_MS.indice, {}, this.fetchFn);

      if (!res.ok) {
        throw new Error(`El BCRA respondió ${res.status} al pedir el ${etiqueta}`);
      }

      const cuerpo = (await res.json()) as RespuestaBcra;
      const detalle = cuerpo.results?.[0]?.detalle ?? [];

      for (const fila of detalle) {
        if (typeof fila.fecha !== "string" || typeof fila.valor !== "number") {
          continue;
        }
        puntos.push({ fecha: fila.fecha, valor: fila.valor });
      }

      const total = cuerpo.metadata?.resultset?.count ?? puntos.length;
      offset += detalle.length || BCRA_PAGINA;

      if (detalle.length === 0 || puntos.length >= total) break;
    }

    if (puntos.length === 0) {
      throw new Error(`El BCRA devolvió una serie de ${etiqueta} vacía`);
    }

    return ascendente(puntos);
  }

  /** Serie mensual del INDEC publicada en datos.gob.ar. */
  private async datosGob(idSerie: string, etiqueta: string): Promise<PuntoSerie[]> {
    const url = `${DATOS_GOB_BASE}?ids=${idSerie}&limit=1000&format=json`;
    const res = await fetchConTimeout(url, TIMEOUT_MS.indice, {}, this.fetchFn);

    if (!res.ok) {
      throw new Error(`datos.gob.ar respondió ${res.status} al pedir el ${etiqueta}`);
    }

    const cuerpo = (await res.json()) as RespuestaDatosGob;
    const puntos: PuntoSerie[] = [];

    for (const [fecha, valor] of cuerpo.data ?? []) {
      // Los últimos meses pueden venir con valor null: el INDEC publica el
      // índice recién a los quince días de cerrado el mes.
      if (typeof fecha !== "string" || typeof valor !== "number") continue;
      puntos.push({ fecha, valor });
    }

    if (puntos.length === 0) {
      throw new Error(`datos.gob.ar devolvió una serie de ${etiqueta} vacía`);
    }

    return ascendente(puntos);
  }
}
