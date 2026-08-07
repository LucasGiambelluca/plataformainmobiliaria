import { createPaymentProviderResolver } from "@/shared/services/payments";

const CREDS = { accessToken: "APP_USR-x", webhookSecret: "secreto" };

describe("resolvePaymentProvider", () => {
  it("con fake no consulta la base", async () => {
    // Desarrollo local tiene que arrancar sin nada configurado.
    const load = jest.fn();
    const resolve = createPaymentProviderResolver({
      providerName: "fake",
      loadCredentials: load,
      backendUrl: "https://api.test",
    });

    expect((await resolve()).name).toBe("fake");
    expect(load).not.toHaveBeenCalled();
  });

  it("con mercadopago y credenciales cargadas devuelve el provider real", async () => {
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: jest.fn().mockResolvedValue(CREDS),
      backendUrl: "https://api.test",
    });

    expect((await resolve()).name).toBe("mercadopago");
  });

  it("sin credenciales cargadas devuelve el provider que no opera", async () => {
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: jest.fn().mockResolvedValue(null),
      backendUrl: "https://api.test",
    });

    expect((await resolve()).name).toBe("unavailable");
  });

  it("una plataforma sin configurar RECHAZA los webhooks", async () => {
    // La propiedad más importante del archivo: sin credenciales no se puede
    // verificar ninguna firma, así que no se acepta ninguna notificación.
    // Aceptarlas sería regalar el upgrade a cualquiera que conozca la URL.
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: jest.fn().mockResolvedValue(null),
      backendUrl: "https://api.test",
    });

    const provider = await resolve();
    expect(
      provider.verifyWebhook({ signature: "ts=1,v1=abc", requestId: "r", dataId: "1" }),
    ).toBe(false);
  });

  it("lee las credenciales en cada llamada: un cambio toma efecto en el acto", async () => {
    const load = jest.fn().mockResolvedValue(CREDS);
    const resolve = createPaymentProviderResolver({
      providerName: "mercadopago",
      loadCredentials: load,
      backendUrl: "https://api.test",
    });

    await resolve();
    await resolve();

    expect(load).toHaveBeenCalledTimes(2);
  });
});
