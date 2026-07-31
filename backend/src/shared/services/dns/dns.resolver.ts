/**
 * Contrato de resolución DNS.
 *
 * Existe como interfaz por la misma razón que StorageProvider y
 * PaymentProvider: verificar un dominio propio depende de un sistema externo
 * que no controlamos y que en un test no puede consultarse de verdad. Los
 * tests inyectan `FakeDnsResolver` y describen la zona que quieren probar.
 *
 * Todos los métodos devuelven un array vacío cuando el nombre no existe o no
 * tiene ese tipo de registro. Un dominio recién comprado responde NXDOMAIN y
 * eso NO es un error de la plataforma: es el estado normal de "todavía no
 * apunta a ningún lado".
 */
export interface DnsResolver {
  readonly name: string;

  /** Registros CNAME del nombre. Devueltos en minúsculas y sin punto final. */
  resolveCname(hostname: string): Promise<string[]>;

  /** Direcciones IPv4 del nombre. */
  resolveA(hostname: string): Promise<string[]>;

  /** Registros TXT del nombre, ya concatenados por registro. */
  resolveTxt(hostname: string): Promise<string[]>;
}

/** "Plataforma.com." → "plataforma.com". Los CNAME suelen venir con punto final. */
export function normalizarNombre(valor: string): string {
  return valor.trim().toLowerCase().replace(/\.$/, "");
}
