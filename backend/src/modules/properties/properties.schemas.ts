import { z } from "zod";
import { localidadSchema } from "@/shared/constants/localidades";

export const propertyTypeSchema = z.enum([
  "apartment",
  "house",
  "land",
  "office",
  "warehouse",
  "commercial",
]);

export const operationTypeSchema = z.enum(["sale", "rent", "temporary_rental"]);

export const propertyStatusSchema = z.enum([
  "draft",
  "published",
  "paused",
  "featured",
]);

// Plata como string decimal, igual que en planes: nunca float.
const priceSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Precio inválido: usar formato decimal, ej. 185000.00");

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

// Hasta 30 características ("parrilla", "pileta"…). El tope evita que un
// cliente infle la tabla property_features sin control.
const featuresSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(30, "Máximo 30 características")
  .optional();

const baseProperty = {
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres").max(255),
  description: z.string().trim().max(20_000).optional(),
  propertyType: propertyTypeSchema,
  operationType: operationTypeSchema,
  price: priceSchema,
  currency: z.string().length(3).toUpperCase().optional(),
  address: z.string().trim().max(500).optional(),
  // Obligatoria y del catálogo. Una propiedad sin localidad no aparece en el
  // filtro del portal ni cuenta para el reparto de tasaciones, así que la
  // inmobiliaria queda fuera de esa localidad sin enterarse.
  city: localidadSchema,
  // `state` no está y no es un olvido: todas las localidades del catálogo son
  // de Entre Ríos, así que la provincia se deduce de la localidad. La constante
  // `PROVINCIA` es la que se muestra y la que va al JSON-LD. La columna sigue
  // existiendo en la base por las filas viejas; nada nuevo la escribe.
  country: z.string().trim().max(120).optional(),
  lat: latitude.optional(),
  lng: longitude.optional(),
  areaM2: z.number().positive().max(10_000_000).optional(),
  rooms: z.number().int().nonnegative().max(100).optional(),
  bathrooms: z.number().int().nonnegative().max(100).optional(),
  parking: z.number().int().nonnegative().max(100).optional(),
  floor: z.number().int().min(-10).max(300).optional(),
  yearBuilt: z.number().int().min(1800).max(2200).optional(),
  features: featuresSchema,
};

// El alta siempre nace en draft: publicar es una acción aparte y explícita.
export const createPropertySchema = z.object(baseProperty);
export type CreatePropertyBody = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z
  .object({
    ...baseProperty,
    title: baseProperty.title.optional(),
    // En la edición es opcional como el resto: un PATCH que no la manda deja
    // la que ya estaba. Lo que no puede es mandarla vacía o fuera del catálogo.
    city: localidadSchema.optional(),
    propertyType: propertyTypeSchema.optional(),
    operationType: operationTypeSchema.optional(),
    price: priceSchema.optional(),
    status: propertyStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "El body no puede estar vacío",
  });
export type UpdatePropertyBody = z.infer<typeof updatePropertySchema>;

export const changeStatusSchema = z.object({ status: propertyStatusSchema });
export type ChangeStatusBody = z.infer<typeof changeStatusSchema>;

export const listPropertiesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: propertyStatusSchema.optional(),
  propertyType: propertyTypeSchema.optional(),
  operationType: operationTypeSchema.optional(),
  city: localidadSchema.optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
  sort: z.enum(["recent", "price_asc", "price_desc", "views"]).default("recent"),
});
export type ListPropertiesQuery = z.infer<typeof listPropertiesQuerySchema>;
