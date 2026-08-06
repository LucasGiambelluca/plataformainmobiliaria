import { prisma } from "@/config/database";
import type { PuntoSerie, Serie } from "@/shared/services/indices";
import type { IndicesRepository, SyncRecord } from "./calculators.service";

/**
 * Caché de las series de índices.
 *
 * **No extiende BaseRepository, y es a propósito.** BaseRepository existe para
 * que ninguna query salga sin `tenantId`; acá no hay tenant al que aislar
 * porque el ICL y el IPC son datos públicos nacionales, iguales para todas las
 * inmobiliarias y para cualquiera que entre sin cuenta. Es la misma clase de
 * excepción que `public.repository.ts`, con una diferencia importante: en
 * `public` lo que reemplaza al aislamiento es el filtro de visibilidad, y acá
 * no hace falta reemplazar nada, porque no hay ningún dato privado en juego.
 */

/** Prisma devuelve Decimal y Date; el resto del código habla en number/ISO. */
function aPunto(fila: { fecha: Date; valor: unknown }): PuntoSerie {
  return {
    fecha: fila.fecha.toISOString().slice(0, 10),
    valor: Number(fila.valor),
  };
}

function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export class PrismaIndicesRepository implements IndicesRepository {
  async leerSerie(serie: Serie): Promise<PuntoSerie[]> {
    const filas = await prisma.indexValue.findMany({
      where: { serie },
      select: { fecha: true, valor: true },
      orderBy: { fecha: "asc" },
    });

    return filas.map(aPunto);
  }

  async leerSync(serie: Serie): Promise<SyncRecord | null> {
    const fila = await prisma.indexSync.findUnique({ where: { serie } });
    if (!fila) return null;

    return {
      ultimoDato: fila.ultimoDato.toISOString().slice(0, 10),
      sincronizadoEn: fila.sincronizadoEn,
    };
  }

  /**
   * Guarda la serie entera y sella la sincronización.
   *
   * Va en una transacción: si se cayera a mitad, la marca de sincronizado
   * quedaría puesta sobre una serie incompleta y el TTL taparía el agujero
   * doce horas.
   *
   * **Reemplaza la serie en vez de completarla, y es a propósito.** Antes usaba
   * `createMany` con `skipDuplicates`, que es más barato pero solo inserta lo
   * que falta: si el organismo **corrige** un valor ya cacheado —el BCRA revisa
   * un ICL, el INDEC republica un mes provisorio— el refresco lo salteaba,
   * sellaba el sync como fresco y el TTL no volvía a intentar nunca. La
   * calculadora seguía dividiendo por el número viejo para siempre, sin error y
   * sin forma de repararlo salvo SQL a mano.
   *
   * El costo es reescribir la serie entera en cada refresco (unas 2.300 filas
   * del ICL, dos veces por día). El riesgo es que el proveedor devuelva una
   * serie truncada y se pierda lo que había: lo acota que el borrado y la
   * inserción son la misma transacción, y que el service no llama acá con una
   * serie vacía.
   */
  async guardarSerie(serie: Serie, puntos: PuntoSerie[]): Promise<void> {
    if (puntos.length === 0) return;

    const ultimo = puntos[puntos.length - 1];

    await prisma.$transaction([
      prisma.indexValue.deleteMany({ where: { serie } }),
      prisma.indexValue.createMany({
        data: puntos.map((p) => ({
          serie,
          fecha: aFecha(p.fecha),
          valor: p.valor,
        })),
      }),
      prisma.indexSync.upsert({
        where: { serie },
        create: {
          serie,
          ultimoDato: aFecha(ultimo.fecha),
          sincronizadoEn: new Date(),
        },
        update: {
          ultimoDato: aFecha(ultimo.fecha),
          sincronizadoEn: new Date(),
        },
      }),
    ]);
  }
}

export const indicesRepository = new PrismaIndicesRepository();
