import request from "supertest";
import type { Express } from "express";
import { PASSWORD } from "./factories";

/**
 * Login por la API real y no un JWT firmado a mano.
 *
 * Firmarlo a mano saltearía justo lo que se quiere probar: que el login existe,
 * valida la contraseña y emite un token que el resto de los endpoints acepta.
 */
export async function loguear(app: Express, email: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: PASSWORD });

  if (res.status !== 200) {
    throw new Error(`Login fallido para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

/** Azúcar para no repetir el Bearer en cada pedido. */
export function comoUsuario(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}
