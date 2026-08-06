import { prisma } from "@/config/database";
import type {
  AppraisalMediaRepository,
  AppraisalMediaRow,
} from "./appraisals.media.service";

/** Prisma devuelve BigInt; `res.json()` explota con BigInt, así que va a number. */
function aFila(f: {
  id: string;
  draftId: string;
  url: string;
  sizeBytes: bigint;
  confirmedAt: Date | null;
}): AppraisalMediaRow {
  return { ...f, sizeBytes: Number(f.sizeBytes) };
}

export class PrismaAppraisalMediaRepository implements AppraisalMediaRepository {
  async countByDraft(draftId: string): Promise<number> {
    return prisma.appraisalMedia.count({ where: { draftId } });
  }

  async create(data: {
    draftId: string;
    url: string;
    sizeBytes: number;
  }): Promise<AppraisalMediaRow> {
    const fila = await prisma.appraisalMedia.create({
      data: { draftId: data.draftId, url: data.url, sizeBytes: BigInt(data.sizeBytes) },
    });

    return aFila(fila);
  }

  /**
   * Solo pendientes y solo del draft indicado.
   *
   * El draft hace de credencial: sin él no se puede confirmar la foto de otro,
   * que es lo único que separa a dos anónimos en este flujo.
   */
  async findPending(id: string, draftId: string): Promise<AppraisalMediaRow | null> {
    const fila = await prisma.appraisalMedia.findFirst({
      where: { id, draftId, confirmedAt: null },
    });

    return fila ? aFila(fila) : null;
  }

  async confirm(id: string, sizeBytesReal: number): Promise<void> {
    await prisma.appraisalMedia.update({
      where: { id },
      data: { sizeBytes: BigInt(sizeBytesReal), confirmedAt: new Date() },
    });
  }

  async remove(id: string): Promise<void> {
    await prisma.appraisalMedia.deleteMany({ where: { id } });
  }

  /**
   * Borra las fotos de drafts viejos que nunca se enviaron y devuelve sus URLs
   * para que el service las saque también del storage.
   *
   * `appraisalId: null` es la condición clave: una foto ya vinculada a una
   * solicitud pertenece a un expediente vivo, por más viejo que sea.
   */
  async deleteExpiredDrafts(antesDe: Date): Promise<string[]> {
    const vencidas = await prisma.appraisalMedia.findMany({
      where: { appraisalId: null, createdAt: { lt: antesDe } },
      select: { id: true, url: true },
      take: 200,
    });

    if (vencidas.length === 0) return [];

    await prisma.appraisalMedia.deleteMany({
      where: { id: { in: vencidas.map((v) => v.id) } },
    });

    return vencidas.map((v) => v.url);
  }
}

export const appraisalMediaRepository = new PrismaAppraisalMediaRepository();
