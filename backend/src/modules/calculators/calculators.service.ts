import { logger } from "@/config/logger";
import { AppError, ValidationError } from "@/shared/errors";
import type { Frecuencia, IndexProvider, PuntoSerie, Serie } from "@/shared/services/indices";
import { CATALOGO, SERIES } from "@/shared/services/indices";
import { calcularCronograma, mesSiguiente, type Tramo } from "./calculators.math";

export interface SyncRecord {
  /** Fecha ISO del dato más nuevo que trajo la última sincronización. */
  ultimoDato: string;
  sincronizadoEn: Date;
}

export interface IndicesRepository {
  leerSerie(serie: Serie): Promise<PuntoSerie[]>;
  leerSync(serie: Serie): Promise<SyncRecord | null>;
  guardarSerie(serie: Serie, puntos: PuntoSerie[]): Promise<void>;
}

export interface EstadoSerie {
  /** Primera fecha con dato, en ISO. */
  desde: string;
  /** Última fecha con dato, en ISO. */
  hasta: string;
  /** Cuándo se trajo por última vez, en ISO. Null si nunca se sincronizó. */
  sincronizadoEn: string | null;
  /** Lo que dice el botón: "ICL". */
  etiqueta: string;
  /** El nombre completo, para el texto de ayuda. */
  nombre: string;
  /** Quién lo publica. Va en el aviso legal. */
  organismo: string;
  frecuencia: Frecuencia;
}

export interface EntradaCronograma {
  montoInicial: number;
  fechaInicio: string;
  mesesPeriodo: number;
  serie: Serie;
}

export interface ResultadoCronograma {
  serie: Serie;
  tramos: Tramo[];
  /** Cuándo se bajó la serie, para que la pantalla diga de cuándo es el dato. */
  sincronizadoEn: string | null;
}

interface Opciones {
  ttlHoras?: number;
  /** Inyectable para que los tests no dependan del reloj. */
  ahora?: () => Date;
}

/**
 * Calculadora de indexación de contratos.
 *
 * Las seis series viven cacheadas en la base y se refrescan por TTL, sin
 * scheduler: la primera consulta que llega con la caché vencida dispara la
 * bajada, y solo de la serie que se pidió. No hay cron porque el proyecto no
 * tiene infraestructura de jobs y montarla para series que se publican una vez
 * por día y una vez por mes no se paga.
 *
 * Regla de disponibilidad: **si el organismo oficial está caído, la calculadora
 * sigue andando con lo último que se bajó**. El endpoint de estado expone
 * `sincronizadoEn` para que la pantalla pueda avisar de cuándo es el dato. Solo
 * se corta con 503 cuando no hay absolutamente nada cacheado.
 */
export class CalculatorsService {
  private readonly ttlMs: number;
  private readonly ahora: () => Date;

  /**
   * Bajadas en vuelo, por serie. Sin esto, cincuenta consultas simultáneas con
   * la caché vencida dispararían cincuenta descargas contra el organismo.
   */
  private readonly enVuelo = new Map<Serie, Promise<void>>();

  constructor(
    private readonly repo: IndicesRepository,
    private readonly provider: IndexProvider,
    opciones: Opciones = {},
  ) {
    this.ttlMs = (opciones.ttlHoras ?? 12) * 60 * 60 * 1000;
    this.ahora = opciones.ahora ?? (() => new Date());
  }

  // ── Series ────────────────────────────────────────────────

  private vencida(sync: SyncRecord | null): boolean {
    if (!sync) return true;
    return this.ahora().getTime() - sync.sincronizadoEn.getTime() >= this.ttlMs;
  }

  private async refrescar(serie: Serie): Promise<void> {
    const enCurso = this.enVuelo.get(serie);
    if (enCurso) return enCurso;

    const promesa = (async () => {
      const puntos = await this.provider.obtener(serie);
      if (puntos.length > 0) await this.repo.guardarSerie(serie, puntos);
    })().finally(() => this.enVuelo.delete(serie));

    this.enVuelo.set(serie, promesa);
    return promesa;
  }

  /**
   * Serie lista para calcular: refresca si hace falta y, si el refresco falla,
   * se queda con lo que haya en la base.
   */
  private async serie(serie: Serie): Promise<PuntoSerie[]> {
    const sync = await this.repo.leerSync(serie);

    if (this.vencida(sync)) {
      try {
        await this.refrescar(serie);
      } catch (err) {
        logger.error(
          { err, serie },
          "No se pudo actualizar la serie de índices; se responde con la caché",
        );
      }
    }

    const puntos = await this.repo.leerSerie(serie);

    if (puntos.length === 0) {
      const { etiqueta, organismo } = CATALOGO[serie];
      throw new AppError(
        `No se pudo obtener el ${etiqueta} del ${organismo} en este momento. Reintentá en unos minutos.`,
        503,
        "INDEX_UNAVAILABLE",
      );
    }

    return puntos;
  }

  async estadoIndices(): Promise<Record<Serie, EstadoSerie>> {
    const entradas = await Promise.all(
      SERIES.map(async (serie) => {
        // El sync se lee DESPUÉS de resolver la serie, no en paralelo: si la
        // caché estaba vacía, `serie()` acaba de bajarla y escribir el sync.
        // Leerlo antes devolvía null y la pantalla decía "nunca actualizado"
        // justo después de actualizar.
        const puntos = await this.serie(serie);
        const sync = await this.repo.leerSync(serie);
        const { etiqueta, nombre, organismo, frecuencia } = CATALOGO[serie];

        const estado: EstadoSerie = {
          desde: puntos[0].fecha,
          hasta: puntos[puntos.length - 1].fecha,
          sincronizadoEn: sync?.sincronizadoEn.toISOString() ?? null,
          etiqueta,
          nombre,
          organismo,
          frecuencia,
        };
        return [serie, estado] as const;
      }),
    );

    return Object.fromEntries(entradas) as Record<Serie, EstadoSerie>;
  }

  // ── Cronograma ────────────────────────────────────────────

  /**
   * Cronograma de ajustes de un contrato, desde su inicio hasta el último
   * ajuste con índice publicado.
   *
   * Baja **solo** la serie que se pidió: con seis series, resolverlas todas en
   * cada cálculo sería seis viajes contra dos organismos para responder una
   * sola pregunta.
   */
  async calcularCronograma(entrada: EntradaCronograma): Promise<ResultadoCronograma> {
    const { montoInicial, fechaInicio, mesesPeriodo, serie } = entrada;

    const puntos = await this.serie(serie);
    const { etiqueta, frecuencia } = CATALOGO[serie];

    const tramos = calcularCronograma({
      montoInicial,
      fechaInicio,
      mesesPeriodo,
      serie: puntos,
      frecuencia,
    });

    if (tramos.length === 0) {
      throw this.sinIndice(fechaInicio, puntos, etiqueta, frecuencia);
    }

    const sync = await this.repo.leerSync(serie);

    return {
      serie,
      tramos,
      sincronizadoEn: sync?.sincronizadoEn.toISOString() ?? null,
    };
  }

  /**
   * Por qué la fecha de inicio no tiene índice.
   *
   * Son tres motivos distintos y el mensaje tiene que decir cuál: "no se puede
   * calcular" deja a la persona probando fechas al azar.
   */
  private sinIndice(
    fechaInicio: string,
    puntos: PuntoSerie[],
    etiqueta: string,
    frecuencia: Frecuencia,
  ): ValidationError {
    const primera = puntos[0].fecha;
    const ultima = puntos[puntos.length - 1].fecha;

    if (fechaInicio > ultima) {
      return new ValidationError(
        `El último ${etiqueta} publicado es del ${ultima}: todavía no hay índice para el ${fechaInicio}.`,
      );
    }

    if (frecuencia === "mensual") {
      // El contrato se ajusta contra el índice del mes anterior, así que no
      // puede arrancar en el primer mes de la serie: ese mes no tiene base.
      return new ValidationError(
        `Con el ${etiqueta} el contrato no puede arrancar antes del ${mesSiguiente(primera)}: cada tramo se calcula contra el índice del mes anterior.`,
      );
    }

    return new ValidationError(
      `El ${etiqueta} rige desde el ${primera}: no hay índice para el ${fechaInicio}.`,
    );
  }
}
