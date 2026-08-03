import { timingSafeEqual } from "node:crypto";
import { logger } from "@/config/logger";
import { subdominioDe } from "@/shared/middleware/resolveTenant";
import { normalizarNombre } from "@/shared/services/dns";

/**
 * Consultas que necesita la autorización de certificados. Cruzan inmobiliarias
 * a propósito —la pregunta es "¿este host es de alguien?"— así que no pasan por
 * `BaseRepository`, igual que las del catálogo público y las de `resolveTenant`.
 */
export interface CertificateAuthorizationRepository {
  /** ¿Hay una inmobiliaria activa con ese slug? Para los subdominios. */
  hasActiveTenantWithSlug(slug: string): Promise<boolean>;
  /**
   * ¿Alguna inmobiliaria activa cargó ese dominio propio, en un estado que
   * amerite certificado?
   */
  hasCertifiableDomain(domain: string): Promise<boolean>;
}

export interface CaddyAskConfig {
  platformDomain: string;
  /** Secreto compartido con Caddy. Vacío = el endpoint no autoriza nada. */
  askToken: string;
}

/**
 * Decide si Caddy puede emitir un certificado para un host (tarea 4.10).
 *
 * Caddy usa On-Demand TLS para las webs de las inmobiliarias: emite el
 * certificado en la primera visita, sin reiniciar ni conocer la lista de
 * dominios de antemano. Antes de emitir pregunta acá.
 *
 * Sin esta autorización, cualquiera que apunte su dominio a la IP del VPS hace
 * que Caddy pida un certificado a nombre nuestro. Let's Encrypt permite 50 por
 * semana y por dominio registrado: un tercero agota la cuota en minutos y deja
 * a las inmobiliarias reales sin poder renovar.
 */
export class CaddyAskService {
  constructor(
    private readonly repo: CertificateAuthorizationRepository,
    private readonly config: CaddyAskConfig,
  ) {}

  /**
   * Comparación en tiempo constante: el token viaja en la query de una URL que
   * podría probarse a repetición, y comparar con === filtra por dónde
   * empezaron a diferir.
   */
  tokenIsValid(candidate: unknown): boolean {
    const esperado = this.config.askToken;
    // Sin token configurado se rechaza todo. Si no, un pedido con ?token=
    // vacío quedaría autorizado para pedir el certificado que quiera.
    if (!esperado) {
      logger.warn(
        "CADDY_ASK_TOKEN vacío: no se autoriza ningún certificado. Configuralo antes de exponer Caddy.",
      );
      return false;
    }

    if (typeof candidate !== "string") return false;

    const a = Buffer.from(candidate);
    const b = Buffer.from(esperado);
    // timingSafeEqual exige buffers del mismo largo: el largo del token no es
    // el secreto, el token sí.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Cuatro caminos, en orden: los hosts fijos de la plataforma, el subdominio
   * de una inmobiliaria, el dominio propio, y su variante con www.
   */
  async allowsCertificateFor(rawHost: string): Promise<boolean> {
    const host = normalizarHost(rawHost);
    if (!host) return false;

    const base = normalizarNombre(this.config.platformDomain);

    if (host === base || host === `www.${base}` || host === `cdn.${base}`) {
      return true;
    }

    // Subdominio de la plataforma: vale si la inmobiliaria existe y está
    // activa. `subdominioDe` ya descarta los reservados y los de dos niveles.
    const slug = subdominioDe(host, base);
    if (slug) return this.repo.hasActiveTenantWithSlug(slug);

    // Cualquier host que cuelgue de la plataforma y no haya matcheado antes
    // (reservados, dos niveles) no se certifica: no es de nadie.
    if (host.endsWith(`.${base}`)) return false;

    if (await this.repo.hasCertifiableDomain(host)) return true;

    // El www de un dominio cargado pelado. Nadie carga las dos variantes, y
    // quien controla el DNS de www.midominio.com es el dueño de midominio.com.
    if (host.startsWith("www.")) {
      return this.repo.hasCertifiableDomain(host.slice(4));
    }

    return false;
  }
}

/** "Litoral.COM.ar:443" → "litoral.com.ar". */
function normalizarHost(valor: string): string {
  return normalizarNombre((valor ?? "").split(":")[0]);
}
