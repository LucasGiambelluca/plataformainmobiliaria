import { prisma } from "@/config/database";
import type { AuthRepository } from "./auth.service";

const userSelect = {
  id: true,
  tenantId: true,
  email: true,
  passwordHash: true,
  role: true,
  name: true,
  isActive: true,
} as const;

// Implementación Prisma del contrato AuthRepository. No extiende
// BaseRepository a propósito: la autenticación ocurre antes de resolver el
// tenant, por eso la búsqueda por email es global (ver auth.service.ts).
export const authRepository: AuthRepository = {
  findUserByEmail(email) {
    return prisma.user.findFirst({ where: { email }, select: userSelect });
  },

  findUserById(id) {
    return prisma.user.findUnique({ where: { id }, select: userSelect });
  },

  async createRefreshToken(data) {
    await prisma.refreshToken.create({ data });
  },

  findRefreshTokenByHash(tokenHash) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  async revokeRefreshToken(id) {
    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllRefreshTokensForUser(userId) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
