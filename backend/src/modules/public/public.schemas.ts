import { z } from "zod";
import {
  operationTypeSchema,
  propertyTypeSchema,
} from "@/modules/properties/properties.schemas";

// El catálogo público no acepta filtro de estado: qué es visible lo decide el
// servidor, nunca el cliente.
export const publicCatalogQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  operationType: operationTypeSchema.optional(),
  propertyType: propertyTypeSchema.optional(),
  city: z.string().trim().min(1).max(120).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  minRooms: z.coerce.number().int().nonnegative().max(100).optional(),
  agency: z.string().trim().min(1).max(100).optional(),
  // Solo destacadas, para el carrusel de la home. Es un subconjunto de lo
  // visible, no una forma de pedir otros estados.
  onlyFeatured: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(60).optional(),
  sort: z.enum(["relevance", "recent", "price_asc", "price_desc"]).default("relevance"),
});

export type PublicCatalogQuery = z.infer<typeof publicCatalogQuerySchema>;
