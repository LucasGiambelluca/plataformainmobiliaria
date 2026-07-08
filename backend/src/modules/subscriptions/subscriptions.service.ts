import type { BillingInterval, SubscriptionStatus } from "@prisma/client";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { LimitService, UsageSnapshot } from "./limit.service";

export interface SubscriptionWithPlan {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  plan: {
    id: string;
    name: string;
    slug: string;
    priceAmount: string;
    priceCurrency: string;
    billingInterval: BillingInterval;
    maxProperties: number;
    maxUsers: number;
    maxStorageMb: number;
  };
}

export interface SubscriptionsRepository {
  // Suscripción vigente (la más reciente) del tenant, con su plan.
  findCurrentByTenant(tenantId: string): Promise<SubscriptionWithPlan | null>;
  setCancelAtPeriodEnd(id: string, value: boolean): Promise<void>;
}

export class SubscriptionsService {
  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly limitService: LimitService,
  ) {}

  // GET /api/subscription: estado + uso vs límites (§9.3).
  async getStatus(tenantId: string): Promise<{
    subscription: SubscriptionWithPlan;
    usage: UsageSnapshot;
  }> {
    const subscription = await this.findOrThrow(tenantId);
    const usage = await this.limitService.getUsage(tenantId);
    return { subscription, usage };
  }

  // Cancela al fin de período (no corta el servicio inmediatamente).
  async cancel(tenantId: string): Promise<void> {
    const subscription = await this.findOrThrow(tenantId);

    if (Number(subscription.plan.priceAmount) === 0) {
      throw new BadRequestError("El plan gratuito no requiere cancelación");
    }
    // Idempotente: cancelar dos veces no es un error.
    if (subscription.cancelAtPeriodEnd) return;

    await this.repo.setCancelAtPeriodEnd(subscription.id, true);
  }

  private async findOrThrow(tenantId: string): Promise<SubscriptionWithPlan> {
    const subscription = await this.repo.findCurrentByTenant(tenantId);
    if (!subscription) throw new NotFoundError("El tenant no tiene suscripción");
    return subscription;
  }
}
