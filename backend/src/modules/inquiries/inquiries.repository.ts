import type { Inquiry, InquiryStatus, Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { BaseRepository } from "@/shared/repository/BaseRepository";
import { VISIBLE_STATUSES } from "@/modules/public/public.service";
import type { InquiriesRepository, InquiryRecord, ListInquiriesInput } from "./inquiries.service";

type InquiryRow = Inquiry & { property: { title: string } | null };

function toRecord(row: InquiryRow): InquiryRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    propertyTitle: row.property?.title ?? null,
  };
}

// Extiende BaseRepository: la bandeja queda aislada por tenant.
class InquiriesPrismaRepository
  extends BaseRepository<InquiryRecord>
  implements InquiriesRepository
{
  constructor() {
    super(prisma.inquiry);
  }

  async findPublicProperty(propertyId: string) {
    // Mismas dos condiciones que el catálogo público: estado visible y
    // inmobiliaria activa. Sin esto se podrían crear consultas sobre
    // borradores conociendo el id.
    return prisma.property.findFirst({
      where: {
        id: propertyId,
        status: { in: [...VISIBLE_STATUSES] },
        tenant: { isActive: true },
      },
      select: { id: true, tenantId: true, title: true },
    });
  }

  async findNotificationTarget(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        contactEmail: true,
        users: {
          // El admin más antiguo es el que se creó al provisionar la cuenta.
          where: { role: "tenant_admin", isActive: true },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { email: true },
        },
      },
    });
    if (!tenant) return null;

    return {
      // El mail de contacto de la inmobiliaria manda; si no lo cargó, se le
      // escribe al admin.
      email: tenant.contactEmail ?? tenant.users[0]?.email ?? null,
      agencyName: tenant.name,
    };
  }

  async createInquiry(data: {
    tenantId: string;
    propertyId: string;
    name: string;
    email: string;
    phone?: string;
    message: string;
  }): Promise<InquiryRecord> {
    const row = await prisma.inquiry.create({
      data,
      include: { property: { select: { title: true } } },
    });
    return toRecord(row);
  }

  async list(
    tenantId: string,
    input: ListInquiriesInput & { page: number; pageSize: number },
  ): Promise<{ items: InquiryRecord[]; total: number }> {
    const where: Prisma.InquiryWhereInput = {
      tenantId,
      ...(input.status && { status: input.status }),
      ...(input.propertyId && { propertyId: input.propertyId }),
      ...(input.search && {
        OR: [
          { name: { contains: input.search, mode: "insensitive" } },
          { email: { contains: input.search, mode: "insensitive" } },
          { message: { contains: input.search, mode: "insensitive" } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.inquiry.findMany({
        where,
        // Las nuevas primero y después por fecha: la bandeja se lee de arriba.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { property: { select: { title: true } } },
      }),
      prisma.inquiry.count({ where }),
    ]);

    return { items: rows.map(toRecord), total };
  }

  countNew(tenantId: string): Promise<number> {
    return prisma.inquiry.count({ where: { tenantId, status: "new" } });
  }

  override async findById(id: string, tenantId: string): Promise<InquiryRecord | null> {
    const row = await prisma.inquiry.findFirst({
      where: { id, tenantId },
      include: { property: { select: { title: true } } },
    });
    return row ? toRecord(row) : null;
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: InquiryStatus,
  ): Promise<InquiryRecord> {
    // update() de BaseRepository verifica pertenencia antes de escribir.
    await super.update(id, tenantId, { status });
    const row = await this.findById(id, tenantId);
    return row as InquiryRecord;
  }
}

export const inquiriesRepository: InquiriesRepository = new InquiriesPrismaRepository();
