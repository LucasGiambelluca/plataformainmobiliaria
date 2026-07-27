import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

export interface RecordedCall {
  method: string
  url: string
  authorization?: string
  body: unknown
}

export interface StubResponse {
  status: number
  data?: unknown
  /** Simula caída de red: axios rechaza sin `response`. */
  networkError?: boolean
}

/**
 * Servidor falso a nivel de adapter de axios.
 *
 * Se engancha en `axios.defaults.adapter` desde el setup de vitest, antes de
 * que `lib/api.ts` cree sus instancias, así cubre tanto el cliente normal como
 * el `bare` que usa el refresh — sin exportarlos ni sumar una dependencia de
 * mocking. Los interceptores corren de verdad: es justo lo que se quiere probar.
 */
export class MockServer {
  readonly calls: RecordedCall[] = []
  private readonly queues = new Map<string, StubResponse[]>()

  /**
   * Encola respuestas para una ruta. Se consumen en orden y la última queda
   * fija para las llamadas siguientes.
   */
  on(method: string, url: string, ...responses: StubResponse[]): this {
    this.queues.set(key(method, url), [...responses])
    return this
  }

  /** Cuántas veces se pidió una ruta (así se verifica el single-flight). */
  countOf(method: string, url: string): number {
    return this.calls.filter((c) => c.method === method.toLowerCase() && c.url === url).length
  }

  callsTo(method: string, url: string): RecordedCall[] {
    return this.calls.filter((c) => c.method === method.toLowerCase() && c.url === url)
  }

  async handle(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
    const method = (config.method ?? 'get').toLowerCase()
    const url = config.url ?? ''

    this.calls.push({
      method,
      url,
      authorization: headerValue(config, 'Authorization'),
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    })

    const queue = this.queues.get(key(method, url))
    if (!queue || queue.length === 0) {
      throw new Error(`MockServer: sin respuesta para ${method.toUpperCase()} ${url}`)
    }
    const stub = queue.length > 1 ? queue.shift()! : queue[0]

    if (stub.networkError) {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, null)
    }

    const response: AxiosResponse = {
      data: stub.data,
      status: stub.status,
      statusText: '',
      headers: {},
      config,
    }

    if (stub.status >= 200 && stub.status < 300) return response

    throw new AxiosError(
      `Request failed with status code ${stub.status}`,
      String(stub.status),
      config,
      null,
      response,
    )
  }
}

let active: MockServer | null = null

/** Crea un servidor limpio y lo deja activo para el test en curso. */
export function useMockServer(): MockServer {
  active = new MockServer()
  return active
}

/**
 * Instala el adapter una sola vez, antes de que se importe el cliente HTTP.
 * Delega en el servidor activo para poder cambiarlo entre tests sin recrear
 * las instancias de axios.
 */
export function installMockAdapter(): void {
  const adapter: AxiosAdapter = (config) => {
    if (!active) throw new Error('MockServer: ningún servidor activo (falta useMockServer)')
    return active.handle(config)
  }
  axios.defaults.adapter = adapter
}

function key(method: string, url: string): string {
  return `${method.toLowerCase()} ${url}`
}

function headerValue(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const raw = config.headers?.get?.(name)
  return typeof raw === 'string' ? raw : undefined
}
