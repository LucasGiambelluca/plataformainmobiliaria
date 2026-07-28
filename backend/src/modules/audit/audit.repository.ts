import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import type {
  AuditEntry,
  AuditRecord,
  AuditRepository,
  ListAuditInput,
} from "./audit.service";

/**
 * La auditoría cruza tenants a propósito: la consulta el super admin, que ve
 * toda la plataforma. Por eso no extiende BaseRepository. El router es el que
 * garantiza que solo llegue quien corresponde.
 */
export const auditRepository: AuditRepository = {
  async record(entry: AuditEntry): Promise<void> {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  },

  async list(input: ListAuditInput & { page: number; pageSize: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(input.action && { action: input.action }),
      ...(input.tenantId && { tenantId: input.tenantId }),
      ...(input.userId && { userId: input.userId }),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from && { gte: input.from }),
              ...(input.to && { lte: input.to }),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { tenant: { select: { name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // El email del usuario se resuelve aparte: AuditLog no tiene relación con
    // User (el registro debe sobrevivir al borrado del usuario).
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const usuarios = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailPorId = new Map(usuarios.map((u) => [u.id, u.email]));

    const items: AuditRecord[] = rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tenantName: r.tenant?.name ?? null,
      userId: r.userId,
      userEmail: r.userId ? (emailPorId.get(r.userId) ?? null) : null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      ipAddress: r.ipAddress,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }));

    return { items, total };
  },
};
