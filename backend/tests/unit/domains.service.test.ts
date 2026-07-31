import {
  DomainsService,
  type DomainRecord,
  type DomainsRepository,
} from "@/modules/domains/domains.service";
import { FakeDnsResolver } from "@/shared/services/dns";
import {
  BadRequestError,
  ConflictError,
  LimitExceededError,
  NotFoundError,
} from "@/shared/errors";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";
const DOMAIN_ID = "44444444-4444-4444-4444-444444444444";

const CONFIG = { platformDomain: "plataforma.com", dnsTarget: "edge.plataforma.com" };

const DOMAIN: DomainRecord = {
  id: DOMAIN_ID,
  tenantId: TENANT_ID,
  domain: "inmobiliarianorte.com",
  status: "pending",
  dnsTarget: CONFIG.dnsTarget,
  lastCheckedAt: null,
  verifiedAt: null,
  createdAt: new Date("2026-07-30"),
};

function makeRepo(overrides: Partial<DomainsRepository> = {}) {
  const repo: DomainsRepository = {
    listByTenant: jest.fn().mockResolvedValue([DOMAIN]),
    findById: jest.fn().mockResolvedValue(DOMAIN),
    findByDomainForTenant: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(DOMAIN),
    // Devuelve la fila con lo que se le pidió cambiar: alcanza para afirmar
    // sobre el estado resultante sin simular la base.
    updateStatus: jest
      .fn()
      .mockImplementation((id: string, data: Partial<DomainRecord>) =>
        Promise.resolve({ ...DOMAIN, id, ...data }),
      ),
    delete: jest.fn().mockResolvedValue(undefined),
    listAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findAnyById: jest
      .fn()
      .mockResolvedValue({ ...DOMAIN, tenantName: "Norte", tenantSlug: "norte" }),
    deleteAny: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
}

const sinLimite = { assertCanAddDomain: jest.fn().mockResolvedValue(undefined) };

function makeService(
  repo: DomainsRepository,
  dns: FakeDnsResolver = new FakeDnsResolver(),
  limits = sinLimite,
) {
  return new DomainsService(repo, limits, dns, CONFIG);
}

describe("DomainsService.list", () => {
  it("acompaña la lista con el target del DNS", async () => {
    const repo = makeRepo();
    const res = await makeService(repo).list(TENANT_ID);

    expect(res.domains).toEqual([DOMAIN]);
    expect(res.dnsTarget).toBe(CONFIG.dnsTarget);
    expect(repo.listByTenant).toHaveBeenCalledWith(TENANT_ID);
  });
});

describe("DomainsService.create", () => {
  beforeEach(() => sinLimite.assertCanAddDomain.mockClear());

  it("crea el dominio congelando el target del DNS", async () => {
    const repo = makeRepo();
    await makeService(repo).create(TENANT_ID, "inmobiliarianorte.com");

    expect(repo.create).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      domain: "inmobiliarianorte.com",
      dnsTarget: CONFIG.dnsTarget,
    });
  });

  it("rechaza el dominio de la plataforma y sus subdominios", async () => {
    // Sin esta guarda, un tenant podría cargar el subdominio de otro y
    // verificarlo sin esfuerzo: ya apunta a nuestro target.
    const service = makeService(makeRepo());

    await expect(service.create(TENANT_ID, "plataforma.com")).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(
      service.create(TENANT_ID, "otrainmobiliaria.plataforma.com"),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("un dominio parecido al de la plataforma sí se acepta", async () => {
    // "malaplataforma.com" termina en "plataforma.com" como texto pero no
    // cuelga de él.
    const repo = makeRepo();
    await expect(
      makeService(repo).create(TENANT_ID, "malaplataforma.com"),
    ).resolves.toBeDefined();
  });

  it("si ya está en la lista del propio tenant → 409 y no consume cupo", async () => {
    const repo = makeRepo({ findByDomainForTenant: jest.fn().mockResolvedValue(DOMAIN) });

    await expect(
      makeService(repo).create(TENANT_ID, "inmobiliarianorte.com"),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(sinLimite.assertCanAddDomain).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("sin cupo en el plan → LimitExceededError antes de tocar la base", async () => {
    const repo = makeRepo();
    const limits = {
      assertCanAddDomain: jest.fn().mockRejectedValue(new LimitExceededError("dominios")),
    };

    await expect(
      makeService(repo, new FakeDnsResolver(), limits).create(TENANT_ID, "otro.com"),
    ).rejects.toBeInstanceOf(LimitExceededError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("DomainsService.verify", () => {
  it("CNAME al target → active con fecha de verificación", async () => {
    const repo = makeRepo();
    const dns = new FakeDnsResolver({
      cname: { "inmobiliarianorte.com": ["edge.plataforma.com."] },
    });

    const { domain, detail } = await makeService(repo, dns).verify(TENANT_ID, DOMAIN_ID);

    expect(domain.status).toBe("active");
    expect(domain.verifiedAt).toBeInstanceOf(Date);
    expect(detail).toBeNull();
  });

  it("registro A que coincide con el del target → active (dominio pelado)", async () => {
    // Un apex no puede tener CNAME: la única forma de apuntarlo es por A.
    const repo = makeRepo();
    const dns = new FakeDnsResolver({
      a: { "inmobiliarianorte.com": ["203.0.113.10"], "edge.plataforma.com": ["203.0.113.10"] },
    });

    const { domain } = await makeService(repo, dns).verify(TENANT_ID, DOMAIN_ID);
    expect(domain.status).toBe("active");
  });

  it("sin registros → verifying (todavía propagando)", async () => {
    const repo = makeRepo();
    const { domain, detail } = await makeService(repo).verify(TENANT_ID, DOMAIN_ID);

    expect(domain.status).toBe("verifying");
    expect(detail).toMatch(/propagar/);
  });

  it("apuntando a otro lado → failed diciendo adónde apunta", async () => {
    const repo = makeRepo();
    const dns = new FakeDnsResolver({
      cname: { "inmobiliarianorte.com": ["otro-hosting.com"] },
      a: { "edge.plataforma.com": ["203.0.113.10"] },
    });

    const { domain, detail } = await makeService(repo, dns).verify(TENANT_ID, DOMAIN_ID);

    expect(domain.status).toBe("failed");
    expect(detail).toContain("otro-hosting.com");
  });

  it("un dominio ya activo que dejó de apuntar vuelve a failed", async () => {
    const activo = { ...DOMAIN, status: "active" as const, verifiedAt: new Date() };
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(activo) });
    const dns = new FakeDnsResolver({
      cname: { "inmobiliarianorte.com": ["otro-hosting.com"] },
    });

    const { domain } = await makeService(repo, dns).verify(TENANT_ID, DOMAIN_ID);

    expect(domain.status).toBe("failed");
    expect(domain.verifiedAt).toBeNull();
  });

  it("el DNS caído no marca el dominio como fallido", async () => {
    // Es un problema nuestro: culpar al usuario de una configuración correcta
    // lo mandaría a tocar registros que ya estaban bien.
    const repo = makeRepo();
    const dns = new FakeDnsResolver();
    jest.spyOn(dns, "resolveCname").mockRejectedValue(new Error("SERVFAIL"));

    await expect(makeService(repo, dns).verify(TENANT_ID, DOMAIN_ID)).rejects.toMatchObject(
      { statusCode: 503 },
    );
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it("el dominio de otro tenant no existe", async () => {
    // findById filtra por (id, tenantId): el repositorio devuelve null y no se
    // revela que el recurso existe en otra inmobiliaria.
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });

    await expect(makeService(repo).verify(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("DomainsService.remove", () => {
  it("borra solo dentro del propio tenant", async () => {
    const repo = makeRepo();
    await makeService(repo).remove(TENANT_ID, DOMAIN_ID);
    expect(repo.delete).toHaveBeenCalledWith(DOMAIN_ID, TENANT_ID);
  });

  it("dominio ajeno → 404 sin borrar nada", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });

    await expect(makeService(repo).remove(TENANT_ID, DOMAIN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });
});

describe("DomainsService (super admin)", () => {
  it("listAll acota el pageSize al máximo", async () => {
    const repo = makeRepo();
    await makeService(repo).listAll({ pageSize: 5000 });

    expect(repo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 100 }),
    );
  });

  it("verifyAny aplica el mismo chequeo DNS, sin atajos", async () => {
    const repo = makeRepo();
    const dns = new FakeDnsResolver({
      cname: { "inmobiliarianorte.com": ["otro-hosting.com"] },
    });

    const { domain } = await makeService(repo, dns).verifyAny(DOMAIN_ID);
    expect(domain.status).toBe("failed");
  });

  it("removeAny sobre un id inexistente → 404", async () => {
    const repo = makeRepo({ findAnyById: jest.fn().mockResolvedValue(null) });

    await expect(makeService(repo).removeAny(DOMAIN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repo.deleteAny).not.toHaveBeenCalled();
  });
});
