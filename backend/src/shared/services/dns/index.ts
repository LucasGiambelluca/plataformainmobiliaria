import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { FakeDnsResolver } from "./fake.resolver";
import { NodeDnsResolver } from "./node.resolver";
import type { DnsResolver } from "./dns.resolver";

export type { DnsResolver } from "./dns.resolver";
export { normalizarNombre } from "./dns.resolver";
export { FakeDnsResolver, type ZonaFalsa } from "./fake.resolver";
export { NodeDnsResolver } from "./node.resolver";

export function createDnsResolver(): DnsResolver {
  if (env.DNS_RESOLVER === "fake") {
    logger.warn(
      "DNS_RESOLVER=fake: ningún dominio propio va a verificarse contra el DNS real.",
    );
    return new FakeDnsResolver();
  }
  return new NodeDnsResolver();
}

/** Instancia compartida por los módulos que consultan DNS. */
export const dnsResolver = createDnsResolver();
