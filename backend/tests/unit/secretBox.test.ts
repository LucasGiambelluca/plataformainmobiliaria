import { decryptSecret, encryptSecret, last4 } from "@/shared/services/crypto/secretBox";

describe("secretBox", () => {
  it("descifra lo que cifró", () => {
    const secreto = "APP_USR-1234567890-abcdef-ghijkl";
    expect(decryptSecret(encryptSecret(secreto))).toBe(secreto);
  });

  it("cifrar dos veces el mismo texto da resultados distintos", () => {
    // IV aleatorio por cifrado: si dieran igual, cualquiera con acceso de
    // lectura a la base vería que dos credenciales son la misma.
    const secreto = "APP_USR-1234567890";
    expect(encryptSecret(secreto)).not.toBe(encryptSecret(secreto));
  });

  it("un ciphertext manipulado falla en vez de devolver basura", () => {
    // Es lo que compra GCM sobre CBC: basura descifrada saldría como Bearer
    // hacia MercadoPago sin que nadie se entere.
    const payload = encryptSecret("APP_USR-1234567890");
    const [v, iv, tag, cipher] = payload.split(":");
    const alterado = Buffer.from(cipher, "base64");
    alterado[0] ^= 0xff;
    const roto = [v, iv, tag, alterado.toString("base64")].join(":");

    expect(() => decryptSecret(roto)).toThrow();
  });

  it("rechaza un payload sin el prefijo de versión", () => {
    expect(() => decryptSecret("solo-texto-plano")).toThrow();
  });

  it("last4 devuelve los últimos cuatro caracteres", () => {
    expect(last4("APP_USR-1234567890-abc8f2")).toBe("c8f2");
  });
});
