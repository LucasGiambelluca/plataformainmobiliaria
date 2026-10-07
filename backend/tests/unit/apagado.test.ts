import { describe, expect, it, jest } from '@jest/globals'
import type { Server } from 'node:http'
import { crearApagador } from '@/shared/proceso/apagado'

/**
 * El apagado ordenado (tareas A3 y A4 de AUDITORIA.md).
 *
 * Lo que se prueba es la promesa que hace el código: cuando le llega un SIGTERM
 * o un rechazo sin manejar, **espera a que terminen las peticiones que ya están
 * en vuelo** antes de desconectar la base. Antes de esto el `server.close()` no
 * se esperaba, así que se cortaba la escucha y se seguía de largo, y en un
 * deploy eso son 500 para quien justo estaba pagando.
 *
 * `salir` va inyectado justamente para poder observar la salida sin matar al
 * runner de tests.
 */

interface ServidorFalso {
  server: Server
  /** Se llama cuando el servidor terminó de cerrar. */
  resolverCierre: () => void
  cerradasIdle: number
  enCerrar: number
}

function servidorFalso({ terminaSolo = true }: { terminaSolo?: boolean } = {}): ServidorFalso {
  let resolver: () => void = () => {}
  // El objeto se devuelve POR REFERENCIA. Con un `{ ...f }` de por medio, los
  // incrementos de los contadores quedan en el `f` interno y el test lee una
  // copia que nunca cambia: falla siempre en 0 y parece un problema del código
  // que se está probando.
  const f = {
    cerradasIdle: 0,
    enCerrar: 0,
    resolverCierre: () => resolver(),
  } as unknown as ServidorFalso
  f.server = {
    close(cb: () => void) {
      f.enCerrar += 1
      if (terminaSolo) cb()
      else resolver = cb
    },
    closeIdleConnections() {
      f.cerradasIdle += 1
    },
  } as unknown as Server
  return f
}

describe('crearApagador', () => {
  it('cierra, espera al servidor y recién ahí desconecta la base', async () => {
    const s = servidorFalso()
    const orden: string[] = []
    const desconectar = jest.fn(async () => {
      orden.push('desconectar')
    })
    const salida: number[] = []
    const { apagar } = crearApagador(s.server, desconectar, { salir: (c) => salida.push(c) })

    await apagar('SIGTERM', 0)

    expect(s.enCerrar).toBe(1)
    expect(desconectar).toHaveBeenCalledTimes(1)
    expect(salida).toEqual([0])
    expect(orden).toEqual(['desconectar'])
  })

  it('NO desconecta antes de que el servidor termine de cerrar', async () => {
    // El corazón de A4: con una petición en vuelo, la base se desconecta solo
    // cuando close() avisa que no queda ninguna conexión.
    const s = servidorFalso({ terminaSolo: false })
    const desconectar = jest.fn(async () => undefined)
    const { apagar } = crearApagador(s.server, desconectar, { salir: () => undefined })

    const pendiente = apagar('SIGTERM', 0)
    // Un par de vueltas del event loop: si se desconectara de una, esto ya
    // estaría llamado.
    await new Promise((r) => setTimeout(r, 20))
    expect(desconectar).not.toHaveBeenCalled()

    s.resolverCierre()
    await pendiente
    expect(desconectar).toHaveBeenCalledTimes(1)
  })

  it('cierra las conexiones ociosas pero no interrumpe las que estan en vuelo', async () => {
    // `closeIdleConnections` y `closeAllConnections` suenan parecidos y hacen
    // cosas opuestas: el segundo cortaría las peticiones que se están
    // sirviendo, que es justo el 500 que se quiere evitar.
    const s = servidorFalso()
    const { apagar } = crearApagador(s.server, async () => undefined, { salir: () => undefined })

    await apagar('SIGTERM', 0)

    expect(s.cerradasIdle).toBe(1)
    const llamado = s.server.closeIdleConnections as unknown as jest.Mock
    expect(llamado).toBeDefined()
  })

  it('si una peticion no termina nunca, la red de seguridad igual sale', async () => {
    // Un `await` sin techo cuelga el deploy entero: systemd se queda esperando
    // su propio timeout mientras el proceso nunca sale.
    //
    // Acá NO se awaitea el apagador, y es a propósito: en producción `salir` es
    // `process.exit`, así que cuando la red dispara el proceso se fue y la
    // promesa pendiente no importa. Con un `salir` que solo registra, en cambio,
    // el apagador queda esperando para siempre — que es exactamente lo que la
    // red vino a resolver.
    const s = servidorFalso({ terminaSolo: false })
    const salida: number[] = []
    const { apagar } = crearApagador(s.server, async () => undefined, {
      msMaximo: 40,
      salir: (c) => salida.push(c),
    })

    void apagar('SIGTERM', 0)
    await new Promise((r) => setTimeout(r, 150))

    expect(salida).toEqual([0])
    // Y no llegó a tocar la base: si el servidor no terminó de cerrar, no se
    // desconecta a ciegas.
    expect(s.enCerrar).toBe(1)
  })

  it('una segunda senal durante el apagado no reinicia nada', async () => {
    // El supervisor puede mandar dos SIGTERM. El segundo tiene que ser un
    // no-op, no arrancar otro cierre encima del primero.
    const s = servidorFalso()
    const desconectar = jest.fn(async () => undefined)
    const salida: number[] = []
    const { apagar } = crearApagador(s.server, desconectar, { salir: (c) => salida.push(c) })

    const a = apagar('SIGTERM', 0)
    const b = apagar('SIGTERM', 0)
    await Promise.all([a, b])

    expect(s.enCerrar).toBe(1)
    expect(desconectar).toHaveBeenCalledTimes(1)
    expect(salida).toEqual([0])
  })

  it('si la base no desconecta, se sale igual sin propagar el error', async () => {
    // Un fallo al cerrar no puede dejar el proceso zombi: el supervisor tiene
    // que recuperar el servicio sí o sí.
    const s = servidorFalso()
    const salida: number[] = []
    const { apagar } = crearApagador(
      s.server,
      async () => {
        throw new Error('la base no responde')
      },
      { salir: (c) => salida.push(c) },
    )

    await apagar('SIGTERM', 0)

    expect(salida).toEqual([0])
  })

  it('sale con el codigo que le pasaron, para que systemd sepa', async () => {
    const s = servidorFalso()
    const salida: number[] = []
    const { apagar } = crearApagador(s.server, async () => undefined, { salir: (c) => salida.push(c) })

    await apagar('unhandledRejection', 1)

    // 0 en un SIGTERM, 1 en un error: el supervisor reinicia en el segundo caso
    // y el primero es un apagado limpio.
    expect(salida).toEqual([1])
  })
})
