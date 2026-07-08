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
