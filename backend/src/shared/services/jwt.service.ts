import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "@/config/env";
import type { JwtPayload } from "@/types/auth";
import { UnauthorizedError } from "@/shared/errors";

type RefreshPayload = { sub: string };

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  // jti único: dos tokens del mismo usuario firmados en el mismo segundo
  // serían idénticos y romperían la rotación (mismo hash persistido).
  return jwt.sign({ sub: userId, jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export interface ImpersonationTarget {
  userId: string;
  tenantId: string;
}

/**
 * Token con el que el super admin abre el panel de una inmobiliaria.
 *
 * Va aparte de `signAccessToken` a propósito: mientras el camino normal no
 * tenga forma de escribir `act`, ninguna sesión común puede terminar marcada
 * como suplantación por un descuido.
 *
 * No hay refresh token asociado. La cookie httpOnly sigue siendo la del super
 * admin, así que recargar la página lo devuelve a su identidad y no existe
 * forma de quedar atrapado en la ajena.
 */
export function signImpersonationToken(
  target: ImpersonationTarget,
  actorId: string,
): { token: string; expiresAt: Date } {
  const payload: JwtPayload = {
    sub: target.userId,
    tenant: target.tenantId,
    role: "tenant_admin",
    act: actorId,
    ro: true,
  };
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.IMPERSONATION_EXPIRES_IN,
  } as SignOptions);

  // La expiración se lee del propio JWT para que el dato que ve el frontend y
  // el que hace cumplir el servidor nunca diverjan.
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(exp * 1000) };
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError("Token inválido o expirado");
  }
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshPayload;
  } catch {
    throw new UnauthorizedError("Refresh token inválido o expirado");
  }
}
