import { AppError, LimitExceededError } from "@/shared/errors";

const BYTES_PER_MB = 1024 * 1024;

export interface PlanLimits {
  maxProperties: number;
  maxUsers: number;
  maxStorageMb: number;
  maxDomains: number;
}

export interface ResourceUsage {
  used: number;
  limit: number;
}

export interface UsageSnapshot {
  users: ResourceUsage;
  properties: ResourceUsage;
  storageMb: ResourceUsage;
  domains: ResourceUsage;
}

export interface UsageRepository {
  // Límites del plan de la suscripción vigente; null si el tenant no tiene suscripción.
  getPlanLimits(tenantId: string): Promise<PlanLimits | null>;
  countActiveUsers(tenantId: string): Promise<number>;
  countProperties(tenantId: string): Promise<number>;
  sumStorageBytes(tenantId: string): Promise<bigint>;
  countDomains(tenantId: string): Promise<number>;
}

/**
 * Enforcement centralizado de límites por plan (tarea 1.12).
 * Todo módulo que cree recursos limitados (users, properties, media) debe
 * pasar por acá — nunca chequear límites por su cuenta.
 */
export class LimitService {
  constructor(private readonly repo: UsageRepository) {}

  private async getLimits(tenantId: string): Promise<PlanLimits> {
    const limits = await this.repo.getPlanLimits(tenantId);
    // Todo tenant se crea con suscripción; si falta, hay datos rotos.
    if (!limits) throw new AppError("El tenant no tiene una suscripción vigente");
    return limits;
  }

  async getUsage(tenantId: string): Promise<UsageSnapshot> {
    const [limits, users, properties, storageBytes, domains] = await Promise.all([
      this.getLimits(tenantId),
      this.repo.countActiveUsers(tenantId),
      this.repo.countProperties(tenantId),
      this.repo.sumStorageBytes(tenantId),
      this.repo.countDomains(tenantId),
    ]);
    return {
      users: { used: users, limit: limits.maxUsers },
      properties: { used: properties, limit: limits.maxProperties },
      storageMb: {
        used: Math.round(Number(storageBytes) / BYTES_PER_MB),
        limit: limits.maxStorageMb,
      },
      domains: { used: domains, limit: limits.maxDomains },
    };
  }

  async assertCanAddUser(tenantId: string): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const used = await this.repo.countActiveUsers(tenantId);
    if (used >= limits.maxUsers) throw new LimitExceededError("usuarios");
  }

  async assertCanAddProperty(tenantId: string): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const used = await this.repo.countProperties(tenantId);
    if (used >= limits.maxProperties) throw new LimitExceededError("propiedades");
  }

  /**
   * Un plan con maxDomains 0 no incluye dominio propio: la inmobiliaria se
   * sirve igual por slug y por subdominio, que no consumen cupo.
   */
  async assertCanAddDomain(tenantId: string): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const used = await this.repo.countDomains(tenantId);
    if (used >= limits.maxDomains) throw new LimitExceededError("dominios");
  }

  async assertCanAddStorage(tenantId: string, additionalBytes: number): Promise<void> {
    const limits = await this.getLimits(tenantId);
    const usedBytes = await this.repo.sumStorageBytes(tenantId);
    const totalBytes = Number(usedBytes) + additionalBytes;
    if (totalBytes > limits.maxStorageMb * BYTES_PER_MB) {
      throw new LimitExceededError("almacenamiento");
    }
  }
}
