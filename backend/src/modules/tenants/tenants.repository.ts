import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import type { TenantsRepository } from "./tenants.service";

// Implementación Prisma. La tabla tenants no tiene tenant_id (ES el tenant),
// así que no extiende BaseRepository: solo la opera el super_admin.
export const tenantsRepository: TenantsRepository = {
  findTenantBySlug(slug) {
    return prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  },

  findUserByEmailGlobal(email) {
    return prisma.user.findFirst({ where: { email }, select: { id: true } });
  },

  findPlanBySlug(slug) {
    return prisma.plan.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });
  },

  findPlanById(id) {
    return prisma.plan.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
  },

  async createTenantWithAdmin(data) {
    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.tenantName,
          slug: data.slug,
          contactEmail: data.adminEmail,
        },
        select: { id: true, name: true, slug: true, isActive: true },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: data.adminEmail,
          passwordHash: data.adminPasswordHash,
          role: "tenant_admin",
          name: data.adminName,
        },
        select: { id: true, tenantId: true, email: true, role: true, name: true },
      });

      // Plan por defecto gratuito → suscripción activa sin período de prueba.
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: data.planId,
          status: "active",
          currentPeriodStart: new Date(),
        },
      });

      return { tenant, user: { ...user, tenantId: tenant.id } };
    });
  },

  async listTenants({ search, isActive, page, pageSize }) {
    const where: Prisma.TenantWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { plan: { select: { id: true, name: true, slug: true } } },
          },
          // El listado del super admin muestra propiedades y usuarios por tenant.
          _count: { select: { properties: true, users: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return { items, total };
  },

  findTenantById(id) {
    return prisma.tenant.findUnique({
      where: { id },
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { plan: true },
        },
        _count: { select: { users: true, properties: true } },
      },
    });
  },

  findActiveTenantAdmin(tenantId) {
    // El más antiguo. Con varios administradores hace falta un criterio
    // estable, y en una sesión de solo lectura todos ven exactamente lo mismo,
    // así que cuál se elija no cambia nada mientras no cambie entre llamadas.
    return prisma.user.findFirst({
      where: { tenantId, role: "tenant_admin", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
  },

  updateTenant(id, data) {
    return prisma.tenant.update({ where: { id }, data });
  },

  async updateSubscriptionPlan(tenantId, planId) {
    // Actualiza la suscripción vigente (la más reciente) del tenant.
    const current = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (current) {
      await prisma.subscription.update({
        where: { id: current.id },
        data: { planId },
      });
    } else {
      await prisma.subscription.create({
        data: { tenantId, planId, status: "active", currentPeriodStart: new Date() },
      });
    }
  },
};
