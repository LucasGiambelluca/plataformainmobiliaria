import { NotFoundError } from "@/shared/errors";

// Delegate mínimo de Prisma que usa el repositorio (subset tipado de forma laxa a propósito).
export interface PrismaDelegate {
  findMany(args?: unknown): Promise<unknown[]>;
  findFirst(args?: unknown): Promise<unknown | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
  count(args?: unknown): Promise<number>;
}

type Where = Record<string, unknown>;

/**
 * Repositorio base tenant-aware.
 *
 * GARANTÍA DE AISLAMIENTO: toda lectura/escritura exige `tenantId`. No existe
 * un `findAll` sin tenant. Las operaciones por id filtran SIEMPRE por
 * `{ id, tenantId }`; si no existe → NotFound (no se filtra la existencia
 * de recursos de otros tenants).
 */
export abstract class BaseRepository<T> {
  protected constructor(protected readonly model: PrismaDelegate) {}

  findMany(tenantId: string, where: Where = {}, args: Where = {}): Promise<T[]> {
    return this.model.findMany({ where: { ...where, tenantId }, ...args }) as Promise<T[]>;
  }

  count(tenantId: string, where: Where = {}): Promise<number> {
    return this.model.count({ where: { ...where, tenantId } });
  }

  findById(id: string, tenantId: string): Promise<T | null> {
    return this.model.findFirst({ where: { id, tenantId } }) as Promise<T | null>;
  }

  async findByIdOrThrow(id: string, tenantId: string): Promise<T> {
    const found = await this.findById(id, tenantId);
    if (!found) throw new NotFoundError();
    return found;
  }

  create(tenantId: string, data: Where): Promise<T> {
    return this.model.create({ data: { ...data, tenantId } }) as Promise<T>;
  }

  async update(id: string, tenantId: string, data: Where): Promise<T> {
    // Verificación de pertenencia antes de actualizar (evita updateMany sin tenant).
    await this.findByIdOrThrow(id, tenantId);
    return this.model.update({ where: { id }, data }) as Promise<T>;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.findByIdOrThrow(id, tenantId);
    await this.model.delete({ where: { id } });
  }
}
