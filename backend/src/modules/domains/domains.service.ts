import type { DomainStatus } from "@prisma/client";
import { AppError, BadRequestError, ConflictError, NotFoundError } from "@/shared/errors";
import { logger } from "@/config/logger";
import { normalizarNombre, type DnsResolver } from "@/shared/services/dns";
import type { ListDomainsQuery } from "./domains.schemas";

export interface DomainRecord {
  id: string;
  tenantId: string;
  domain: string;
  status: DomainStatus;
  /** Adónde tiene que apuntar el DNS. Se congela al crear el dominio. */
  dnsTarget: string | null;
  lastCheckedAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

/** Lo que ve el super admin: el dominio más de quién es. */
export interface DomainWithTenant extends DomainRecord {
  tenantName: string;
  tenantSlug: string;
}

export interface VerifyResult {
  domain: DomainRecord;
  /** Qué encontró el chequeo, para mostrarle al usuario por qué no pasó. */
  detail: string | null;
}

export interface DomainsRepository {
  listByTenant(tenantId: string): Promise<DomainRecord[]>;
  findById(id: string, tenantId: string): Promise<DomainRecord | null>;
  /** Búsqueda acotada al tenant: sirve para avisar "ya lo tenés" sin espiar a nadie. */
  findByDomainForTenant(domain: string, tenantId: string): Promise<DomainRecord | null>;
  create(data: {
    tenantId: string;
    domain: string;
    dnsTarget: string;
  }): Promise<DomainRecord>;
  updateStatus(
    id: string,
    data: { status: DomainStatus; lastCheckedAt: Date; verifiedAt?: Date | null },
  ): Promise<DomainRecord>;
  delete(id: string, tenantId: string): Promise<void>;

  /* --- Solo super admin: cruzan tenants a propósito --- */
  listAll(
    query: ListDomainsQuery & { page: number; pageSize: number },
  ): Promise<{ items: DomainWithTenant[]; total: number }>;
  findAnyById(id: string): Promise<DomainWithTenant | null>;
  deleteAny(id: string): Promise<void>;
}

/** Lo único que domains necesita de LimitService. */
export interface DomainLimitChecker {
  assertCanAddDomain(tenantId: string): Promise<void>;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

export class DomainsService {
  constructor(
    private readonly repo: DomainsRepository,
    private readonly limits: DomainLimitChecker,
    private readonly dns: DnsResolver,
    private readonly config: { platformDomain: string; dnsTarget: string },
  ) {}

  /**
   * Devuelve también el target del DNS: el panel tiene que poder mostrar qué
   * hay que configurar antes de que exista el primer dominio.
   */
  async list(
    tenantId: string,
  ): Promise<{ domains: DomainRecord[]; dnsTarget: string }> {
    return {
      domains: await this.repo.listByTenant(tenantId),
      dnsTarget: this.config.dnsTarget,
    };
  }

  async create(tenantId: string, domain: string): Promise<DomainRecord> {
    this.assertNoEsDeLaPlataforma(domain);

    // Chequeo acotado al tenant: si ya es suyo, se lo decimos con nombre y
    // apellido. Si es de otro, el alta va a chocar contra el índice único y el
    // mensaje sale genérico — de quién es no es asunto suyo.
    const propio = await this.repo.findByDomainForTenant(domain, tenantId);
    if (propio) throw new ConflictError("Ese dominio ya está en tu lista");

    await this.limits.assertCanAddDomain(tenantId);

    return this.repo.create({ tenantId, domain, dnsTarget: this.config.dnsTarget });
  }

  /**
   * Consulta el DNS real y actualiza el estado.
   *
   * Es la única forma de que un dominio llegue a `active`: nadie puede
   * marcarlo a mano, ni siquiera el super admin. Un dominio activo hace que
   * `resolveTenant` sirva la web de esta inmobiliaria en ese host, así que
   * activarlo sin comprobar a dónde apunta sería dejar que cualquiera reclame
   * el dominio de un tercero.
   */
  async verify(tenantId: string, id: string): Promise<VerifyResult> {
    const domain = await this.getOwned(id, tenantId);
    return this.verificar(domain);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.getOwned(id, tenantId);
    await this.repo.delete(id, tenantId);
  }

  /* ------------------------------ super admin ------------------------------ */

  async listAll(query: ListDomainsQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const { items, total } = await this.repo.listAll({ ...query, page, pageSize });
    return { items, total, page, pageSize };
  }

  /** Verificación forzada desde el panel global. Aplica el mismo chequeo DNS. */
  async verifyAny(id: string): Promise<VerifyResult> {
    const domain = await this.repo.findAnyById(id);
    if (!domain) throw new NotFoundError("Dominio no encontrado");
    return this.verificar(domain);
  }

  /**
   * Baja desde el panel global. Es la salida para un dominio reclamado de mala
   * fe: como el alta solo exige que el nombre esté libre, alguien podría pedir
   * un dominio ajeno y dejarlo fallando para que su dueño no pueda cargarlo.
   */
  async removeAny(id: string): Promise<void> {
    const domain = await this.repo.findAnyById(id);
    if (!domain) throw new NotFoundError("Dominio no encontrado");
    await this.repo.deleteAny(id);
  }

  /* -------------------------------- internos -------------------------------- */

  private async getOwned(id: string, tenantId: string): Promise<DomainRecord> {
    const domain = await this.repo.findById(id, tenantId);
    if (!domain) throw new NotFoundError("Dominio no encontrado");
    return domain;
  }

  /**
   * Un dominio de la plataforma no se reclama: esos hosts ya los resuelve
   * `resolveTenant` por subdominio. Sin esta regla, un tenant podría cargar el
   * subdominio de otra inmobiliaria y, al verificarlo (apunta a nuestro
   * target, obviamente), quedarse con su web.
   */
  private assertNoEsDeLaPlataforma(domain: string): void {
    const base = normalizarNombre(this.config.platformDomain);
    if (domain === base || domain.endsWith(`.${base}`)) {
      throw new BadRequestError(
        `${base} y sus subdominios los administra la plataforma. Cargá un dominio propio.`,
      );
    }
  }

  private async verificar(domain: DomainRecord): Promise<VerifyResult> {
    const target = normalizarNombre(domain.dnsTarget ?? this.config.dnsTarget);
    const now = new Date();

    let apunta: Apuntado;
    try {
      apunta = await this.apuntaAlTarget(domain.domain, target);
    } catch (err) {
      // Un DNS caído o con timeout es problema nuestro, no del usuario: se
      // deja el estado como estaba en vez de marcarle el dominio como fallido.
      logger.error({ err, domain: domain.domain }, "Falló la consulta DNS");
      throw new AppError(
        "No se pudo consultar el DNS en este momento. Reintentá en unos minutos.",
        503,
        "DNS_UNAVAILABLE",
      );
    }

    if (apunta.ok) {
      const actualizado = await this.repo.updateStatus(domain.id, {
        status: "active",
        lastCheckedAt: now,
        // Se conserva la fecha de la primera verificación: es cuándo empezó a
        // funcionar, no cuándo se lo volvió a chequear.
        verifiedAt: domain.verifiedAt ?? now,
      });
      return { domain: actualizado, detail: null };
    }

    // Sin ningún registro es casi siempre propagación en curso; apuntando a
    // otro lado es una configuración equivocada que hay que corregir.
    const status: DomainStatus = apunta.encontrados.length === 0 ? "verifying" : "failed";
    const actualizado = await this.repo.updateStatus(domain.id, {
      status,
      lastCheckedAt: now,
      verifiedAt: null,
    });

    return {
      domain: actualizado,
      detail:
        apunta.encontrados.length === 0
          ? `Todavía no hay registros DNS para ${domain.domain}. Puede tardar hasta 48 h en propagar.`
          : `${domain.domain} apunta a ${apunta.encontrados.join(", ")} en vez de ${target}.`,
    };
  }

  /**
   * Dos formas válidas de apuntar, porque el DNS no permite una sola:
   * un subdominio usa CNAME al target, y un dominio pelado (apex) no puede
   * tener CNAME, así que se compara su registro A contra el del target.
   */
  private async apuntaAlTarget(hostname: string, target: string): Promise<Apuntado> {
    const cnames = await this.dns.resolveCname(hostname);
    if (cnames.some((c) => normalizarNombre(c) === target)) {
      return { ok: true, encontrados: cnames };
    }

    const [ips, targetIps] = await Promise.all([
      this.dns.resolveA(hostname),
      this.dns.resolveA(target),
    ]);

    const ok = targetIps.length > 0 && ips.some((ip) => targetIps.includes(ip));
    return { ok, encontrados: [...cnames, ...ips] };
  }
}

interface Apuntado {
  ok: boolean;
  /** Adónde apunta hoy. Vacío = el nombre no resuelve a nada. */
  encontrados: string[];
}
