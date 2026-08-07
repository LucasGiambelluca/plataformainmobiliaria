import {
  PaymentSettingsService,
  type PaymentSettingsRepository,
} from "@/modules/paymentSettings/paymentSettings.service";
import { encryptSecret } from "@/shared/services/crypto/secretBox";
import { ValidationError } from "@/shared/errors";

const FILA = {
  activeMode: "sandbox" as const,
  sandboxAccessToken: encryptSecret("APP_USR-sandbox-c8f2"),
  sandboxWebhookSecret: encryptSecret("secreto-sandbox"),
  productionAccessToken: null,
  productionWebhookSecret: null,
  updatedAt: new Date("2026-08-06T12:00:00Z"),
  updatedByEmail: "admin@plataforma.com",
};

function makeService(
  overrides: Partial<PaymentSettingsRepository> = {},
  check: jest.Mock = jest.fn().mockResolvedValue("ok"),
) {
  const repo = {
    find: jest.fn().mockResolvedValue(FILA),
    saveCredentials: jest.fn().mockResolvedValue(undefined),
    setActiveMode: jest.fn().mockResolvedValue(undefined),
    countSubscriptionsWithExternalRef: jest.fn().mockResolvedValue(3),
    ...overrides,
  } as unknown as PaymentSettingsRepository;

  return {
    service: new PaymentSettingsService(repo, check, "https://api.test"),
    repo,
    check,
  };
}

describe("get", () => {
  it("informa qué hay cargado sin devolver ningún secreto", async () => {
    const { service } = makeService();

    const estado = await service.get();

    expect(estado).toEqual({
      activeMode: "sandbox",
      credentials: {
        sandbox: { configured: true, last4: "c8f2" },
        production: { configured: false, last4: null },
      },
      webhookUrl: "https://api.test/api/billing/webhook",
      updatedAt: FILA.updatedAt,
      updatedBy: "admin@plataforma.com",
    });
  });

  it("el JSON serializado no contiene los secretos en ninguna parte", async () => {
    const { service } = makeService();

    const json = JSON.stringify(await service.get());

    expect(json).not.toContain("APP_USR-sandbox-c8f2");
    expect(json).not.toContain("secreto-sandbox");
  });

  it("devuelve el estado vacío cuando todavía no se configuró nada", async () => {
    const { service } = makeService({ find: jest.fn().mockResolvedValue(null) });

    const estado = await service.get();

    expect(estado.activeMode).toBe("sandbox");
    expect(estado.credentials.sandbox.configured).toBe(false);
    expect(estado.credentials.production.configured).toBe(false);
  });
});

describe("saveCredentials", () => {
  it("guarda los secretos cifrados, nunca en claro", async () => {
    const { service, repo } = makeService();

    await service.saveCredentials(
      "production",
      { accessToken: "APP_USR-nuevo", webhookSecret: "secreto-nuevo" },
      "sa-1",
    );

    const [, creds] = (repo.saveCredentials as jest.Mock).mock.calls[0];
    expect(creds.accessToken).not.toBe("APP_USR-nuevo");
    expect(creds.accessToken.startsWith("v1:")).toBe(true);
    expect(creds.webhookSecret.startsWith("v1:")).toBe(true);
  });

  it("no guarda si MercadoPago rechaza el token", async () => {
    const check = jest.fn().mockResolvedValue("rejected");
    const { service, repo } = makeService({}, check);

    await expect(
      service.saveCredentials(
        "production",
        { accessToken: "APP_USR-malo", webhookSecret: "x" },
        "sa-1",
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repo.saveCredentials).not.toHaveBeenCalled();
  });

  it("guarda igual si MercadoPago no contesta, y lo avisa", async () => {
    // Un proveedor caído no puede voltear la pantalla de configuración.
    const check = jest.fn().mockResolvedValue("unreachable");
    const { service, repo } = makeService({}, check);

    const res = await service.saveCredentials(
      "production",
      { accessToken: "APP_USR-x", webhookSecret: "y" },
      "sa-1",
    );

    expect(res).toEqual({ verified: false, last4: "SR-x" });
    expect(repo.saveCredentials).toHaveBeenCalled();
  });
});

describe("activate", () => {
  it("informa cuántas suscripciones quedan huérfanas al cambiar de modo", async () => {
    // Un preapproval de la cuenta A no se puede cancelar con el token de la B.
    const { service } = makeService();

    const res = await service.activate("production", "sa-1");

    expect(res.orphanedSubscriptions).toBe(3);
  });
});

describe("activeCredentials", () => {
  it("descifra el juego del modo activo", async () => {
    const { service } = makeService();

    await expect(service.activeCredentials()).resolves.toEqual({
      accessToken: "APP_USR-sandbox-c8f2",
      webhookSecret: "secreto-sandbox",
    });
  });

  it("null cuando el modo activo no tiene credenciales cargadas", async () => {
    const { service } = makeService({
      find: jest.fn().mockResolvedValue({ ...FILA, activeMode: "production" }),
    });

    await expect(service.activeCredentials()).resolves.toBeNull();
  });
});
