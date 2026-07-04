import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/shared/services/jwt.service";
import { UnauthorizedError } from "@/shared/errors";

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

// Verifica el access token JWT e inyecta req.user y req.tenantId.
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers.authorization);
  if (!token) throw new UnauthorizedError("Falta el token de autenticación");

  const payload = verifyAccessToken(token);
  req.user = { id: payload.sub, tenantId: payload.tenant, role: payload.role };
  req.tenantId = payload.tenant;
  next();
}
