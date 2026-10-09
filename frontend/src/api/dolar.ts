import { z } from 'zod'

/**
 * Cotización del dólar oficial para el header. Sale de dolarapi.com, una API
 * pública y abierta (CORS libre): no pasa por nuestro backend porque no hay
 * nada que proteger ni que cachear del lado nuestro.
 *
 * Usa fetch y no el cliente de `lib/api.ts`: ese cliente apunta a nuestra API y
 * manda credenciales, y no hay por qué mandarle la cookie a un tercero.
 */
const DOLAR_URL = 'https://dolarapi.com/v1/dolares/oficial'

const dolarSchema = z.object({
  compra: z.number(),
  venta: z.number(),
})

export type Dolar = z.infer<typeof dolarSchema>

export async function getDolarOficial(): Promise<Dolar> {
  const res = await fetch(DOLAR_URL, { credentials: 'omit' })
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`)
  return dolarSchema.parse(await res.json())
}
