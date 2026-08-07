import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors";
import { signImpersonationToken } from "@/shared/services/jwt.service";

// Plan asignado en el alta self-serve (gratuito → suscripción activa directa).
export const DEFAULT_PLAN_SLUG = "basico";

const BCRYPT_COST = 12;

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface TenantAdminUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  name: string | null;
}

export interface ProvisionInput {
  tenantName: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
}

export interface TenantUpdateInput {
  name?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
  isActive?: boolean;
  planId?: string;
}

export interface ImpersonationResult {
  accessToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    tenantId: string;
    role: UserRole;
  };
  tenant: { id: string; name: string; slug: string };
}

export interface ListTenantsInput {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

// Contrato de persistencia. Tenant no extiende BaseRepository: la tabla
// tenants ES el tenant, no tiene columna tenant_id (solo la opera super_admin).
export interface TenantsRepository {
  findTenantBySlug(slug: string): Promise<{ id: string } | null>;
  findUserByEmailGlobal(email: string): Promise<{ id: string } | null>;
  findPlanBySlug(slug: string): Promise<{ id: string; isActive: boolean } | null>;
  findPlanById(id: string): Promise<{ id: string; isActive: boolean } | null>;
  // Transaccional: tenant + admin + suscripción, todo o nada.
  createTenantWithAdmin(data: {
    tenantName: string;
    slug: string;
    planId: string;
    adminEmail: string;
    adminPasswordHash: string;
    adminName?: string;
  }): Promise<{ tenant: TenantSummary; user: TenantAdminUser }>;
  listTenants(args: {
    search?: string;
    isActive?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ items: unknown[]; total: number }>;
  findTenantById(id: string): Promise<unknown | null>;
  findActiveTenantAdmin(
    tenantId: string,
  ): Promise<{ id: string; email: string; name: string | null } | null>;
  updateTenant(id: string, data: Omit<TenantUpdateInput, "planId">): Promise<unknown>;
  updateSubscriptionPlan(tenantId: string, planId: string): Promise<void>;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export class TenantsService {
  constructor(private readonly repo: TenantsRepository) {}

  // Alta de inmobiliaria + usuario admin. Usado por /auth/register (self-serve)
  // y por el super admin (POST /admin/tenants).
  async provision(input: ProvisionInput): Promise<{
    tenant: TenantSummary;
    user: TenantAdminUser;
  }> {
    if (await this.repo.findTenantBySlug(input.slug)) {
      throw new ConflictError("Ese slug ya está en uso");
    }
    // Email único global mientras el login no resuelve tenant (evita
    // ambigüedad en findUserByEmail del módulo auth).
    if (await this.repo.findUserByEmailGlobal(input.adminEmail)) {
      throw new ConflictError("Ese email ya está registrado");
    }

    const plan = await this.repo.findPlanBySlug(DEFAULT_PLAN_SLUG);
    if (!plan || !plan.isActive) {
      // Config rota (falta el seed), no un error del cliente.
      throw new AppError(`No existe el plan por defecto "${DEFAULT_PLAN_SLUG}"`);
    }

    try {
      return await this.repo.createTenantWithAdmin({
        tenantName: input.tenantName,
        slug: input.slug,
        planId: plan.id,
        adminEmail: input.adminEmail,
        adminPasswordHash: await bcrypt.hash(input.adminPassword, BCRYPT_COST),
        adminName: input.adminName,
      });
    } catch (e) {
      // P2002 = violación de unique. Solo puede pasar si otra alta con el mismo
      // email o slug entró entre los chequeos de arriba y este insert: la
      // carrera que un chequeo previo no puede cerrar. Traducirlo acá y no
      // dejarlo caer al handler global es por el mensaje: el genérico dice
      // "ya existe un registro con esos datos únicos" y expone la columna, así
      // que la respuesta dependería de un milisegundo de diferencia.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const campos = (e.meta?.target as string[] | undefined) ?? [];
        throw campos.includes("slug")
          ? new ConflictError("Ese slug ya está en uso")
          : new ConflictError("Ese email ya está registrado");
      }
      throw e;
    }
  }

  async list(input: ListTenantsInput) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
    const { items, total } = await this.repo.listTenants({
      search: input.search,
      isActive: input.isActive,
      page,
      pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getById(id: string): Promise<unknown> {
    const tenant = await this.repo.findTenantById(id);
    if (!tenant) throw new NotFoundError("Inmobiliaria no encontrada");
    return tenant;
  }

  async update(id: string, input: TenantUpdateInput): Promise<unknown> {
    await this.getById(id);

    const { planId, ...tenantData } = input;
    if (planId) {
      const plan = await this.repo.findPlanById(planId);
      if (!plan || !plan.isActive) throw new NotFoundError("Plan no encontrado");
      await this.repo.updateSubscriptionPlan(id, planId);
    }
    return this.repo.updateTenant(id, tenantData);
  }

  /**
   * Abre una sesión de soporte sobre una inmobiliaria: devuelve un token con
   * la identidad de su tenant_admin, marcado como solo lectura.
   *
   * No chequea que la inmobiliaria esté activa a propósito. Una suspendida es
   * justo cuando más falta hace mirar su panel.
   */
  async impersonate(tenantId: string, actorId: string): Promise<ImpersonationResult> {
    // getById tira NotFoundError si no existe; devuelve la fila cruda.
    const tenant = (await this.getById(tenantId)) as {
      id: string;
      name: string;
      slug: string;
    };

    const admin = await this.repo.findActiveTenantAdmin(tenantId);
    if (!admin) {
      throw new ValidationError(
        "La inmobiliaria no tiene un administrador activo al que suplantar",
      );
    }

    const { token, expiresAt } = signImpersonationToken(
      { userId: admin.id, tenantId },
      actorId,
    );

    return {
      accessToken: token,
      expiresAt,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        tenantId,
        role: "tenant_admin",
      },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    };
  }
}
