import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { ConflictError } from "@/shared/errors";
import type { ListDomainsQuery } from "./domains.schemas";
import type {
  DomainRecord,
  DomainsRepository,
  DomainWithTenant,
} from "./domains.service";

const domainSelect = {
  id: true,
  tenantId: true,
  domain: true,
  status: true,
  dnsTarget: true,
  lastCheckedAt: true,
  verifiedAt: true,
  createdAt: true,
} as const;

const conTenant = {
  ...domainSelect,
  tenant: { select: { name: true, slug: true } },
} as const;

type FilaConTenant = DomainRecord & { tenant: { name: string; slug: string } };

function aplanar(row: FilaConTenant): DomainWithTenant {
  const { tenant, ...resto } = row;
  return { ...resto, tenantName: tenant.name, tenantSlug: tenant.slug };
}

/**
 * No extiende BaseRepository porque tiene dos caras: la del tenant, que sí
 * filtra por `tenantId` en toda operación, y la del super admin, que cruza
 * inmobiliarias a propósito para el panel global. Los métodos de la segunda
 * están agrupados abajo y solo los llama el router de super admin.
 */
export const domainsRepository: DomainsRepository = {
  listByTenant(tenantId) {
    return prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: domainSelect,
    });
  },

  findById(id, tenantId) {
    return prisma.tenantDomain.findFirst({
      where: { id, tenantId },
      select: domainSelect,
    });
  },

  findByDomainForTenant(domain, tenantId) {
    return prisma.tenantDomain.findFirst({
      where: { domain, tenantId },
      select: domainSelect,
    });
  },

  async create(data) {
    try {
      return await prisma.tenantDomain.create({ data, select: domainSelect });
    } catch (err) {
      // El índice único de `domain` es global: si otra inmobiliaria ya lo
      // reclamó, el mensaje no dice cuál. Que exista ya es más información de
      // la necesaria; de quién es, no corresponde.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictError("Ese dominio ya está registrado en la plataforma");
      }
      throw err;
    }
  },

  updateStatus(id, data) {
    return prisma.tenantDomain.update({
      where: { id },
      data: {
        status: data.status,
        lastCheckedAt: data.lastCheckedAt,
        ...(data.verifiedAt !== undefined && { verifiedAt: data.verifiedAt }),
      },
      select: domainSelect,
    });
  },

  async delete(id, tenantId) {
    await prisma.tenantDomain.deleteMany({ where: { id, tenantId } });
  },

  /* ------------------------- vista global (super admin) ------------------------- */

  async listAll(query: ListDomainsQuery & { page: number; pageSize: number }) {
    const where: Prisma.TenantDomainWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.tenantId && { tenantId: query.tenantId }),
      ...(query.search && {
        OR: [
          { domain: { contains: query.search, mode: "insensitive" } },
          { tenant: { name: { contains: query.search, mode: "insensitive" } } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.tenantDomain.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: conTenant,
      }),
      prisma.tenantDomain.count({ where }),
    ]);

    return { items: rows.map(aplanar), total };
  },

  async findAnyById(id) {
    const row = await prisma.tenantDomain.findUnique({ where: { id }, select: conTenant });
    return row ? aplanar(row) : null;
  },

  async deleteAny(id) {
    await prisma.tenantDomain.delete({ where: { id } });
  },
};
