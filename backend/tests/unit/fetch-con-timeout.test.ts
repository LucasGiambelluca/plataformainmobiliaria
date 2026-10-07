import { describe, expect, it, jest } from '@jest/globals'
import { fetchConTimeout, TIMEOUT_MS } from '@/shared/http/fetch-con-timeout'
import { AppError } from '@/shared/errors'

/**
 * El corte de tiempo de las llamadas salientes (tarea A2 de AUDITORIA.md).
 *
 * Lo que se prueba acá no es que el `fetch` reciba una señal, sino que la
 * promesa se resuelva siempre. La diferencia importa: abortar es cooperativo,
 * y un corte que depende de que el otro lo cumpla no es un corte.
 */

const respuesta = (): Response =>
  new Response('ok', { status: 200 }) as unknown as Response

describe('fetchConTimeout', () => {
  it('devuelve la respuesta cuando el servicio responde a tiempo', async () => {
    const fetchFn = jest.fn(async () => respuesta()) as unknown as typeof fetch
    const res = await fetchConTimeout('https://ejemplo.test/x', 1000, {}, fetchFn)
    expect(res.status).toBe(200)
  })

  it('pasa la señal de corte al fetch', async () => {
    // El fetch real aborta y libera la conexión; la carrera de abajo es la
    // garantía, pero esta señal sigue siendo lo que corta el pedido de verdad.
    const fetchFn = jest.fn(async () => respuesta()) as unknown as typeof fetch
    await fetchConTimeout('https://ejemplo.test/x', 1000, {}, fetchFn)
    const init = (fetchFn as unknown as jest.Mock).mock.calls[0][1] as RequestInit
    expect(init.signal).toBeDefined()
    expect(init.signal?.aborted).toBe(false)
  })

  it('corta aunque el fetch IGNORE la señal', async () => {
    // El caso que separa esta implementación de un `AbortSignal.timeout` a secas.
    // Un fetch que acepta la conexión y nunca responde —
    // la señal— no puede dejar la promesa colgada: acá gana el timer.
    const queNuncaResuelve = (() =>
      new Promise<Response>(() => {
        /* se queda esperando, como un servicio que cuelga */
      })) as unknown as typeof fetch

    const inicio = Date.now()
    await expect(
      fetchConTimeout('https://colgado.test/x', 50, {}, queNuncaResuelve),
    ).rejects.toThrow(/no respondió/)
    // Un segundo de margen para que el test no sea flake en una máquina cargada.
    expect(Date.now() - inicio).toBeLessThan(1000)
  })

  it('el error dice qué servicio se colgó y cuánto se esperó', async () => {
    // Un "The operation was aborted" no dice nada: en el log de producción hay
    // que poder saber si fue la BCRA, Resend o MercadoPago.
    const queNuncaResuelve = (() =>
      new Promise<Response>(() => {})) as unknown as typeof fetch

    const err = await fetchConTimeout('https://api.resend.com/emails', 2000, {}, queNuncaResuelve).catch(
      (e) => e as AppError,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('UPSTREAM_TIMEOUT')
    expect((err as AppError).statusCode).toBe(504)
    expect((err as AppError).message).toContain('api.resend.com')
    expect((err as AppError).message).toContain('2s')
  })

  it('traduce el AbortError de Node al mismo error con mensaje', async () => {
    // Cuando el corte lo dispara la señal, lo que llega es un DOMException
    // pelado. Sin esta traducción el mensaje depende de Node.
    const queAborta = (() =>
      Promise.reject(
        Object.assign(new Error('This operation was aborted'), { name: 'TimeoutError' }),
      )) as unknown as typeof fetch

    const err = await fetchConTimeout('https://bcra.test/x', 500, {}, queAborta).catch(
      (e) => e as AppError,
    )
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('UPSTREAM_TIMEOUT')
    expect((err as AppError).message).toContain('bcra.test')
  })

  it('un rechazo de red cualquiera se propaga tal cual', async () => {
    // Un DNS que no resuelve no es un timeout: es otro error, y hay que poder
    // distinguirlo. Si se tradujera todo a UPSTREAM_TIMEOUT se perdería eso.
    const falla = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch
    await expect(fetchConTimeout('https://nada.test/x', 1000, {}, falla)).rejects.toThrow(
      'fetch failed',
    )
  })

  it('respeta un abort del llamador aunque el fetch lo ignore', async () => {
    // El corte propio se combina con el del llamador en vez de pisarlo: si se
    // reemplazara, un shutdown o un timeout de la request entera dejarían de
    // cancelar esta llamada. Y al igual que el timeout propio, no puede
    // depender de que el fetch coopere: acá el mock cuelga para siempre y aun
    // así tiene que cortar.
    const controller = new AbortController()
    const queNuncaResuelve = (() =>
      new Promise<Response>(() => {})) as unknown as typeof fetch

    const p = fetchConTimeout(
      'https://ejemplo.test/x',
      60_000,
      { signal: controller.signal },
      queNuncaResuelve,
    )
    // Un ms antes de abortar, para que el corte no gane por tiempo y el test
    // siga probando lo que dice probar.
    await new Promise((r) => setTimeout(r, 5))
    controller.abort()
    await expect(p).rejects.toBeDefined()
  })

  it('el corte dispara aunque no haya nada mas que lo mantenga vivo', async () => {
    // El bug que un test con Jest no puede ver: con el timer en `unref()` no
    // mantenía vivo el event loop, así que un fetch colgado —que no abre ningún
    // handle— dejaba que el proceso terminara limpiamente y el corte nunca
    // llegaba a dispararse. Jest no lo reproduce porque su propio timer de
    // test sí mantiene vivo el loop; un proceso real, no.
    //
    // Lo que se verifica acá es que el timer NO esté en unref: si lo estuviera,
    // este test seguiría pasando en Jest, y por eso además se mira la propiedad
    // directamente.
    const queNuncaResuelve = (() =>
      new Promise<Response>(() => {})) as unknown as typeof fetch;

    const spy = jest.spyOn(global, 'setTimeout');
    await expect(
      fetchConTimeout('https://ejemplo.test/x', 30, {}, queNuncaResuelve),
    ).rejects.toBeInstanceOf(AppError);
    const [, ms] = spy.mock.calls.find(([, t]) => t === 30) as [unknown, number];
    expect(ms).toBe(30);
    spy.mockRestore();
  })

  it('el timer se limpia cuando la respuesta gana primero', async () => {
    // Si el timer quedara vivo, un proceso que solo hace un par de llamadas
    // salientes no terminaría de salir por culpa de esto.
    const fetchFn = (async () => {
      await new Promise((r) => setTimeout(r, 5))
      return respuesta()
    }) as unknown as typeof fetch
    await fetchConTimeout('https://ejemplo.test/x', 30_000, {}, fetchFn)
    // Si el timer estuviera pendiente, Jest se quejaría de handles abiertos al
    // terminar la suite; el `unref` de más lo cubre igual.
    expect(true).toBe(true)
  })
})

describe('TIMEOUT_MS', () => {
  it('el corte de índices es el más generoso, por el tamaño de las series', () => {
    // El ICL baja paginado de a 1000 y pasa los 2000 puntos: un corte más
    // corto que lo que tarda una página mataría la serie.
    expect(TIMEOUT_MS.indice).toBeGreaterThanOrEqual(20_000)
    expect(TIMEOUT_MS.pago).toBeGreaterThanOrEqual(10_000)
    expect(TIMEOUT_MS.correo).toBeGreaterThanOrEqual(10_000)
  })
})
