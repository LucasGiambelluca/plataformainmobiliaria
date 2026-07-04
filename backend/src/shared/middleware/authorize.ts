import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "@/shared/errors";

// Restringe el acceso a los roles indicados.
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new UnauthorizedError();
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      throw new ForbiddenError("No tenés permisos para esta acción");
    }
    next();
  };
}
