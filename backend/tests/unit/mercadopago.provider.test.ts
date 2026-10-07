import { createHmac } from "node:crypto";
import { MercadoPagoProvider } from "@/shared/services/payments";

const SECRET = "un-secreto-de-webhook-bien-largo";

const provider = new MercadoPagoProvider({
  accessToken: "token-de-prueba",
  webhookSecret: SECRET,
  backendUrl: "https://api.test",
});

/** Arma la firma como la manda MercadoPago. */
function firmar(dataId: string, requestId: string, ts: string, secret = SECRET) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

const DATA_ID = "123456789";
const REQUEST_ID = "req-abc";
const TS = "1785250000";

describe("MercadoPagoProvider.verifyWebhook", () => {
  it("acepta una firma legítima", () => {
    expect(
      provider.verifyWebhook({
        signature: firmar(DATA_ID, REQUEST_ID, TS),
        requestId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(true);
  });

  it("rechaza una firma hecha con otro secreto", () => {
    // Es el caso real: alguien encuentra la URL del webhook y postea un pago.
    expect(
      provider.verifyWebhook({
        signature: firmar(DATA_ID, REQUEST_ID, TS, "secreto-que-adivino"),
        requestId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(false);
  });

  it("rechaza si cambiaron el id del pago", () => {
    // Firma válida de OTRO pago reutilizada para acreditarse este.
    const firma = firmar(DATA_ID, REQUEST_ID, TS);
    expect(
      provider.verifyWebhook({
        signature: firma,
        requestId: REQUEST_ID,
        dataId: "999999999",
      }),
    ).toBe(false);
  });

  it("rechaza si cambiaron el request-id", () => {
    const firma = firmar(DATA_ID, REQUEST_ID, TS);
    expect(
      provider.verifyWebhook({
        signature: firma,
        requestId: "otro-request",
        dataId: DATA_ID,
      }),
    ).toBe(false);
  });

  it("rechaza si cambiaron el timestamp", () => {
    const firma = firmar(DATA_ID, REQUEST_ID, TS).replace(`ts=${TS}`, "ts=1785259999");
    expect(
      provider.verifyWebhook({
        signature: firma,
        requestId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(false);
  });

  it("rechaza sin header de firma", () => {
    expect(
      provider.verifyWebhook({ signature: undefined, requestId: REQUEST_ID, dataId: DATA_ID }),
    ).toBe(false);
  });

  it("rechaza sin data.id", () => {
    expect(
      provider.verifyWebhook({
        signature: firmar(DATA_ID, REQUEST_ID, TS),
        requestId: REQUEST_ID,
        dataId: undefined,
      }),
    ).toBe(false);
  });

  it("rechaza un header malformado sin explotar", () => {
    for (const signature of ["", "cualquier-cosa", "ts=1", "v1=abc", "ts=,v1="]) {
      expect(
        provider.verifyWebhook({ signature, requestId: REQUEST_ID, dataId: DATA_ID }),
      ).toBe(false);
    }
  });

  it("una firma de largo distinto no rompe la comparación", () => {
    // timingSafeEqual tira si los buffers difieren en largo: hay que cortar antes.
    expect(
      provider.verifyWebhook({
        signature: `ts=${TS},v1=abcd`,
        requestId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(false);
  });

  it("acepta el id en mayúsculas: el manifiesto va en minúsculas", () => {
    expect(
      provider.verifyWebhook({
        signature: firmar("ABC-DEF", REQUEST_ID, TS),
        requestId: REQUEST_ID,
        dataId: "ABC-DEF",
      }),
    ).toBe(true);
  });
});

describe("MercadoPagoProvider — consultas a la API", () => {
  const SUB = "44444444-4444-4444-4444-444444444444";
  let fetchMock: jest.SpyInstance;

  /** Responde `cuerpo` a cualquier pedido y deja registrado qué se pidió. */
  const responder = (cuerpo: unknown) =>
    (fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 200 })));

  afterEach(() => fetchMock?.mockRestore());

  it("un débito mensual (subscription_authorized_payment) se lee de /authorized_payments", async () => {
    // Así llegan los cobros de los meses 2 en adelante. Antes caían en "tema no
    // manejado": se cobraba y no quedaba nada registrado.
    responder({
      id: 7001,
      preapproval_id: "pre-1",
      external_reference: SUB,
      transaction_amount: 29999,
      currency_id: "ARS",
      debit_date: "2026-11-01T10:00:00.000-03:00",
      payment: { id: 5550001, status: "approved" },
    });

    const evento = await provider.fetchEvent({ topic: "subscription_authorized_payment", id: "7001" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.mercadopago.com/authorized_payments/7001");
    expect(evento).toEqual({
      // El id del PAGO: es el mismo que trae el topic `payment`, así que si
      // llegan los dos avisos se deduplican por la restricción única.
      externalPaymentId: "5550001",
      externalSubscriptionId: "pre-1",
      status: "approved",
      amount: "29999",
      currency: "ARS",
      paidAt: new Date("2026-11-01T10:00:00.000-03:00"),
      externalReference: SUB,
    });
  });

  it("un débito programado sin intento de cobro no es un evento", async () => {
    responder({ id: 7002, preapproval_id: "pre-1", status: "scheduled" });

    await expect(
      provider.fetchEvent({ topic: "subscription_authorized_payment", id: "7002" }),
    ).resolves.toBeNull();
  });

  it("un pago toma el débito de point_of_interaction si no viene en metadata", async () => {
    responder({
      id: 5550002,
      status: "approved",
      transaction_amount: 29999,
      currency_id: "ARS",
      date_approved: "2026-11-01T10:00:00.000-03:00",
      external_reference: SUB,
      point_of_interaction: { transaction_data: { subscription_id: "pre-1" } },
    });

    const evento = await provider.fetchEvent({ topic: "payment", id: "5550002" });

    expect(evento?.externalSubscriptionId).toBe("pre-1");
  });

  it("el alta del débito va en estado pending: la tarjeta se carga en la página de MP", async () => {
    responder({ id: "pre-9", init_point: "https://mp.test/checkout/pre-9" });

    await provider.createSubscriptionCheckout({
      reference: SUB,
      planName: "Pro",
      amount: "29999",
      currency: "ARS",
      payerEmail: "admin@inmo.com",
      returnUrl: "https://app.test/panel/suscripcion",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.status).toBe("pending");
    expect(body.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 29999,
      currency_id: "ARS",
    });
  });
});
