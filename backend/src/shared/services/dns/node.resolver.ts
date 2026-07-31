import { Resolver } from "node:dns/promises";
import { normalizarNombre, type DnsResolver } from "./dns.resolver";

/** Códigos de error de node:dns que significan "no hay registro", no "falló la consulta". */
const SIN_REGISTRO = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

function esSinRegistro(err: unknown): boolean {
  return SIN_REGISTRO.has((err as NodeJS.ErrnoException)?.code ?? "");
}

/**
 * Resolución DNS real contra los servidores públicos.
 *
 * Usa `Resolver` y no las funciones sueltas de `dns/promises` por dos motivos:
 * permite fijar los servidores y un timeout, y evita el caché del sistema
 * operativo. Lo segundo importa: si el usuario acaba de corregir su CNAME, una
 * respuesta cacheada le haría creer que sigue mal configurado.
 *
 * Los servidores por defecto son los públicos de Cloudflare y Google. En un VPS
 * el resolver del sistema suele ser el del proveedor, con TTLs propios y a
 * veces con respuestas filtradas.
 */
export class NodeDnsResolver implements DnsResolver {
  readonly name = "node";
  private readonly resolver: Resolver;

  constructor(options: { servers?: string[]; timeoutMs?: number } = {}) {
    this.resolver = new Resolver({ timeout: options.timeoutMs ?? 5000, tries: 2 });
    this.resolver.setServers(options.servers ?? ["1.1.1.1", "8.8.8.8"]);
  }

  async resolveCname(hostname: string): Promise<string[]> {
    return this.consultar(() => this.resolver.resolveCname(hostname)).then((rs) =>
      rs.map(normalizarNombre),
    );
  }

  async resolveA(hostname: string): Promise<string[]> {
    return this.consultar(() => this.resolver.resolve4(hostname));
  }

  async resolveTxt(hostname: string): Promise<string[]> {
    // node devuelve cada TXT partido en chunks de 255 bytes.
    const registros = await this.consultar(() => this.resolver.resolveTxt(hostname));
    return (registros as unknown as string[][]).map((chunks) => chunks.join(""));
  }

  /**
   * "No existe" se responde como lista vacía; cualquier otra falla (timeout,
   * SERVFAIL) se propaga. La diferencia importa: un dominio sin configurar
   * tiene que quedar `failed` con un motivo claro, mientras que un DNS caído
   * es un problema nuestro y no debería marcarle el dominio como fallido.
   */
  private async consultar<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (err) {
      if (esSinRegistro(err)) return [];
      throw err;
    }
  }
}
