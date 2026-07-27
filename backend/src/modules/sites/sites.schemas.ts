import { z } from "zod";

// Color en hexadecimal de 6 dígitos: es lo que guarda la columna (VarChar(7))
// y lo que el frontend puede pasar a canales para las CSS variables.
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido: usá formato #RRGGBB");

const urlOpcional = z.string().trim().url("URL inválida").max(500);

export const updateSiteConfigSchema = z
  .object({
    primaryColor: hexColor.nullable().optional(),
    secondaryColor: hexColor.nullable().optional(),
    heroTitle: z.string().trim().max(160).nullable().optional(),
    heroSubtitle: z.string().trim().max(240).nullable().optional(),
    aboutText: z.string().trim().max(4000).nullable().optional(),
    socialFacebook: urlOpcional.nullable().optional(),
    socialInstagram: urlOpcional.nullable().optional(),
    // WhatsApp se guarda como número, no como URL: el enlace lo arma el front.
    socialWhatsapp: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{6,30}$/, "Teléfono inválido")
      .nullable()
      .optional(),
    showFeaturedOnly: z.boolean().optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });

export type UpdateSiteConfigBody = z.infer<typeof updateSiteConfigSchema>;

export const ALLOWED_CAROUSEL_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type CarouselContentType = keyof typeof ALLOWED_CAROUSEL_TYPES;

export const MAX_CAROUSEL_BYTES = 15 * 1024 * 1024;
/** Tope de imágenes por carrousel: más que esto no lo mira nadie y pesa. */
export const MAX_CAROUSEL_IMAGES = 10;

export const createCarouselUploadSchema = z.object({
  contentType: z.enum(
    Object.keys(ALLOWED_CAROUSEL_TYPES) as [CarouselContentType, ...CarouselContentType[]],
    { errorMap: () => ({ message: "Tipo de archivo no permitido" }) },
  ),
  sizeBytes: z.number().int().positive("El archivo está vacío"),
  caption: z.string().trim().max(255).optional(),
  linkUrl: urlOpcional.optional(),
});

export type CreateCarouselUploadBody = z.infer<typeof createCarouselUploadSchema>;

export const updateCarouselSchema = z
  .object({
    caption: z.string().trim().max(255).nullable().optional(),
    linkUrl: urlOpcional.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });

export type UpdateCarouselBody = z.infer<typeof updateCarouselSchema>;

export const reorderCarouselSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Mandá al menos un id"),
});

export type ReorderCarouselBody = z.infer<typeof reorderCarouselSchema>;
