import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ValidationError } from "@/shared/errors";

// Valida req.body con un schema Zod. Si pasa, reemplaza body por los datos
// parseados (descarta campos no declarados). Si falla, ValidationError 422
// con detalle por campo.
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      next(new ValidationError("Error de validación", details));
      return;
    }
    req.body = result.data;
    next();
  };
}
