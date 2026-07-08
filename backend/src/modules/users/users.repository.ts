import { prisma } from "@/config/database";
import { BaseRepository } from "@/shared/repository/BaseRepository";
import type {
  CreateUserInput,
  TenantUser,
  UpdateUserInput,
  UsersRepository,
} from "./users.service";

// Campos expuestos por la API (passwordHash queda afuera).
const safeSelect = {
  id: true,
  tenantId: true,
  email: true,
  role: true,
  name: true,
  phone: true,
  isActive: true,
} as const;

// Extiende BaseRepository: todas las operaciones quedan aisladas por tenant.
class UsersPrismaRepository extends BaseRepository<TenantUser> implements UsersRepository {
  constructor() {
    super(prisma.user);
  }

  listByTenant(tenantId: string): Promise<TenantUser[]> {
    return this.findMany(tenantId, {}, {
      select: safeSelect,
      orderBy: { createdAt: "asc" },
    }) as Promise<TenantUser[]>;
  }

  override async findById(id: string, tenantId: string): Promise<TenantUser | null> {
    const user = await prisma.user.findFirst({
      where: { id, tenantId },
      select: safeSelect,
    });
    return user as TenantUser | null;
  }

  findByEmailGlobal(email: string): Promise<{ id: string } | null> {
    return prisma.user.findFirst({ where: { email }, select: { id: true } });
  }

  countActive(tenantId: string): Promise<number> {
    return this.count(tenantId, { isActive: true });
  }

  async getMaxUsers(tenantId: string): Promise<number | null> {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { plan: { select: { maxUsers: true } } },
    });
    return subscription?.plan.maxUsers ?? null;
  }

  async createUser(
    tenantId: string,
    data: Omit<CreateUserInput, "password"> & { passwordHash: string },
  ): Promise<TenantUser> {
    const user = await prisma.user.create({
      data: { ...data, tenantId },
      select: safeSelect,
    });
    return user as TenantUser;
  }

  async updateUser(
    id: string,
    tenantId: string,
    data: UpdateUserInput,
  ): Promise<TenantUser> {
    // update() de BaseRepository verifica pertenencia antes de escribir.
    await super.update(id, tenantId, data as Record<string, unknown>);
    const user = await this.findById(id, tenantId);
    return user as TenantUser;
  }
}

export const usersRepository: UsersRepository = new UsersPrismaRepository();
