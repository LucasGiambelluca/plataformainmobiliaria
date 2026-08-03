import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import type { LimitService } from "@/modules/subscriptions/limit.service";
import { BadRequestError, ConflictError, NotFoundError } from "@/shared/errors";

const BCRYPT_COST = 12;

// Usuario del tenant expuesto por la API (nunca incluye passwordHash).
export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  name: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: Extract<UserRole, "tenant_admin" | "agent">;
  name?: string;
  phone?: string;
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  role?: Extract<UserRole, "tenant_admin" | "agent">;
  isActive?: boolean;
}

// Contrato de persistencia. La implementación extiende BaseRepository:
// toda operación queda aislada por tenant.
export interface UsersRepository {
  listByTenant(tenantId: string): Promise<TenantUser[]>;
  findById(id: string, tenantId: string): Promise<TenantUser | null>;
  // Global a propósito: el email es único en toda la plataforma mientras el
  // login no resuelve tenant (misma regla que el provisioning de tenants).
  findByEmailGlobal(email: string): Promise<{ id: string } | null>;
  createUser(
    tenantId: string,
    data: Omit<CreateUserInput, "password"> & { passwordHash: string },
  ): Promise<TenantUser>;
  updateUser(id: string, tenantId: string, data: UpdateUserInput): Promise<TenantUser>;
}

export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly limitService: LimitService,
  ) {}

  list(tenantId: string): Promise<TenantUser[]> {
    return this.repo.listByTenant(tenantId);
  }

  async create(tenantId: string, input: CreateUserInput): Promise<TenantUser> {
    if (await this.repo.findByEmailGlobal(input.email)) {
      throw new ConflictError("Ese email ya está registrado");
    }

    // Enforcement centralizado del límite maxUsers del plan (tarea 1.12).
    await this.limitService.assertCanAddUser(tenantId);

    const { password, ...rest } = input;
    try {
      return await this.repo.createUser(tenantId, {
        ...rest,
        passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      });
    } catch (e) {
      // P2002 = violación de unique. Solo puede pasar si otra alta con el mismo
      // email entró entre el chequeo de arriba y este insert: la carrera que el
      // chequeo previo no puede cerrar. El usuario ve el mismo 409 que si
      // hubiera llegado segundo por un milisegundo, que es lo que pasó.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictError("Ese email ya está registrado");
      }
      throw e;
    }
  }

  async update(
    tenantId: string,
    id: string,
    actorId: string,
    input: UpdateUserInput,
  ): Promise<TenantUser> {
    const user = await this.repo.findById(id, tenantId);
    if (!user) throw new NotFoundError("Usuario no encontrado");

    // Guardas anti-lockout: nadie se desactiva ni se degrada a sí mismo.
    if (id === actorId && input.isActive === false) {
      throw new BadRequestError("No podés desactivar tu propio usuario");
    }
    if (id === actorId && input.role && input.role !== user.role) {
      throw new BadRequestError("No podés cambiar tu propio rol");
    }

    return this.repo.updateUser(id, tenantId, input);
  }

  // Soft delete (§9.6: "Desactivar"): conserva el historial del usuario.
  async deactivate(tenantId: string, id: string, actorId: string): Promise<void> {
    if (id === actorId) {
      throw new BadRequestError("No podés desactivar tu propio usuario");
    }
    const user = await this.repo.findById(id, tenantId);
    if (!user) throw new NotFoundError("Usuario no encontrado");
    await this.repo.updateUser(id, tenantId, { isActive: false });
  }
}
