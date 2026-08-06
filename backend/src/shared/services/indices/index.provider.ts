import type { PuntoSerie } from "@/modules/calculators/calculators.math";
import type { Serie } from "./catalogo";

/**
 * Contrato de las series de índices que alimentan las calculadoras.
 *
 * Mismo patrón que StorageProvider, PaymentProvider y DnsResolver: una
 * interfaz, una implementación contra el organismo oficial y una falsa para
 * tests y para desarrollo sin red.
 *
 * Qué series existen y de dónde salen lo dice `catalogo.ts`, no este archivo.
 */
export interface IndexProvider {
  readonly name: string;

  /**
   * Serie completa, **ordenada de forma ascendente por fecha**. Todo el resto
   * del código asume ese orden: `valorVigente` recorre hasta pasarse de la
   * fecha pedida.
   */
  obtener(serie: Serie): Promise<PuntoSerie[]>;
}

export type { PuntoSerie };
