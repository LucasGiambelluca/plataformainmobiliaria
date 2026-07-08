import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/shared/services/jwt.service";
import { UnauthorizedError } from "@/shared/errors";

// Subconjunto del modelo User que necesita autenticación.
export interface AuthUserRecord {
  id: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string | null;
  isActive: boolean;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Contrato de persistencia del módulo auth. La búsqueda por email es global
// (pre-contexto de tenant): auth ocurre ANTES de resolver tenant, por eso no
// extiende BaseRepository. TODO Fase 1: cuando exista el middleware de
// resolución de tenant, filtrar también por tenantId en el login.
export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;
}

// Usuario expuesto al frontend (nunca incluye passwordHash).
export interface SafeUser {
  id: string;
  tenantId: string | null;
  email: string;
  role: UserRole;
  name: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  // Expiración del refresh: el router la usa para el maxAge de la cookie.
  refreshExpiresAt: Date;
}

const sha256 = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function toSafeUser(user: AuthUserRecord): SafeUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    name: user.name,
  };
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async login(
    email: string,
    password: string,
  ): Promise<AuthTokens & { user: SafeUser }> {
    const user = await this.repo.findUserByEmail(email);
    // Mismo mensaje para email inexistente, password incorrecto y usuario
    // desactivado: no se revela cuál falló.
    if (!user || !user.isActive) {
      throw new UnauthorizedError("Credenciales inválidas");
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: toSafeUser(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens & { user: SafeUser }> {
    const { sub: userId } = verifyRefreshToken(refreshToken);

    const stored = await this.repo.findRefreshTokenByHash(sha256(refreshToken));
    if (!stored) throw new UnauthorizedError("Refresh token inválido o expirado");

    // Reuso de un token ya rotado/revocado → posible robo: se revoca toda la
    // sesión del usuario (todas sus refresh tokens vigentes).
    if (stored.revokedAt) {
      await this.repo.revokeAllRefreshTokensForUser(stored.userId);
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    const user = await this.repo.findUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    // Rotación: el token usado se revoca y se emite uno nuevo.
    await this.repo.revokeRefreshToken(stored.id);
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: toSafeUser(user) };
  }

  // Idempotente: un token desconocido o malformado no es un error de logout.
  async logout(refreshToken: string): Promise<void> {
    const stored = await this.repo.findRefreshTokenByHash(sha256(refreshToken));
    if (stored && !stored.revokedAt) {
      await this.repo.revokeRefreshToken(stored.id);
    }
  }

  private async issueTokens(user: AuthUserRecord): Promise<AuthTokens> {
    const accessToken = signAccessToken({
      sub: user.id,
      tenant: user.tenantId,
      role: user.role,
    });
    const refreshToken = signRefreshToken(user.id);

    // Se persiste solo el hash SHA-256; la expiración se toma del propio JWT
    // para que DB y token nunca diverjan.
    const { exp } = jwt.decode(refreshToken) as { exp: number };
    const refreshExpiresAt = new Date(exp * 1000);
    await this.repo.createRefreshToken({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
