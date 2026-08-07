import { checkMercadoPagoToken } from "@/shared/services/payments/mercadopago.verify";

describe("checkMercadoPagoToken", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ok cuando MercadoPago acepta el token", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: 123 }), { status: 200 }));

    await expect(checkMercadoPagoToken("APP_USR-bueno")).resolves.toBe("ok");
  });

  it("rejected cuando MercadoPago devuelve 401", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 401 }));

    await expect(checkMercadoPagoToken("APP_USR-malo")).resolves.toBe("rejected");
  });

  it("unreachable cuando la red falla", async () => {
    // Un proveedor caído no puede impedir guardar: misma regla que el correo
    // y las series de índices.
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(checkMercadoPagoToken("APP_USR-x")).resolves.toBe("unreachable");
  });

  it("unreachable cuando MercadoPago devuelve 500", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    await expect(checkMercadoPagoToken("APP_USR-x")).resolves.toBe("unreachable");
  });
});
