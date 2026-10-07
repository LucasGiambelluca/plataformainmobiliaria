/**
 * Apagado ordenado del proceso.
 *
 * Vive acá y no en `server.ts` por una razón concreta: se puede testear. Un
 * handler de señales o de `unhandledRejection` probado en el lugar donde vive
 * mataría al propio runner de tests, así que la lógica entra en una función con
 * dependencias inyectadas y `server.ts` solo la conecta a `process`.
 */

import type { Server } from "node:http";
import { logger } from "@/config/logger";

export interface OpcionesApagado {
  /**
   * Cuánto esperar a que terminen las peticiones en vuelo antes de salir igual.
   * Es una red de seguridad, no el camino normal: si una request no termina,
   * el proceso no puede quedarse colgado para siempre.
   */
  msMaximo?: number;
  /** Inyectable para que los tests puedan observar la salida sin morir. */
  salir?: (codigo: number) => void;
}

export interface Apagador {
  /** Cierra y sale. Se puede llamar más de una vez sin efecto. */
  apagar(motivo: string, codigo: number): Promise<void>;
}

/**
 * Crea el apagador para un servidor.
 *
 * La secuencia importa y es la que A4 señalaba como rota: `server.close()` sin
 * `await` no espera nada, corta la escucha y sigue de largo, así que la base se
 * desconecta con peticiones todavía en vuelo. En un deploy eso son 500 para
 * quien justo estaba pagando.
 *
 *  1. `close()` — deja de aceptar conexiones nuevas. No interrumpe las que ya
 *     hay.
 *  2. `closeIdleConnections()` — cierra las que están en keep-alive esperando la
 *     próxima petición. **No** se usa `closeAllConnections()`, que cortaría
 *     también las que están sirviendo algo: eso sería exactamente el 500 que se
 *     quiere evitar.
 *  3. esperar al callback de `close()`, que corre cuando ya no queda ninguna.
 *  4. recién ahí se desconecta la base.
 *
 * Con una señal de alarma como red: si el paso 3 no llega, se sale igual.
 */
export function crearApagador(
  server: Server,
  desconectarBase: () => Promise<void>,
  opciones: OpcionesApagado = {},
): Apagador {
  const msMaximo = opciones.msMaximo ?? 20_000;
  const salir = opciones.salir ?? ((codigo: number) => process.exit(codigo));
  let enCurso = false;

  return {
    async apagar(motivo: string, codigo: number): Promise<void> {
      // Una segunda señal durante el apagado (SIGTERM del supervisor mientras se
      // cierra, o dos rechazos) no tiene que reiniciar nada: el corte ya está en
      // marcha.
      if (enCurso) return;
      enCurso = true;

      logger.info(`${motivo} recibido, cerrando de a uno...`);

      // La red de seguridad NO va en unref(): si lo estuviera y no quedara nada
      // más sosteniendo el event loop, el proceso saldría por el otro lado sin
      // cortar las conexiones. En el camino normal el `finally` la limpia, así
      // que no queda nada pendiente cuando todo salió bien.
      const alarma = setTimeout(() => {
        logger.error(
          `El cierre pasó los ${Math.round(msMaximo / 1000)}s: hay peticiones que no terminan. Saliendo igual.`,
        );
        salir(codigo);
      }, msMaximo);

      try {
        const cerrado = new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
        // Keep-alives ociosas: se pueden cortar sin riesgo porque no están
        // sirviendo nada. Las que están en vuelo quedan para que terminen.
        server.closeIdleConnections?.();

        await cerrado;
        logger.info("No quedan conexiones; desconectando PostgreSQL");
        await desconectarBase();
      } catch (err) {
        logger.error({ err }, "Fallo durante el apagado: se sale igual");
      } finally {
        clearTimeout(alarma);
        salir(codigo);
      }
    },
  };
}
