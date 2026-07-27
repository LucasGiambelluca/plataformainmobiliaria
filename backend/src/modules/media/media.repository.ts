import type { MediaStatus, PropertyMedia } from "@prisma/client";
import { prisma } from "@/config/database";
import { BadRequestError } from "@/shared/errors";
import { BaseRepository } from "@/shared/repository/BaseRepository";
import type { MediaRecord, MediaRepository } from "./media.service";

// sizeBytes es BigInt en la base: JSON.stringify no sabe serializarlo, así que
// nunca sale del repositorio sin convertir.
function toRecord(row: PropertyMedia): MediaRecord {
  return {
    id: row.id,
    propertyId: row.propertyId,
    tenantId: row.tenantId,
    type: row.type,
    url: row.url,
    thumbnailUrl: row.thumbnailUrl,
    sizeBytes: Number(row.sizeBytes),
    durationSec: row.durationSec,
    sortOrder: row.sortOrder,
    isCover: row.isCover,
    status: row.status,
    createdAt: row.createdAt,
  };
}

const byPosition = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
] as const;

// Extiende BaseRepository: todas las operaciones quedan aisladas por tenant.
class MediaPrismaRepository
  extends BaseRepository<MediaRecord>
  implements MediaRepository
{
  constructor() {
    super(prisma.propertyMedia);
  }

  async propertyExists(propertyId: string, tenantId: string): Promise<boolean> {
    const found = await prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      select: { id: true },
    });
    return found !== null;
  }

  async listByProperty(propertyId: string, tenantId: string): Promise<MediaRecord[]> {
    const rows = await prisma.propertyMedia.findMany({
      where: { propertyId, tenantId },
      orderBy: [...byPosition],
    });
    return rows.map(toRecord);
  }

  override async findById(id: string, tenantId: string): Promise<MediaRecord | null> {
    const row = await prisma.propertyMedia.findFirst({ where: { id, tenantId } });
    return row ? toRecord(row) : null;
  }

  async nextSortOrder(propertyId: string, tenantId: string): Promise<number> {
    const last = await prisma.propertyMedia.findFirst({
      where: { propertyId, tenantId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  countByProperty(propertyId: string, tenantId: string): Promise<number> {
    return prisma.propertyMedia.count({ where: { propertyId, tenantId } });
  }

  async createMedia(data: {
    id: string;
    propertyId: string;
    tenantId: string;
    type: MediaRecord["type"];
    url: string;
    sizeBytes: number;
    sortOrder: number;
    isCover: boolean;
  }): Promise<MediaRecord> {
    const row = await prisma.propertyMedia.create({
      data: { ...data, sizeBytes: BigInt(data.sizeBytes) },
    });
    return toRecord(row);
  }

  async updateMedia(
    id: string,
    tenantId: string,
    data: { sizeBytes?: number; status?: MediaStatus; sortOrder?: number },
  ): Promise<MediaRecord> {
    // Verifica pertenencia antes de escribir (garantía de BaseRepository).
    await this.findByIdOrThrow(id, tenantId);
    const row = await prisma.propertyMedia.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.sizeBytes !== undefined && { sizeBytes: BigInt(data.sizeBytes) }),
      },
    });
    return toRecord(row);
  }

  async setCover(
    id: string,
    propertyId: string,
    tenantId: string,
  ): Promise<MediaRecord> {
    const row = await prisma.$transaction(async (tx) => {
      // Una sola portada por propiedad: se limpia el resto en la misma
      // transacción para que no queden dos ni ninguna.
      await tx.propertyMedia.updateMany({
        where: { propertyId, tenantId, isCover: true },
        data: { isCover: false },
      });
      return tx.propertyMedia.update({ where: { id }, data: { isCover: true } });
    });
    return toRecord(row);
  }

  async reorder(
    propertyId: string,
    tenantId: string,
    ids: string[],
  ): Promise<MediaRecord[]> {
    const owned = await prisma.propertyMedia.findMany({
      where: { propertyId, tenantId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((m) => m.id));

    const ajeno = ids.find((id) => !ownedIds.has(id));
    if (ajeno) {
      throw new BadRequestError("La lista de orden incluye archivos de otra propiedad");
    }
    if (ids.length !== owned.length) {
      throw new BadRequestError("La lista de orden debe incluir todos los archivos");
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.propertyMedia.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.listByProperty(propertyId, tenantId);
  }

  async deleteMedia(id: string, tenantId: string): Promise<void> {
    // delete() de BaseRepository verifica pertenencia antes de borrar.
    await super.delete(id, tenantId);
  }
}

export const mediaRepository: MediaRepository = new MediaPrismaRepository();
