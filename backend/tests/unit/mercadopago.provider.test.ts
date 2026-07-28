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
