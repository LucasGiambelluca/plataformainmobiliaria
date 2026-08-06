import { z } from "zod";
import { SERIES } from "@/shared/services/indices";

// Un monto de contrato: positivo y acotado por arriba para que un número
// absurdo no llegue al cálculo y vuelva como Infinity.
const monto = z
  .number({ invalid_type_error: "El monto tiene que ser un número" })
  .positive("El monto tiene que ser mayor a cero")
  .max(1_000_000_000_000, "El monto es demasiado grande");

const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que tener el formato AAAA-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "La fecha no existe");

export const cronogramaSchema = z.object({
  montoInicial: monto,
  fechaInicio: fechaIso,
  // Doce es el techo del formulario y también el de la ley: un contrato no se
  // ajusta con período mayor a un año.
  mesesPeriodo: z.coerce
    .number()
    .int("El período tiene que ser un número entero de meses")
    .min(1, "El período va de 1 a 12 meses")
    .max(12, "El período va de 1 a 12 meses"),
  serie: z.enum(SERIES, {
    errorMap: () => ({ message: "Índice desconocido" }),
  }),
});

export type CronogramaBody = z.infer<typeof cronogramaSchema>;
