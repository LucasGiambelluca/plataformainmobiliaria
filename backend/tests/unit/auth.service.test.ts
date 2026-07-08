import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { AuthService, type AuthRepository, type AuthUserRecord, type RefreshTokenRecord } from "@/modules/auth/auth.service";
import { UnauthorizedError } from "@/shared/errors";
import { verifyAccessToken, signRefreshToken } from "@/shared/services/jwt.service";

// bcrypt cost bajo en tests (el cost real vive en el hash, no en el service).
const PASSWORD = "secreto-123";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

function makeUser(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenantId: "22222222-2222-2222-2222-222222222222",
    email: "agente@inmo.com",
    passwordHash: PASSWORD_HASH,
    role: "agent",
    name: "Agente Uno",
    isActive: true,
    ...overrides,
  };
}

// Repositorio en memoria que registra llamadas.
function makeRepo(user: AuthUserRecord | null = makeUser()) {
  const tokens = new Map<string, RefreshTokenRecord>();
  const repo: AuthRepository = {
    findUserByEmail: async (email) =>
      user && user.email === email ? user : null,
    findUserById: async (id) => (user && user.id === id ? user : null),
    createRefreshToken: async (data) => {
      tokens.set(data.tokenHash, {
        id: `rt-${tokens.size + 1}`,
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
      });
    },
    findRefreshTokenByHash: async (hash) => tokens.get(hash) ?? null,
    revokeRefreshToken: async (id) => {
      for (const t of tokens.values()) if (t.id === id) t.revokedAt = new Date();
    },
    revokeAllRefreshTokensForUser: async (userId) => {
      for (const t of tokens.values()) if (t.userId === userId) t.revokedAt = new Date();
    },
  };
  return { repo, tokens };
}

describe("AuthService", () => {
  describe("login", () => {
    it("devuelve tokens y usuario seguro con credenciales válidas", async () => {
      const { repo, tokens } = makeRepo();
      const service = new AuthService(repo);

      const result = await service.login("agente@inmo.com", PASSWORD);

      const payload = verifyAccessToken(result.accessToken);
      expect(payload).toMatchObject({
        sub: "11111111-1111-1111-1111-111111111111",
        tenant: "22222222-2222-2222-2222-222222222222",
        role: "agent",
      });
      // Refresh token persistido como hash SHA-256, nunca en claro.
      expect(tokens.has(sha256(result.refreshToken))).toBe(true);
      // Usuario sin passwordHash.
      expect(result.user).toEqual({
        id: "11111111-1111-1111-1111-111111111111",
        tenantId: "22222222-2222-2222-2222-222222222222",
        email: "agente@inmo.com",
        role: "agent",
        name: "Agente Uno",
      });
      expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("rechaza password incorrecto sin revelar el motivo", async () => {
      const { repo } = makeRepo();
      const service = new AuthService(repo);
      await expect(service.login("agente@inmo.com", "otro")).rejects.toThrow(
        new UnauthorizedError("Credenciales inválidas"),
      );
    });

    it("rechaza email inexistente con el mismo mensaje que password incorrecto", async () => {
      const { repo } = makeRepo(null);
      const service = new AuthService(repo);
      await expect(service.login("nadie@inmo.com", PASSWORD)).rejects.toThrow(
        new UnauthorizedError("Credenciales inválidas"),
      );
    });

    it("rechaza usuario desactivado", async () => {
      const { repo } = makeRepo(makeUser({ isActive: false }));
      const service = new AuthService(repo);
      await expect(service.login("agente@inmo.com", PASSWORD)).rejects.toThrow(
        new UnauthorizedError("Credenciales inválidas"),
      );
    });
  });

  describe("refresh", () => {
    it("rota el token: revoca el viejo y emite uno nuevo", async () => {
      const { repo, tokens } = makeRepo();
      const service = new AuthService(repo);
      const { refreshToken } = await service.login("agente@inmo.com", PASSWORD);

      const result = await service.refresh(refreshToken);

      expect(result.refreshToken).not.toBe(refreshToken);
      expect(verifyAccessToken(result.accessToken).sub).toBe(
        "11111111-1111-1111-1111-111111111111",
      );
      // Viejo revocado, nuevo activo.
      expect(tokens.get(sha256(refreshToken))?.revokedAt).toBeInstanceOf(Date);
      expect(tokens.get(sha256(result.refreshToken))?.revokedAt).toBeNull();
    });

    it("rechaza un refresh token no persistido (JWT válido pero desconocido)", async () => {
      const { repo } = makeRepo();
      const service = new AuthService(repo);
      const forged = signRefreshToken("11111111-1111-1111-1111-111111111111");
      await expect(service.refresh(forged)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("detecta reuso de token revocado y revoca toda la sesión del usuario", async () => {
      const { repo, tokens } = makeRepo();
      const service = new AuthService(repo);
      const { refreshToken } = await service.login("agente@inmo.com", PASSWORD);
      const second = await service.refresh(refreshToken);

      // Reuso del token ya rotado → posible robo.
      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
      // Todos los tokens del usuario quedan revocados, incluido el vigente.
      expect(tokens.get(sha256(second.refreshToken))?.revokedAt).toBeInstanceOf(Date);
    });

    it("rechaza refresh si el usuario fue desactivado después del login", async () => {
      const user = makeUser();
      const { repo } = makeRepo(user);
      const service = new AuthService(repo);
      const { refreshToken } = await service.login("agente@inmo.com", PASSWORD);
      user.isActive = false;
      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("rechaza un token malformado", async () => {
      const { repo } = makeRepo();
      const service = new AuthService(repo);
      await expect(service.refresh("no-es-un-jwt")).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("logout", () => {
    it("revoca el refresh token persistido", async () => {
      const { repo, tokens } = makeRepo();
      const service = new AuthService(repo);
      const { refreshToken } = await service.login("agente@inmo.com", PASSWORD);

      await service.logout(refreshToken);

      expect(tokens.get(sha256(refreshToken))?.revokedAt).toBeInstanceOf(Date);
    });

    it("es idempotente: no falla con token desconocido o malformado", async () => {
      const { repo } = makeRepo();
      const service = new AuthService(repo);
      await expect(service.logout("basura")).resolves.toBeUndefined();
    });
  });
});
