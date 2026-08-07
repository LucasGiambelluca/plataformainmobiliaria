import {
  TenantsService,
  type TenantsRepository,
} from "@/modules/tenants/tenants.service";
import { verifyAccessToken } from "@/shared/services/jwt.service";
import { NotFoundError, ValidationError } from "@/shared/errors";

const TENANT = {
  id: "t-1",
  name: "Inmobiliaria Demo",
  slug: "demo",
  isActive: true,
};

const ADMIN = { id: "ta-1", email: "ana@demo.com", name: "Ana" };

function makeService(overrides: Partial<TenantsRepository> = {}) {
  const repo = {
    findTenantById: jest.fn().mockResolvedValue(TENANT),
    findActiveTenantAdmin: jest.fn().mockResolvedValue(ADMIN),
    ...overrides,
  } as unknown as TenantsRepository;
  return { service: new TenantsService(repo), repo };
}

describe("TenantsService.impersonate", () => {
  it("emite un token con la identidad del tenant_admin y el super admin en act", async () => {
    const { service } = makeService();

    const result = await service.impersonate(TENANT.id, "sa-1");

    expect(verifyAccessToken(result.accessToken)).toMatchObject({
      sub: ADMIN.id,
      tenant: TENANT.id,
      role: "tenant_admin",
      act: "sa-1",
      ro: true,
    });
    expect(result.user).toEqual({
      id: ADMIN.id,
      email: ADMIN.email,
      name: ADMIN.name,
      tenantId: TENANT.id,
      role: "tenant_admin",
    });
    expect(result.tenant).toEqual({
      id: TENANT.id,
      name: TENANT.name,
      slug: TENANT.slug,
    });
  });

  it("404 si la inmobiliaria no existe", async () => {
    const { service } = makeService({
      findTenantById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.impersonate("no-existe", "sa-1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("422 si no tiene ningún administrador activo", async () => {
    const { service } = makeService({
      findActiveTenantAdmin: jest.fn().mockResolvedValue(null),
    });

    await expect(service.impersonate(TENANT.id, "sa-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("una inmobiliaria suspendida se puede suplantar igual", async () => {
    // Es justo cuando más falta hace mirar su panel: la suspendieron y llama
    // preguntando por qué no le funciona nada.
    const { service } = makeService({
      findTenantById: jest.fn().mockResolvedValue({ ...TENANT, isActive: false }),
    });

    await expect(service.impersonate(TENANT.id, "sa-1")).resolves.toMatchObject({
      tenant: { slug: "demo" },
    });
  });
});
