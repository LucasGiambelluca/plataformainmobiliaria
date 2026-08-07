import {
  signAccessToken,
  signImpersonationToken,
  verifyAccessToken,
} from "@/shared/services/jwt.service";

describe("token de suplantación", () => {
  it("lleva la identidad del suplantado, el super admin en act y la marca ro", () => {
    const { token, expiresAt } = signImpersonationToken(
      { userId: "ta-1", tenantId: "t-1" },
      "sa-1",
    );

    expect(verifyAccessToken(token)).toMatchObject({
      sub: "ta-1",
      tenant: "t-1",
      role: "tenant_admin",
      act: "sa-1",
      ro: true,
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("un access token normal nunca lleva act ni ro", () => {
    // Que el camino normal no pueda marcar una sesión como suplantación es la
    // razón por la que las dos funciones están separadas.
    const payload = verifyAccessToken(
      signAccessToken({ sub: "u-1", tenant: "t-1", role: "tenant_admin" }),
    );

    expect(payload.act).toBeUndefined();
    expect(payload.ro).toBeUndefined();
  });
});
