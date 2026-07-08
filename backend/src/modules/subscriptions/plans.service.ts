import type { BillingInterval } from "@prisma/client";
import { ConflictError, NotFoundError } from "@/shared/errors";

export interface PlanRecord {
  id: string;
  name: string;
  slug: string;
  priceAmount: string;
  priceCurrency: string;
  billingInterval: BillingInterval;
  maxProperties: number;
  maxUsers: number;
  maxStorageMb: number;
  isActive: boolean;
}

export interface CreatePlanInput {
  name: string;
  slug: string;
  priceAmount: string;
  priceCurrency?: string;
  billingInterval?: BillingInterval;
  maxProperties: number;
  maxUsers: number;
  maxStorageMb: number;
}

export type UpdatePlanInput = Partial<CreatePlanInput> & { isActive?: boolean };

export interface PlansRepository {
  listPlans(): Promise<PlanRecord[]>;
  findBySlug(slug: string): Promise<{ id: string } | null>;
  findById(id: string): Promise<{ id: string } | null>;
  createPlan(data: CreatePlanInput): Promise<PlanRecord>;
  updatePlan(id: string, data: UpdatePlanInput): Promise<PlanRecord>;
}

// CRUD de planes — exclusivo del super admin (§9.2).
export class PlansService {
  constructor(private readonly repo: PlansRepository) {}

  list(): Promise<PlanRecord[]> {
    return this.repo.listPlans();
  }

  async create(input: CreatePlanInput): Promise<PlanRecord> {
    if (await this.repo.findBySlug(input.slug)) {
      throw new ConflictError("Ese slug de plan ya existe");
    }
    return this.repo.createPlan(input);
  }

  async update(id: string, input: UpdatePlanInput): Promise<PlanRecord> {
    if (!(await this.repo.findById(id))) {
      throw new NotFoundError("Plan no encontrado");
    }
    return this.repo.updatePlan(id, input);
  }
}
