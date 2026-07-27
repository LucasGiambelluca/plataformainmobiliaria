import { z } from "zod";

export const mediaTypeSchema = z.enum(["image", "video"]);

const MB = 1024 * 1024;

/**
 * Tipos aceptados y su extensión. Es una lista blanca a propósito: el
 * Content-Type viaja firmado en la URL de subida, así que lo que no está acá
 * no se puede subir aunque el cliente lo intente.
 */
export const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": { type: "image", ext: "jpg" },
  "image/png": { type: "image", ext: "png" },
  "image/webp": { type: "image", ext: "webp" },
  "image/avif": { type: "image", ext: "avif" },
  "video/mp4": { type: "video", ext: "mp4" },
  "video/webm": { type: "video", ext: "webm" },
  "video/quicktime": { type: "video", ext: "mov" },
} as const satisfies Record<string, { type: "image" | "video"; ext: string }>;

export type AllowedContentType = keyof typeof ALLOWED_CONTENT_TYPES;

/**
 * Extensión → Content-Type esperado. Permite reconstruir qué se firmó a partir
 * de la clave del objeto, sin guardar una columna extra, para contrastarlo con
 * lo que quedó realmente almacenado.
 */
export const CONTENT_TYPE_BY_EXT: Record<string, AllowedContentType> = Object.entries(
  ALLOWED_CONTENT_TYPES,
).reduce<Record<string, AllowedContentType>>((acc, [contentType, { ext }]) => {
  acc[ext] = contentType as AllowedContentType;
  return acc;
}, {});

/** Tope por archivo, además del límite de storage del plan. */
export const MAX_SIZE_BYTES = {
  image: 15 * MB,
  video: 500 * MB,
} as const;

const contentTypeSchema = z.enum(
  Object.keys(ALLOWED_CONTENT_TYPES) as [AllowedContentType, ...AllowedContentType[]],
  { errorMap: () => ({ message: "Tipo de archivo no permitido" }) },
);

export const createUploadSchema = z.object({
  contentType: contentTypeSchema,
  // Tamaño declarado por el cliente: sirve para rechazar temprano, pero se
  // vuelve a verificar contra el objeto real al confirmar.
  sizeBytes: z.number().int().positive("El archivo está vacío"),
});
export type CreateUploadBody = z.infer<typeof createUploadSchema>;

export const updateMediaSchema = z
  .object({
    sortOrder: z.number().int().nonnegative().optional(),
    isCover: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });
export type UpdateMediaBody = z.infer<typeof updateMediaSchema>;

// El orden lo define la posición en el array: el cliente manda la lista final.
export const reorderMediaSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Mandá al menos un id"),
});
export type ReorderMediaBody = z.infer<typeof reorderMediaSchema>;
