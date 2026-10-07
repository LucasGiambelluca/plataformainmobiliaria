import type { BillingInterval, SubscriptionStatus } from "@prisma/client";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { LimitService, UsageSnapshot } from "./limit.service";
import { estaAlDia } from "./vigencia";

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
    maxDomains: number;
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
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  // GET /api/subscription: estado + uso vs límites (§9.3).
  //
  // `alDia` dice si rige el plan pago o los límites del gratuito (ver
  // vigencia.ts): el panel lo necesita para explicar por qué los cupos que
  // muestra `usage` no son los del plan que figura arriba.
  async getStatus(tenantId: string): Promise<{
    subscription: SubscriptionWithPlan & { alDia: boolean };
    usage: UsageSnapshot;
  }> {
    const subscription = await this.findOrThrow(tenantId);
    const usage = await this.limitService.getUsage(tenantId);
    return {
      subscription: { ...subscription, alDia: estaAlDia(subscription, this.ahora()) },
      usage,
    };
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
