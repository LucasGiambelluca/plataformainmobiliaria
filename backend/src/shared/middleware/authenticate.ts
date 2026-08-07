import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "@/shared/services/jwt.service";
import { ReadOnlySessionError, UnauthorizedError } from "@/shared/errors";

// Métodos que no mutan nada. Todo lo demás cuenta como escritura.
const LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

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
  req.user = {
    id: payload.sub,
    tenantId: payload.tenant,
    role: payload.role,
    ...(payload.act ? { impersonatorId: payload.act } : {}),
    ...(payload.ro ? { readOnly: true } : {}),
  };
  req.tenantId = payload.tenant;

  // El bloqueo de escritura de una sesión suplantada vive acá, y no en un
  // middleware aparte, por cobertura: authenticate está en el camino de TODA
  // ruta autenticada, mientras que un middleware suelto habría que acordarse
  // de montarlo en los quince routers. Olvidarse de uno significa escribir con
  // la identidad de otra persona, que es exactamente lo que hay que impedir.
  //
  // Mezcla autenticación con autorización. Es una impureza consciente: un
  // agujero por omisión cuesta más que una responsabilidad de más.
  if (req.user.readOnly && !LECTURA.has(req.method)) {
    throw new ReadOnlySessionError();
  }

  next();
}
