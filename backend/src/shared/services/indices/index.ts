import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { FakeIndexProvider } from "./fake.provider";
import { OficialIndexProvider } from "./oficial.provider";
import type { IndexProvider } from "./index.provider";

export type { IndexProvider, PuntoSerie } from "./index.provider";
export type { Serie, Frecuencia, Fuente, Descriptor } from "./catalogo";
export { SERIES, CATALOGO } from "./catalogo";
export { FakeIndexProvider } from "./fake.provider";
export { OficialIndexProvider } from "./oficial.provider";

export function createIndexProvider(): IndexProvider {
  if (env.INDEX_PROVIDER === "fake") {
    logger.warn(
      "INDEX_PROVIDER=fake: las calculadoras usan índices inventados, no los del BCRA ni el INDEC. Solo para desarrollo.",
    );
    return new FakeIndexProvider();
  }
  return new OficialIndexProvider();
}

/** Instancia compartida por el módulo de calculadoras. */
export const indexProvider = createIndexProvider();
