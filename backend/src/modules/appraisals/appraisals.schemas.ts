import { z } from "zod";
import { localidadSchema } from "@/shared/constants/localidades";

/**
 * Contrato del formulario de solicitud de tasación.
 *
 * Lo llena un propietario sin cuenta, así que todo lo que llega es texto de un
 * desconocido: los largos están acotados campo por campo para que nadie use el
 * formulario como depósito, y `details` se valida con la misma dureza que el
 * resto aunque en la base sea una columna Json.
 */

export const APPRAISAL_PROPERTY_TYPES = [
  "house",
  "apartment",
  "ph",
  "duplex",
  "commercial",
  "office",
  "warehouse",
  "land",
  "farm",
  "country_house",
  "ranch",
  "other",
] as const;

export const APPRAISAL_PURPOSES = ["sale", "rent", "sale_and_rent", "other"] as const;

export const APPRAISAL_CONDITIONS = [
  "excellent",
  "very_good",
  "good",
  "fair",
  "to_renovate",
] as const;

export const APPRAISAL_STATUSES = [
  "unassigned",
  "new",
  "contacted",
  "completed",
  "discarded",
] as const;

const APPRAISAL_REASONS = [
  "sale",
  "rent",
  "inheritance",
  "division",
  "investment",
  "moving",
  "other",
] as const;

const APPRAISAL_TIMEFRAMES = [
  "immediate",
  "within_30_days",
  "1_to_3_months",
  "3_to_6_months",
  "just_curious",
] as const;

/** Lista corta de etiquetas: se guardan como vinieron, acotadas en cantidad. */
const etiquetas = (max: number) =>
  z.array(z.string().trim().min(1).max(60)).max(max).optional();

const metrosOpcional = z.coerce.number().positive().max(10_000_000).optional();

/**
 * Los siete desplegables opcionales.
 *
 * `details` es una columna Json y la base no le impone forma, así que este
 * schema es la única barrera: lo que no esté declarado acá **no llega a la
 * fila**. Se apoya en el descarte por defecto de Zod y no en `.strict()`, que
 * rechazaría el formulario entero por una clave de más — mismo criterio que el
 * middleware `validate`, y el que corresponde en un formulario público donde
 * el frontend puede ir por delante del backend.
 */
export const appraisalDetailsSchema = z
  .object({
    surfaces: z
      .object({
        land: metrosOpcional,
        covered: metrosOpcional,
        semiCovered: metrosOpcional,
        uncovered: metrosOpcional,
      })
      .optional(),
    ageYears: z.coerce.number().int().min(0).max(500).optional(),
    spaces: etiquetas(20),
    services: etiquetas(20),
    amenities: etiquetas(30),
    situation: z
      .object({
        hasDeed: z.boolean().optional(),
        isRented: z.boolean().optional(),
        wasRenovated: z.boolean().optional(),
        lastRenovationYear: z.coerce.number().int().min(1800).max(2200).optional(),
      })
      .optional(),
    estimatedValue: z.string().trim().max(120).optional(),
    reason: z.enum(APPRAISAL_REASONS).optional(),
    timeframe: z.enum(APPRAISAL_TIMEFRAMES).optional(),
  });

export const createAppraisalSchema = z.object({
  // Solicitante
  name: z.string().trim().min(2, "Ingresá tu nombre y apellido").max(255),
  // Obligatorio: es la vía por la que la inmobiliaria devuelve la tasación.
  phone: z.string().trim().min(6, "Ingresá un teléfono de contacto").max(50),
  email: z.string().trim().email("Correo inválido").max(255),

  // Propiedad
  // Del catálogo, no texto libre: es la clave con la que se busca a qué
  // inmobiliaria le toca la solicitud.
  city: localidadSchema,
  neighborhood: z.string().trim().max(120).optional(),
  address: z.string().trim().min(3, "Ingresá la dirección").max(255),
  propertyType: z.enum(APPRAISAL_PROPERTY_TYPES, {
    errorMap: () => ({ message: "Elegí un tipo de propiedad de la lista" }),
  }),
  purpose: z.enum(APPRAISAL_PURPOSES, {
    errorMap: () => ({ message: "Elegí el destino de la tasación" }),
  }),

  // Características básicas
  areaM2: z.coerce.number().positive().max(10_000_000).optional(),
  rooms: z.coerce.number().int().min(0).max(100).optional(),
  bathrooms: z.coerce.number().int().min(0).max(100).optional(),
  condition: z.enum(APPRAISAL_CONDITIONS).optional(),
  comments: z.string().trim().max(2000).optional(),

  details: appraisalDetailsSchema.optional(),

  /** Inmobiliaria elegida. Sin esto, la asigna el portal por turno. */
  tenantId: z.string().uuid("Inmobiliaria inválida").optional(),
  /** Agrupa las fotos subidas antes de mandar el formulario. */
  draftId: z.string().uuid().optional(),

  // Consentimientos. Literal(true): un checkbox sin tildar no pasa.
  declaredAccurate: z.literal(true, {
    errorMap: () => ({ message: "Confirmá que los datos son correctos" }),
  }),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({
      message: "Tenés que aceptar los términos y la política de privacidad",
    }),
  }),

  // Honeypot: los humanos no lo ven, los bots lo llenan.
  website: z.string().max(200).optional(),
});

export type CreateAppraisalBody = z.infer<typeof createAppraisalSchema>;

export const listAppraisalsQuerySchema = z.object({
  status: z.enum(APPRAISAL_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListAppraisalsQuery = z.infer<typeof listAppraisalsQuerySchema>;

export const updateAppraisalSchema = z.object({
  // `unassigned` queda afuera: es un estado que pone el servidor cuando no
  // encuentra inmobiliaria, no algo a lo que se pueda volver a mano.
  status: z.enum(["new", "contacted", "completed", "discarded"]),
});

export type UpdateAppraisalBody = z.infer<typeof updateAppraisalSchema>;

export const participantsQuerySchema = z.object({
  city: localidadSchema.optional(),
});

/** Firma de subida de una foto. Solo imágenes: los videos no entran acá. */
export const appraisalUploadUrlSchema = z.object({
  draftId: z.string().uuid().optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    errorMap: () => ({ message: "Solo se pueden adjuntar fotos JPG, PNG o WebP" }),
  }),
  sizeBytes: z.coerce.number().int().positive(),
});

export type AppraisalUploadUrlBody = z.infer<typeof appraisalUploadUrlSchema>;

export const appraisalConfirmMediaSchema = z.object({
  // El draft hace de credencial: es lo único que separa a dos anónimos.
  draftId: z.string().uuid(),
});

export type AppraisalConfirmMediaBody = z.infer<typeof appraisalConfirmMediaSchema>;
