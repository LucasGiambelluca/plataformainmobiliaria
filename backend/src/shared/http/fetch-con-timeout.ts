/**
 * Llamadas HTTP salientes, con corte de tiempo.
 *
 * El `fetch` de Node no trae timeout: una dupla que acepta la conexión y no
 * responde deja el request colgado **para siempre**, y en este proyecto eso no
 * es un detalle de laboratorio. El caso-fe es el de las series de índices, que
 * se refrescan con *single-flight*: la promesa colgada queda en el mapa de "en
 * vuelo" y **toda consulta posterior de esa serie la espera**, así que una
 * sola bajada colgada del BCRA deja la calculadora muerta hasta que se reinicie
 * el proceso. El corte de tiempo es lo que la destraba, porque hace que la
 * promesa se resuelva y el `finally` la saque del mapa.
 *
 * Por eso todas las llamadas externas pasan por acá y no por `fetch` directo:
 * la regla "toda llamada saliente tiene timeout" se cumple por construcción y
 * no por acordarse.
 */

import { AppError } from "@/shared/errors";

/**
 * Cortes por destino, en milisegundos.
 *
 * Los de índices son más generosos porque las series son grandes y la del BCRA
 * baja paginada de a 1000 puntos: una sola señal de corte para toda la descarga
 * mataría la serie del ICL, que pasa las 2000, así que el corte va por
 * petición y el número de páginas tiene su propio límite arriba.
 */
export const TIMEOUT_MS = {
  /** Consultar el estado real de un cobro, y validar un access token. */
  pago: 10_000,
  /** Mandar un correo. Si tarda más, es mejor fallar que colgar al usuario. */
  correo: 10_000,
  /** Una página de la BCRA o de datos.gob.ar. */
  indice: 20_000,
} as const;

/** `AbortSignal.timeout` aborta con un DOMException de nombre TimeoutError. */
function esTimeoutDeSignal(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

/** Solo el host, para el mensaje: una URL puede traer un token arriba. */
function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "el servicio externo";
  }
}

function errorDeTimeout(url: string, ms: number): AppError {
  return new AppError(
    `${hostDe(url)} no respondió en ${Math.round(ms / 1000)}s`,
    504,
    "UPSTREAM_TIMEOUT",
  );
}

/**
 * `fetch` con corte de tiempo, y con un error que diga qué se colgó.
 *
 * `fetchFn` entra por parámetro para que los tests puedan inyectar la suya sin
 * que esto los obligue a hacer red.
 *
 * **Por qué una carrera y no solo `AbortSignal.timeout`.** La señal se le pasa
 * al `fetch` para que el pedido real se aborte y libere la conexión, pero
 * abortar es un pedido cooperativo: si la implementación de `fetch` —o el mock
 * de un test— ignora la señal, el `await` sigue esperando para siempre y el
 * corte no cortó nada. Acá la garantía no depende de que el otro lo cumpla: la
 * respuesta tiene que ganarle a un timer, y listo.
 *
 * El corte propio se combina con el que venga en `init.signal` en vez de
 * pisarlo, para no dejar sin efecto una cancelación de arriba.
 */
export async function fetchConTimeout(
  url: string,
  ms: number,
  init: RequestInit = {},
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const senales = [AbortSignal.timeout(ms)];
  if (init.signal) senales.push(init.signal);

  const peticion = fetchFn(url, { ...init, signal: AbortSignal.any(senales) });
  // Si gana el corte, la petición perdedora puede terminar rechazando más tarde,
  // y eso sería un unhandledRejection: el mismo bug que el corte vino a evitar,
  // creado por el corte mismo.
  peticion.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const corte = new Promise<never>((_, rechazar) => {
    timer = setTimeout(() => rechazar(errorDeTimeout(url, ms)), ms);
    // SIN `unref()`, a propósito. Un timer sin referencias no mantiene vivo el
    // event loop, así que si el `fetch` cuelgado no tiene ningún handle abierto
    // —que es justo lo que pasa con una promesa que nunca resuelve— el proceso
    // termina limpiamente y **el corte nunca llega a dispararse**. O sea: el
    // el unref hace que el timeout no corte: lo contrario de lo que
    // vino a hacer.
    //
    // No cuesta nada no usarlo: el `finally` de más abajo limpia el timer en
    // cuanto la respuesta gana, así que en el camino feliz no queda nada
    // pendiente.
  });

  // La cancelación del llamador entra en la carrera por el mismo motivo que el
  // timer: pasársela al `fetch` alcanza solo si el fetch coopera. Acá se propaga
  // su propia razón, que es lo que corresponde: si a él lo cortaron, esa es la
  // explicación que tiene que ver el log, no un "no respondió en 60s".
  const porElLlamador = init.signal
    ? new Promise<never>((_, rechazar) => {
        init.signal!.addEventListener("abort", () => rechazar(init.signal!.reason), {
          once: true,
        });
      })
    : null;

  try {
    return await Promise.race(
      porElLlamador ? [peticion, corte, porElLlamador] : [peticion, corte],
    );
  } catch (err) {
    // Cuando el corte lo dispara la señal, lo que llega es el DOMException de
    // Node, que no dice ni qué servicio era ni cuánto esperó. Se traduce al
    // mismo error para que el mensaje sea siempre el mismo.
    if (esTimeoutDeSignal(err)) throw errorDeTimeout(url, ms);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
