import { normalizarNombre, type DnsResolver } from "./dns.resolver";

export interface ZonaFalsa {
  cname?: Record<string, string[]>;
  a?: Record<string, string[]>;
  txt?: Record<string, string[]>;
}

/**
 * Zona DNS en memoria. Sirve para tests y para desarrollo local, donde
 * `panel.midominio.test` no resuelve en ningún lado.
 *
 * Un nombre ausente devuelve lista vacía, igual que el resolver real ante un
 * NXDOMAIN.
 */
export class FakeDnsResolver implements DnsResolver {
  readonly name = "fake";

  constructor(private zona: ZonaFalsa = {}) {}

  /** Reemplaza la zona entera. Cómodo entre casos de un mismo test. */
  setZona(zona: ZonaFalsa): void {
    this.zona = zona;
  }

  resolveCname(hostname: string): Promise<string[]> {
    return this.buscar(this.zona.cname, hostname);
  }

  resolveA(hostname: string): Promise<string[]> {
    return this.buscar(this.zona.a, hostname);
  }

  resolveTxt(hostname: string): Promise<string[]> {
    return this.buscar(this.zona.txt, hostname);
  }

  private buscar(
    tabla: Record<string, string[]> | undefined,
    hostname: string,
  ): Promise<string[]> {
    return Promise.resolve(tabla?.[normalizarNombre(hostname)] ?? []);
  }
}
