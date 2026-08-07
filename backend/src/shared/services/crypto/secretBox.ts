import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { AppError } from "@/shared/errors";

const ALGORITMO = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function clave(): Buffer {
  const key = Buffer.from(env.CREDENTIALS_ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new AppError(
      "CREDENTIALS_ENCRYPTION_KEY debe ser de 32 bytes (64 caracteres hex)",
    );
  }
  return key;
}

/**
 * Cifra un secreto para guardarlo en la base.
 *
 * GCM y no CBC porque es autenticado: un ciphertext manipulado falla ruidoso al
 * descifrar, en vez de devolver basura que después sale como Bearer hacia
 * MercadoPago. El prefijo de versión está para que el día que cambie el
 * algoritmo se note, en lugar de descifrar mal en silencio.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, clave(), iv);
  const texto = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    texto.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, texto] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !texto) {
    throw new AppError("Secreto guardado con un formato que no se reconoce");
  }

  const decipher = createDecipheriv(ALGORITMO, clave(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(texto, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // final() tira cuando el tag no valida: el dato fue manipulado o la clave
    // cambió. En los dos casos hay que gritar, no seguir con basura.
    throw new AppError("No se pudo descifrar el secreto guardado");
  }
}

/** Últimos cuatro caracteres: alcanza para saber cuál credencial está cargada. */
export function last4(secret: string): string {
  return secret.slice(-4);
}
