import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "@/shared/errors";

// Garantiza contexto de tenant en rutas de inmobiliaria.
// Rechaza al super_admin sin tenant explícito.
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    throw new BadRequestError("Se requiere contexto de inmobiliaria (tenant)");
  }
  next();
}
