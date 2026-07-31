import { prisma } from "@/config/database";
import type { UsageRepository } from "./limit.service";
import type { SubscriptionsRepository, SubscriptionWithPlan } from "./subscriptions.service";
import type { PlansRepository } from "./plans.service";

const planSelect = {
  id: true,
  name: true,
  slug: true,
  priceAmount: true,
  priceCurrency: true,
  billingInterval: true,
  maxProperties: true,
  maxUsers: true,
  maxStorageMb: true,
  maxDomains: true,
} as const;

// Decimal de Prisma → string (la API nunca expone floats para plata).
function serializePlan<T extends { priceAmount: unknown }>(plan: T) {
  return { ...plan, priceAmount: String(plan.priceAmount) };
}

export const subscriptionsRepository: SubscriptionsRepository = {
  async findCurrentByTenant(tenantId) {
    const sub = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: { select: planSelect },
      },
    });
    if (!sub) return null;
    return { ...sub, plan: serializePlan(sub.plan) } as SubscriptionWithPlan;
  },

  async setCancelAtPeriodEnd(id, value) {
    await prisma.subscription.update({
      where: { id },
      data: { cancelAtPeriodEnd: value },
    });
  },
};

export const usageRepository: UsageRepository = {
  async getPlanLimits(tenantId) {
    const sub = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        plan: {
          select: {
            maxProperties: true,
            maxUsers: true,
            maxStorageMb: true,
            maxDomains: true,
          },
        },
      },
    });
    return sub?.plan ?? null;
  },

  countActiveUsers(tenantId) {
    return prisma.user.count({ where: { tenantId, isActive: true } });
  },

  countProperties(tenantId) {
    return prisma.property.count({ where: { tenantId } });
  },

  countDomains(tenantId) {
    return prisma.tenantDomain.count({ where: { tenantId } });
  },

  async sumStorageBytes(tenantId) {
    const result = await prisma.propertyMedia.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0n;
  },
};

export const plansRepository: PlansRepository = {
  async listPlans() {
    const plans = await prisma.plan.findMany({
      orderBy: { priceAmount: "asc" },
      select: { ...planSelect, isActive: true },
    });
    return plans.map(serializePlan);
  },

  findBySlug(slug) {
    return prisma.plan.findUnique({ where: { slug }, select: { id: true } });
  },

  findById(id) {
    return prisma.plan.findUnique({ where: { id }, select: { id: true } });
  },

  async createPlan(data) {
    const plan = await prisma.plan.create({
      data,
      select: { ...planSelect, isActive: true },
    });
    return serializePlan(plan);
  },

  async updatePlan(id, data) {
    const plan = await prisma.plan.update({
      where: { id },
      data,
      select: { ...planSelect, isActive: true },
    });
    return serializePlan(plan);
  },
};
