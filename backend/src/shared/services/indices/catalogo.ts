/**
 * Catálogo de las series de índices que alimentan la calculadora.
 *
 * Es la única fuente de verdad sobre qué series existen: de dónde se bajan,
 * cómo se llaman y cada cuánto las publica el organismo. Antes esa información
 * estaba repartida entre el provider (la URL), el service (el mensaje de error)
 * y el frontend (la etiqueta del botón), y sumar una serie obligaba a tocar los
 * tres. Ahora es una fila acá.
 *
 * Los índices son datos públicos nacionales y no pertenecen a ninguna
 * inmobiliaria: en todo este archivo no hay tenantId por ningún lado.
 *
 * CAC (Cámara Argentina de la Construcción) y CasaPropia no están, y es a
 * propósito: no publican API, solo una planilla mensual. Una serie que alguien
 * tiene que cargar a mano devuelve un número viejo sin avisar, y eso en una
 * calculadora con la que se firma un contrato es peor que no ofrecerla.
 */

export const SERIES = ["icl", "cer", "uva", "ipc", "is", "ipim"] as const;

export type Serie = (typeof SERIES)[number];

/**
 * Cada cuánto publica el organismo. Decide qué índice le toca a un tramo: en
 * las diarias, el último día hábil; en las mensuales, el mes anterior.
 */
export type Frecuencia = "diaria" | "mensual";

export type Fuente =
  | { tipo: "bcra"; idVariable: number }
  | { tipo: "datosGob"; idSerie: string };

export interface Descriptor {
  /** Lo que dice el botón: "ICL". */
  etiqueta: string;
  /** El nombre completo, para el texto de ayuda: "Índice para Contratos de Locación". */
  nombre: string;
  /** Quién lo publica. Va en el aviso legal al pie de la calculadora. */
  organismo: string;
  frecuencia: Frecuencia;
  fuente: Fuente;
}

export const CATALOGO: Record<Serie, Descriptor> = {
  icl: {
    etiqueta: "ICL",
    nombre: "Índice para Contratos de Locación",
    organismo: "BCRA",
    frecuencia: "diaria",
    fuente: { tipo: "bcra", idVariable: 40 },
  },
  cer: {
    etiqueta: "CER",
    nombre: "Coeficiente de Estabilización de Referencia",
    organismo: "BCRA",
    frecuencia: "diaria",
    fuente: { tipo: "bcra", idVariable: 30 },
  },
  uva: {
    etiqueta: "UVA",
    nombre: "Unidad de Valor Adquisitivo",
    organismo: "BCRA",
    frecuencia: "diaria",
    fuente: { tipo: "bcra", idVariable: 31 },
  },
  ipc: {
    etiqueta: "IPC",
    nombre: "Índice de Precios al Consumidor",
    organismo: "INDEC",
    frecuencia: "mensual",
    fuente: { tipo: "datosGob", idSerie: "148.3_INIVELNAL_DICI_M_26" },
  },
  is: {
    etiqueta: "IS",
    nombre: "Índice de Salarios",
    organismo: "INDEC",
    frecuencia: "mensual",
    fuente: { tipo: "datosGob", idSerie: "149.1_TL_INDIIOS_OCTU_0_21" },
  },
  ipim: {
    etiqueta: "IPIM",
    nombre: "Índice de Precios Internos al por Mayor",
    organismo: "INDEC",
    frecuencia: "mensual",
    fuente: { tipo: "datosGob", idSerie: "448.1_NIVEL_GENERAL_0_0_13_46" },
  },
};
