# Calculadora de cronograma de actualización — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la calculadora de dos solapas (ICL/IPC, dos fechas, un monto) por una que pida cada cuánto se actualiza el contrato y devuelva el cronograma completo de ajustes, sobre seis índices oficiales.

**Architecture:** Un catálogo de series (`CATALOGO`) pasa a ser la única fuente de verdad sobre de dónde se baja cada índice, cómo se llama y con qué frecuencia se publica; el provider oficial despacha por ese catálogo en vez de ramificar con `if`. La aritmética del cronograma vive en un archivo puro (`calculators.math.ts`) que recibe la serie ya bajada y devuelve los tramos; el service solo resuelve caché y errores. En el frontend, una pantalla con botoneras arma el body y tres componentes chicos dibujan el resultado.

**Tech Stack:** Backend Express + TypeScript + Zod + Jest + supertest. Frontend React 18 + Vite + Tailwind + Zod + Vitest. Sin cambios en Prisma: `index_values.serie` ya es `VarChar(10)` y las seis series entran en las tablas que hay.

**Spec:** `docs/superpowers/specs/2026-08-06-calculadora-cronograma-design.md`

---

## Estructura de archivos

**Backend — crear**

| Archivo | Responsabilidad |
|---|---|
| `backend/src/shared/services/indices/catalogo.ts` | `Serie`, `Frecuencia`, `Descriptor`, `CATALOGO`, `SERIES`. Único lugar donde se dice qué series existen. |

**Backend — modificar**

| Archivo | Cambio |
|---|---|
| `backend/src/shared/services/indices/index.provider.ts` | Queda solo con la interfaz `IndexProvider`; los tipos de serie salen de `catalogo.ts`. |
| `backend/src/shared/services/indices/oficial.provider.ts` | Dos métodos genéricos (`bcra`, `datosGob`) y despacho por `CATALOGO`. |
| `backend/src/shared/services/indices/fake.provider.ts` | Genera las seis según su frecuencia. |
| `backend/src/shared/services/indices/index.ts` | Reexporta `CATALOGO` y los tipos nuevos. |
| `backend/src/modules/calculators/calculators.math.ts` | Borra `calcularIcl`/`calcularIpc`/`mesesEntre`. Agrega `sumarMeses`, `claveMesAnterior`, `mesSiguiente`, `indiceParaTramo`, `calcularCronograma`. Conserva `valorVigente`. |
| `backend/src/modules/calculators/calculators.schemas.ts` | Borra `iclSchema`/`ipcSchema`. Agrega `cronogramaSchema`. |
| `backend/src/modules/calculators/calculators.service.ts` | Borra `calcularIcl`/`calcularIpc`. Agrega `calcularCronograma`. `estadoIndices` suma los campos del catálogo. |
| `backend/src/modules/calculators/calculators.router.ts` | Borra `POST /icl` y `POST /ipc`. Agrega `POST /cronograma`. |

**Frontend — crear**

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/lib/indexLabels.ts` | Nombres de mes y etiqueta de tramo por periodicidad. Misma convención que `propertyLabels.ts` y `domainLabels.ts`. |
| `frontend/src/components/calculadora/Botonera.tsx` | Grupo de botones de opción única (periodicidad e índice). |
| `frontend/src/components/calculadora/SelectorFecha.tsx` | Mes + año, con "elegir día específico" opcional. Emite ISO. |
| `frontend/src/components/calculadora/ResultadoCronograma.tsx` | Tarjetas HASTA/DESDE, línea de valores ingresados y tabla. |

**Frontend — modificar**

| Archivo | Cambio |
|---|---|
| `frontend/src/api/schemas.ts:794-861` | Borra los schemas de ICL/IPC. Agrega los del cronograma. |
| `frontend/src/api/calculators.ts` | Borra `calcularIcl`/`calcularIpc`. Agrega `calcularCronograma`. |
| `frontend/src/pages/Calculadoras.tsx` | Reescritura completa. |
| `frontend/src/components/common/Skeleton.tsx:188-211` | `CalculadoraSkeleton` al layout nuevo. |
| `CLAUDE.md` | Actualizar el párrafo de `calculators`. |

**Tests**

`backend/tests/unit/`: `calculators.math.test.ts`, `calculators.service.test.ts`, `calculators.router.test.ts`, `indices.provider.test.ts`.
`frontend/tests/unit/`: `calculators.test.ts`.

---

## Task 1: Catálogo de series

**Files:**
- Create: `backend/src/shared/services/indices/catalogo.ts`
- Modify: `backend/src/shared/services/indices/index.provider.ts`
- Modify: `backend/src/shared/services/indices/index.ts`
- Test: `backend/tests/unit/indices.catalogo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/unit/indices.catalogo.test.ts`:

```ts
import { CATALOGO, SERIES } from "@/shared/services/indices";

describe("CATALOGO de series", () => {
  it("tiene las seis series con API pública y ninguna más", () => {
    // CAC y CasaPropia quedaron afuera a propósito: no publican API y una
    // serie cargada a mano devuelve números viejos sin que nadie se entere.
    expect([...SERIES].sort()).toEqual(["cer", "icl", "ipc", "ipim", "is", "uva"]);
  });

  it("describe cada serie con su etiqueta, organismo y frecuencia", () => {
    expect(CATALOGO.icl).toMatchObject({
      etiqueta: "ICL",
      organismo: "BCRA",
      frecuencia: "diaria",
      fuente: { tipo: "bcra", idVariable: 40 },
    });

    expect(CATALOGO.ipc).toMatchObject({
      etiqueta: "IPC",
      organismo: "INDEC",
      frecuencia: "mensual",
      fuente: { tipo: "datosGob", idSerie: "148.3_INIVELNAL_DICI_M_26" },
    });
  });

  it("no repite el idVariable ni el idSerie entre dos series", () => {
    const ids = SERIES.map((s) => {
      const { fuente } = CATALOGO[s];
      return fuente.tipo === "bcra" ? `bcra:${fuente.idVariable}` : `datos:${fuente.idSerie}`;
    });

    expect(new Set(ids).size).toBe(SERIES.length);
  });

  it("marca como diarias solo las del BCRA", () => {
    // El BCRA publica día a día; el INDEC, una vez por mes. Si esto se
    // invierte, `indiceParaTramo` elige el índice equivocado.
    for (const serie of SERIES) {
      const d = CATALOGO[serie];
      expect(d.frecuencia).toBe(d.fuente.tipo === "bcra" ? "diaria" : "mensual");
    }
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npx jest tests/unit/indices.catalogo.test.ts`
Expected: FAIL — `CATALOGO` no se exporta desde `@/shared/services/indices`.

- [ ] **Step 3: Escribir el catálogo**

Crear `backend/src/shared/services/indices/catalogo.ts`:

```ts
/**
 * Catálogo de las series de índices que alimentan la calculadora.
 *
 * Es la única fuente de verdad sobre qué series existen: de dónde se bajan,
 * cómo se llaman y cada cuánto las publica el organismo. Antes esa información
 * estaba repartida entre el provider (la URL), el service (el mensaje de error)
 * y el frontend (la etiqueta del botón), y sumar una serie obligaba a tocar los
 * tres. Ahora es una fila acá.
 *
 * Los índices son datos públicos nacionales y no pertenecen a ninguna
 * inmobiliaria: en todo este archivo no hay tenantId por ningún lado.
 *
 * CAC (Cámara Argentina de la Construcción) y CasaPropia no están, y es a
 * propósito: no publican API, solo una planilla mensual. Una serie que alguien
 * tiene que cargar a mano devuelve un número viejo sin avisar, y eso en una
 * calculadora con la que se firma un contrato es peor que no ofrecerla.
 */

export const SERIES = ["icl", "cer", "uva", "ipc", "is", "ipim"] as const;

export type Serie = (typeof SERIES)[number];

/**
 * Cada cuánto publica el organismo. Decide qué índice le toca a un tramo: en
 * las diarias, el último día hábil; en las mensuales, el mes anterior.
 */
export type Frecuencia = "diaria" | "mensual";

export type Fuente =
  | { tipo: "bcra"; idVariable: number }
  | { tipo: "datosGob"; idSerie: string };

export interface Descriptor {
  /** Lo que dice el botón: "ICL". */
  etiqueta: string;
  /** El nombre completo, para el texto de ayuda: "Índice para Contratos de Locación". */
  nombre: string;
  /** Quién lo publica. Va en el aviso legal al pie de la calculadora. */
  organismo: string;
  frecuencia: Frecuencia;
  fuente: Fuente;
}

export const CATALOGO: Record<Serie, Descriptor> = {
  icl: {
    etiqueta: "ICL",
    nombre: "Índice para Contratos de Locación",
    organismo: "BCRA",
    frecuencia: "diaria",
    fuente: { tipo: "bcra", idVariable: 40 },
  },
  cer: {
    etiqueta: "CER",
    nombre: "Coeficiente de Estabilización de Referencia",
    organismo: "BCRA",
    frecuencia: "diaria",
    fuente: { tipo: "bcra", idVariable: 30 },
  },
  uva: {
    etiqueta: "UVA",
    nombre: "Unidad de Valor Adquisitivo",
    organismo: "BCRA",
    frecuencia: "diaria",
    fuente: { tipo: "bcra", idVariable: 31 },
  },
  ipc: {
    etiqueta: "IPC",
    nombre: "Índice de Precios al Consumidor",
    organismo: "INDEC",
    frecuencia: "mensual",
    fuente: { tipo: "datosGob", idSerie: "148.3_INIVELNAL_DICI_M_26" },
  },
  is: {
    etiqueta: "IS",
    nombre: "Índice de Salarios",
    organismo: "INDEC",
    frecuencia: "mensual",
    fuente: { tipo: "datosGob", idSerie: "149.1_TL_INDIIOS_OCTU_0_21" },
  },
  ipim: {
    etiqueta: "IPIM",
    nombre: "Índice de Precios Internos al por Mayor",
    organismo: "INDEC",
    frecuencia: "mensual",
    fuente: { tipo: "datosGob", idSerie: "448.1_NIVEL_GENERAL_0_0_13_46" },
  },
};
```

- [ ] **Step 4: Dejar `index.provider.ts` solo con la interfaz**

Reemplazar el contenido completo de `backend/src/shared/services/indices/index.provider.ts` por:

```ts
import type { PuntoSerie } from "@/modules/calculators/calculators.math";
import type { Serie } from "./catalogo";

/**
 * Contrato de las series de índices que alimentan las calculadoras.
 *
 * Mismo patrón que StorageProvider, PaymentProvider y DnsResolver: una
 * interfaz, una implementación contra el organismo oficial y una falsa para
 * tests y para desarrollo sin red.
 *
 * Qué series existen y de dónde salen lo dice `catalogo.ts`, no este archivo.
 */
export interface IndexProvider {
  readonly name: string;

  /**
   * Serie completa, **ordenada de forma ascendente por fecha**. Todo el resto
   * del código asume ese orden: `valorVigente` recorre hasta pasarse de la
   * fecha pedida.
   */
  obtener(serie: Serie): Promise<PuntoSerie[]>;
}

export type { PuntoSerie };
```

- [ ] **Step 5: Reexportar desde el índice del módulo**

En `backend/src/shared/services/indices/index.ts`, reemplazar las líneas 7-8:

```ts
export type { IndexProvider, PuntoSerie, Serie } from "./index.provider";
export { SERIES } from "./index.provider";
```

por:

```ts
export type { IndexProvider, PuntoSerie } from "./index.provider";
export type { Serie, Frecuencia, Fuente, Descriptor } from "./catalogo";
export { SERIES, CATALOGO } from "./catalogo";
```

- [ ] **Step 6: Correr el test**

Run: `cd backend && npx jest tests/unit/indices.catalogo.test.ts`
Expected: PASS, 4 tests.

Los otros tests todavía fallan (el provider y el service no conocen las series nuevas). Es esperado: se arreglan en las tareas 2 y 7.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/services/indices/ backend/tests/unit/indices.catalogo.test.ts
git commit -m "feat(indices): catalogo unico de series con su fuente y frecuencia"
```

---

## Task 2: Provider oficial genérico

**Files:**
- Modify: `backend/src/shared/services/indices/oficial.provider.ts`
- Test: `backend/tests/unit/indices.provider.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `backend/tests/unit/indices.provider.test.ts`, agregar al final del archivo (no borrar los `describe` que ya están: siguen valiendo):

```ts
describe("OficialIndexProvider - las series nuevas", () => {
  it("pide al BCRA la variable que dice el catálogo", async () => {
    const { fn, llamadas } = fetchFalso({
      "monetarias/30": paginaBcra([{ fecha: "2026-08-15", valor: 822.89 }], 1, 0),
      "monetarias/31": paginaBcra([{ fecha: "2026-08-15", valor: 2076.82 }], 1, 0),
    });

    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("cer")).resolves.toEqual([
      { fecha: "2026-08-15", valor: 822.89 },
    ]);
    await expect(provider.obtener("uva")).resolves.toEqual([
      { fecha: "2026-08-15", valor: 2076.82 },
    ]);

    expect(llamadas[0]).toContain("monetarias/30");
    expect(llamadas[1]).toContain("monetarias/31");
  });

  it("pide a datos.gob.ar el id de serie que dice el catálogo", async () => {
    const { fn, llamadas } = fetchFalso({
      "149.1_TL_INDIIOS_OCTU_0_21": { data: [["2026-04-01", 512.3]] },
      "448.1_NIVEL_GENERAL_0_0_13_46": { data: [["2026-05-01", 9012.4]] },
    });

    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("is")).resolves.toEqual([
      { fecha: "2026-04-01", valor: 512.3 },
    ]);
    await expect(provider.obtener("ipim")).resolves.toEqual([
      { fecha: "2026-05-01", valor: 9012.4 },
    ]);

    expect(llamadas[0]).toContain("ids=149.1_TL_INDIIOS_OCTU_0_21");
    expect(llamadas[1]).toContain("ids=448.1_NIVEL_GENERAL_0_0_13_46");
  });

  it("nombra el organismo en el error, no un genérico", async () => {
    const { fn } = fetchFalso({});
    const provider = new OficialIndexProvider(fn);

    await expect(provider.obtener("uva")).rejects.toThrow(/BCRA/i);
    await expect(provider.obtener("ipim")).rejects.toThrow(/datos\.gob\.ar/i);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/unit/indices.provider.test.ts`
Expected: FAIL — `obtener("cer")` pega a `monetarias/40` porque el provider ramifica con `serie === "icl"`.

- [ ] **Step 3: Reescribir el provider**

Reemplazar el contenido completo de `backend/src/shared/services/indices/oficial.provider.ts` por:

```ts
import { CATALOGO, type Fuente, type Serie } from "./catalogo";
import type { IndexProvider, PuntoSerie } from "./index.provider";

/**
 * Series contra los organismos que las publican.
 *
 * Dos fuentes, dos formas de respuesta:
 *
 * - **BCRA** (`estadisticas/v4.0/monetarias/<idVariable>`): ICL, CER y UVA. Son
 *   diarias y no se publican sábados, domingos ni feriados.
 * - **datos.gob.ar** (`series/api/series/?ids=<idSerie>`): IPC, IS e IPIM, del
 *   INDEC. Se toma el **índice**, no la variación mensual publicada: la
 *   variación viene redondeada y encadenar doce redondeos arrastra error. El
 *   índice da el resultado exacto en una división.
 *
 * Qué serie va a qué fuente lo dice `CATALOGO`, no un `if` acá adentro.
 *
 * El `fetch` entra por constructor para que los tests no salgan a la red.
 */

const BCRA_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";
const BCRA_PAGINA = 1000;
// Tope de vueltas: la serie más larga es diaria desde 2020, así que veinte
// páginas de mil dan para varias décadas. Está para que un `count` disparatado
// no deje el proceso girando.
const BCRA_MAX_PAGINAS = 20;

const DATOS_GOB_BASE = "https://apis.datos.gob.ar/series/api/series/";

interface RespuestaBcra {
  metadata?: { resultset?: { count?: number; offset?: number; limit?: number } };
  // `results` es un array de variables aunque se pida una sola: cada elemento
  // trae su propio `detalle`. Tratarlo como objeto devuelve una serie vacía sin
  // ningún error visible, que es justo lo que pasó la primera vez.
  results?: Array<{ idVariable?: number; detalle?: Array<{ fecha?: string; valor?: number }> }>;
}

interface RespuestaDatosGob {
  data?: Array<[string, number | null]>;
}

function ascendente(serie: PuntoSerie[]): PuntoSerie[] {
  return [...serie].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export class OficialIndexProvider implements IndexProvider {
  readonly name = "oficial";

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async obtener(serie: Serie): Promise<PuntoSerie[]> {
    const { fuente, etiqueta } = CATALOGO[serie];
    return this.bajar(fuente, etiqueta);
  }

  private bajar(fuente: Fuente, etiqueta: string): Promise<PuntoSerie[]> {
    return fuente.tipo === "bcra"
      ? this.bcra(fuente.idVariable, etiqueta)
      : this.datosGob(fuente.idSerie, etiqueta);
  }

  /** Serie diaria del BCRA. Pagina de a 1000 puntos y hay que seguir el offset. */
  private async bcra(idVariable: number, etiqueta: string): Promise<PuntoSerie[]> {
    const base = `${BCRA_BASE}/${idVariable}`;
    const puntos: PuntoSerie[] = [];
    let offset = 0;

    for (let pagina = 0; pagina < BCRA_MAX_PAGINAS; pagina++) {
      const url = offset === 0 ? base : `${base}?offset=${offset}`;
      const res = await this.fetchFn(url);

      if (!res.ok) {
        throw new Error(`El BCRA respondió ${res.status} al pedir el ${etiqueta}`);
      }

      const cuerpo = (await res.json()) as RespuestaBcra;
      const detalle = cuerpo.results?.[0]?.detalle ?? [];

      for (const fila of detalle) {
        if (typeof fila.fecha !== "string" || typeof fila.valor !== "number") {
          continue;
        }
        puntos.push({ fecha: fila.fecha, valor: fila.valor });
      }

      const total = cuerpo.metadata?.resultset?.count ?? puntos.length;
      offset += detalle.length || BCRA_PAGINA;

      if (detalle.length === 0 || puntos.length >= total) break;
    }

    if (puntos.length === 0) {
      throw new Error(`El BCRA devolvió una serie de ${etiqueta} vacía`);
    }

    return ascendente(puntos);
  }

  /** Serie mensual del INDEC publicada en datos.gob.ar. */
  private async datosGob(idSerie: string, etiqueta: string): Promise<PuntoSerie[]> {
    const url = `${DATOS_GOB_BASE}?ids=${idSerie}&limit=1000&format=json`;
    const res = await this.fetchFn(url);

    if (!res.ok) {
      throw new Error(`datos.gob.ar respondió ${res.status} al pedir el ${etiqueta}`);
    }

    const cuerpo = (await res.json()) as RespuestaDatosGob;
    const puntos: PuntoSerie[] = [];

    for (const [fecha, valor] of cuerpo.data ?? []) {
      // Los últimos meses pueden venir con valor null: el INDEC publica el
      // índice recién a los quince días de cerrado el mes.
      if (typeof fecha !== "string" || typeof valor !== "number") continue;
      puntos.push({ fecha, valor });
    }

    if (puntos.length === 0) {
      throw new Error(`datos.gob.ar devolvió una serie de ${etiqueta} vacía`);
    }

    return ascendente(puntos);
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/unit/indices.provider.test.ts`
Expected: los tres `describe` nuevos PASS. Los de `FakeIndexProvider` fallan todavía (tarea 3).

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/services/indices/oficial.provider.ts backend/tests/unit/indices.provider.test.ts
git commit -m "feat(indices): bajar CER, UVA, IS e IPIM despachando por el catalogo"
```

---

## Task 3: FakeIndexProvider con las seis series

**Files:**
- Modify: `backend/src/shared/services/indices/fake.provider.ts`
- Test: `backend/tests/unit/indices.provider.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `backend/tests/unit/indices.provider.test.ts`, reemplazar el `describe("FakeIndexProvider", ...)` completo por:

```ts
describe("FakeIndexProvider", () => {
  it("devuelve las seis series, deterministas y sin salir a la red", async () => {
    const provider = new FakeIndexProvider();

    for (const serie of SERIES) {
      const puntos = await provider.obtener(serie);

      expect(puntos.length).toBeGreaterThan(0);
      // Ascendente: el resto del código asume ese orden.
      expect(puntos[0].fecha < puntos[puntos.length - 1].fecha).toBe(true);
    }
  });

  it("respeta la frecuencia de cada serie", async () => {
    const provider = new FakeIndexProvider();

    // Una serie mensual está fechada el día 1 de cada mes, como la publica el
    // INDEC: si el falso trajera días sueltos, `indiceParaTramo` no encontraría
    // nunca el mes anterior y los tests pasarían por el motivo equivocado.
    const ipc = await provider.obtener("ipc");
    expect(ipc.every((p) => p.fecha.endsWith("-01"))).toBe(true);

    const icl = await provider.obtener("icl");
    expect(icl.some((p) => !p.fecha.endsWith("-01"))).toBe(true);
  });

  it("deja fijar la serie desde el test", async () => {
    const provider = new FakeIndexProvider({
      icl: [{ fecha: "2020-07-01", valor: 1 }],
    });

    await expect(provider.obtener("icl")).resolves.toEqual([
      { fecha: "2020-07-01", valor: 1 },
    ]);
  });
});
```

Y agregar `SERIES` al import de arriba del archivo:

```ts
import {
  FakeIndexProvider,
  OficialIndexProvider,
  SERIES,
} from "@/shared/services/indices";
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npx jest tests/unit/indices.provider.test.ts -t "FakeIndexProvider"`
Expected: FAIL — `obtener("cer")` devuelve `undefined`; el falso solo arma `icl` e `ipc`.

- [ ] **Step 3: Reescribir el falso**

Reemplazar el contenido completo de `backend/src/shared/services/indices/fake.provider.ts` por:

```ts
import { CATALOGO, SERIES, type Serie } from "./catalogo";
import type { IndexProvider, PuntoSerie } from "./index.provider";

/**
 * Series sintéticas para tests y para desarrollo sin red.
 *
 * No pretenden parecerse a la inflación real: solo crecen de forma monótona y
 * determinista, que es lo que hace falta para que las pantallas tengan algo que
 * mostrar y para que un test pueda afirmar sobre un número concreto.
 *
 * Lo que sí respetan es la **forma** de la serie real, porque de eso depende que
 * el resto del código se ejercite de verdad: las diarias traen un punto por día
 * y las mensuales uno por mes fechado el día 1, que es como las publica el
 * INDEC.
 *
 * Van hasta 2030 a propósito: en desarrollo uno prueba con la fecha de hoy, y
 * una serie que termina en el pasado haría fallar todo con "fuera de rango".
 */

const DIARIA_DESDE = "2020-07-01";
const MENSUAL_DESDE = "2016-12-01";
const HASTA_ANIO = 2030;

/** El ICL arranca en 1 por definición del BCRA (base 30.6.20 = 1). */
const DIARIA_BASE = 1;
const DIARIA_PASO = 0.0009;
const MENSUAL_BASE = 1000;
const MENSUAL_PASO = 0.02;

function serieDiaria(): PuntoSerie[] {
  const puntos: PuntoSerie[] = [];
  const cursor = new Date(`${DIARIA_DESDE}T00:00:00Z`);
  let valor = DIARIA_BASE;

  while (cursor.getUTCFullYear() <= HASTA_ANIO) {
    puntos.push({ fecha: cursor.toISOString().slice(0, 10), valor: Number(valor.toFixed(4)) });
    valor *= 1 + DIARIA_PASO;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return puntos;
}

function serieMensual(): PuntoSerie[] {
  const puntos: PuntoSerie[] = [];
  const cursor = new Date(`${MENSUAL_DESDE}T00:00:00Z`);
  let valor = MENSUAL_BASE;

  while (cursor.getUTCFullYear() <= HASTA_ANIO) {
    puntos.push({ fecha: cursor.toISOString().slice(0, 10), valor: Number(valor.toFixed(4)) });
    valor *= 1 + MENSUAL_PASO;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return puntos;
}

export class FakeIndexProvider implements IndexProvider {
  readonly name = "fake";

  private readonly series: Record<Serie, PuntoSerie[]>;

  constructor(overrides: Partial<Record<Serie, PuntoSerie[]>> = {}) {
    // Las series se arman una sola vez por frecuencia y se comparten: son
    // inmutables y generarlas seis veces es tiempo de test regalado.
    const diaria = serieDiaria();
    const mensual = serieMensual();

    this.series = Object.fromEntries(
      SERIES.map((serie) => [
        serie,
        overrides[serie] ?? (CATALOGO[serie].frecuencia === "diaria" ? diaria : mensual),
      ]),
    ) as Record<Serie, PuntoSerie[]>;
  }

  async obtener(serie: Serie): Promise<PuntoSerie[]> {
    return this.series[serie];
  }
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/unit/indices.provider.test.ts`
Expected: PASS, todo el archivo.

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/services/indices/fake.provider.ts backend/tests/unit/indices.provider.test.ts
git commit -m "feat(indices): el provider falso arma las seis series segun su frecuencia"
```

---

## Task 4: Aritmética — fechas e índice de cada tramo

**Files:**
- Modify: `backend/src/modules/calculators/calculators.math.ts`
- Test: `backend/tests/unit/calculators.math.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido completo de `backend/tests/unit/calculators.math.test.ts` por:

```ts
import {
  claveMesAnterior,
  indiceParaTramo,
  mesSiguiente,
  sumarMeses,
  valorVigente,
  type PuntoSerie,
} from "@/modules/calculators/calculators.math";

// Serie diaria recortada: el BCRA no publica sábados, domingos ni feriados.
const ICL: PuntoSerie[] = [
  { fecha: "2020-07-01", valor: 1 },
  { fecha: "2021-05-03", valor: 1.28 },
  { fecha: "2021-05-04", valor: 1.29 },
  { fecha: "2021-05-07", valor: 1.31 },
];

// Serie mensual: el INDEC fecha cada índice el día 1 del mes que mide.
const IPC: PuntoSerie[] = [
  { fecha: "2025-05-01", valor: 8000 },
  { fecha: "2025-06-01", valor: 8855.5681 },
  { fecha: "2025-07-01", valor: 9023.973 },
];

describe("valorVigente", () => {
  it("devuelve el valor del día cuando ese día se publicó", () => {
    expect(valorVigente(ICL, "2021-05-04")).toEqual({ fecha: "2021-05-04", valor: 1.29 });
  });

  it("cae al último día hábil publicado cuando la fecha no tiene dato", () => {
    // 2021-05-05 y 06 no están en la serie: corresponde el del 04.
    expect(valorVigente(ICL, "2021-05-06")).toEqual({ fecha: "2021-05-04", valor: 1.29 });
  });

  it("devuelve null antes del primer dato publicado", () => {
    expect(valorVigente(ICL, "2020-06-30")).toBeNull();
  });
});

describe("sumarMeses", () => {
  it("suma meses conservando el día", () => {
    expect(sumarMeses("2024-08-01", 6)).toBe("2025-02-01");
    expect(sumarMeses("2024-08-15", 12)).toBe("2025-08-15");
  });

  it("cruza el año", () => {
    expect(sumarMeses("2024-11-10", 3)).toBe("2025-02-10");
    expect(sumarMeses("2024-12-05", 1)).toBe("2025-01-05");
  });

  it("cae al último día del mes cuando el día no existe ahí", () => {
    // Un contrato firmado el 31 de enero se ajusta el 28 o 29 de febrero: no
    // hay 31 de febrero, y correrlo al 3 de marzo movería todos los tramos.
    expect(sumarMeses("2024-01-31", 1)).toBe("2024-02-29"); // bisiesto
    expect(sumarMeses("2025-01-31", 1)).toBe("2025-02-28");
    expect(sumarMeses("2025-03-31", 1)).toBe("2025-04-30");
  });

  it("devuelve la misma fecha al sumar cero", () => {
    expect(sumarMeses("2024-08-01", 0)).toBe("2024-08-01");
  });
});

describe("claveMesAnterior y mesSiguiente", () => {
  it("da el día 1 del mes anterior, sin importar el día de la fecha", () => {
    expect(claveMesAnterior("2024-08-15")).toBe("2024-07-01");
    expect(claveMesAnterior("2024-08-01")).toBe("2024-07-01");
  });

  it("cruza el año hacia atrás", () => {
    expect(claveMesAnterior("2025-01-09")).toBe("2024-12-01");
  });

  it("mesSiguiente da el día 1 del mes que sigue", () => {
    expect(mesSiguiente("2016-12-01")).toBe("2017-01-01");
  });
});

describe("indiceParaTramo - series diarias", () => {
  it("usa el último día hábil publicado", () => {
    expect(indiceParaTramo(ICL, "2021-05-06", "diaria")).toEqual({
      fecha: "2021-05-04",
      valor: 1.29,
    });
  });

  it("devuelve null para una fecha posterior al último dato", () => {
    // Sin esto, `valorVigente` devolvería el último índice para cualquier fecha
    // futura y el cronograma inventaría ajustes que el BCRA no publicó.
    expect(indiceParaTramo(ICL, "2021-05-08", "diaria")).toBeNull();
  });

  it("devuelve null antes del primer dato", () => {
    expect(indiceParaTramo(ICL, "2020-06-30", "diaria")).toBeNull();
  });
});

describe("indiceParaTramo - series mensuales", () => {
  it("usa el índice del mes ANTERIOR al del tramo", () => {
    // Un alquiler que arranca en julio se pactó con los precios de junio: el
    // índice de un mes mide el nivel de precios de ese mes.
    expect(indiceParaTramo(IPC, "2025-07-01", "mensual")).toEqual({
      fecha: "2025-06-01",
      valor: 8855.5681,
    });
  });

  it("ignora el día de la fecha", () => {
    expect(indiceParaTramo(IPC, "2025-07-23", "mensual")).toEqual({
      fecha: "2025-06-01",
      valor: 8855.5681,
    });
  });

  it("devuelve null cuando el mes anterior no está publicado", () => {
    expect(indiceParaTramo(IPC, "2025-09-01", "mensual")).toBeNull();
    expect(indiceParaTramo(IPC, "2025-05-01", "mensual")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/unit/calculators.math.test.ts`
Expected: FAIL — `sumarMeses`, `claveMesAnterior`, `mesSiguiente` e `indiceParaTramo` no existen.

- [ ] **Step 3: Escribir los helpers**

En `backend/src/modules/calculators/calculators.math.ts`, **borrar** `calcularIcl`, `ResultadoIcl`, `calcularIpc`, `ResultadoIpc`, `mesesEntre` y `Periodo` (quedan sin uso), y **conservar** `PuntoSerie`, `aCentavos` y `valorVigente`.

Agregar el import arriba de todo, antes del comentario de cabecera del archivo. Va contra `catalogo.ts` y no contra `@/shared/services/indices` a propósito: el barril reexporta `index.provider.ts`, que a su vez importa `PuntoSerie` de este archivo, y apuntar al barril armaría un ciclo. `catalogo.ts` no importa nada del módulo de calculadoras, así que la dependencia queda en una sola dirección.

```ts
import type { Frecuencia } from "@/shared/services/indices/catalogo";
```

Después agregar, debajo de `valorVigente`:

```ts
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `fecha` + `meses` meses, en ISO.
 *
 * Si el día no existe en el mes destino, cae al último día de ese mes: un
 * contrato firmado el 31 de enero se ajusta el 28 de febrero, no el 3 de marzo.
 * Correrlo al mes siguiente desplazaría además todos los tramos posteriores.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);

  const total = anio * 12 + (mes - 1) + meses;
  const anioDestino = Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;

  // Día 0 del mes siguiente = último día del mes pedido.
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();

  return `${anioDestino}-${pad(mesDestino)}-${pad(Math.min(dia, ultimoDia))}`;
}

/** Día 1 del mes anterior al de `fecha`, que es como el INDEC fecha su índice. */
export function claveMesAnterior(fecha: string): string {
  const [anio, mes] = fecha.split("-").map(Number);
  return mes === 1 ? `${anio - 1}-12-01` : `${anio}-${pad(mes - 1)}-01`;
}

/** Día 1 del mes siguiente al de `fecha`. Alimenta los mensajes de error. */
export function mesSiguiente(fecha: string): string {
  const [anio, mes] = fecha.split("-").map(Number);
  return mes === 12 ? `${anio + 1}-01-01` : `${anio}-${pad(mes + 1)}-01`;
}

/**
 * Índice que le corresponde a un tramo que cae en `fecha`, o null si todavía no
 * se puede calcular.
 *
 * Las dos ramas dicen cosas distintas:
 *
 * - **Diaria**: el último publicado en o antes de la fecha, porque el BCRA no
 *   publica sábados, domingos ni feriados. Pero una fecha **posterior** al
 *   último dato no tiene índice: devolver el último inventaría un ajuste que el
 *   organismo no publicó.
 * - **Mensual**: el índice del mes anterior, exacto. Si ese mes no está, el
 *   tramo no se puede calcular.
 */
export function indiceParaTramo(
  serie: PuntoSerie[],
  fecha: string,
  frecuencia: Frecuencia,
): PuntoSerie | null {
  if (serie.length === 0) return null;

  if (frecuencia === "mensual") {
    return serie.find((p) => p.fecha === claveMesAnterior(fecha)) ?? null;
  }

  if (fecha > serie[serie.length - 1].fecha) return null;
  return valorVigente(serie, fecha);
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/unit/calculators.math.test.ts`
Expected: PASS, 15 tests.

El typecheck todavía va a fallar: el service importa `calcularIcl`. Se arregla en la tarea 7.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/calculators/calculators.math.ts backend/tests/unit/calculators.math.test.ts
git commit -m "feat(calculators): fechas de tramo e indice por frecuencia de la serie"
```

---

## Task 5: Aritmética — el cronograma

**Files:**
- Modify: `backend/src/modules/calculators/calculators.math.ts`
- Test: `backend/tests/unit/calculators.math.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar `calcularCronograma` al import que ya está arriba del archivo:

```ts
import {
  calcularCronograma,
  claveMesAnterior,
  indiceParaTramo,
  mesSiguiente,
  sumarMeses,
  valorVigente,
  type PuntoSerie,
} from "@/modules/calculators/calculators.math";
```

Y agregar al final del archivo:

```ts
/**
 * Vector de referencia: la corrida real de la calculadora que usa el Colegio de
 * Corredores de Entre Ríos, con 300.000, inicio 1/8/2024, cada 6 meses, ICL.
 * Los cinco valores y los cuatro porcentajes tienen que dar exactamente esto.
 */
const ICL_SEMESTRAL: PuntoSerie[] = [
  { fecha: "2024-08-01", valor: 17.1 },
  { fecha: "2025-02-01", valor: 22.31 },
  { fecha: "2025-08-01", valor: 26.62 },
  { fecha: "2026-02-01", valor: 30.03 },
  { fecha: "2026-08-01", valor: 35.01 },
];

describe("calcularCronograma - contra la calculadora del Colegio", () => {
  const tramos = calcularCronograma({
    montoInicial: 300000,
    fechaInicio: "2024-08-01",
    mesesPeriodo: 6,
    serie: ICL_SEMESTRAL,
    frecuencia: "diaria",
  });

  it("emite un tramo por cada ajuste con índice publicado", () => {
    expect(tramos).toHaveLength(5);
    expect(tramos.map((t) => t.fecha)).toEqual([
      "2024-08-01",
      "2025-02-01",
      "2025-08-01",
      "2026-02-01",
      "2026-08-01",
    ]);
    expect(tramos.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it("da los mismos montos que la calculadora oficial", () => {
    expect(tramos.map((t) => t.valor)).toEqual([
      300000, 391403.51, 467017.54, 526842.11, 614210.53,
    ]);
  });

  it("informa el aumento de cada tramo respecto del anterior", () => {
    expect(tramos[0].aumento).toBe(0);
    expect(tramos[1].aumento).toBeCloseTo(0.3047, 4);
    expect(tramos[2].aumento).toBeCloseTo(0.1932, 4);
    expect(tramos[3].aumento).toBeCloseTo(0.1281, 4);
    expect(tramos[4].aumento).toBeCloseTo(0.1658, 4);
  });

  it("expone el índice que usó cada tramo", () => {
    expect(tramos.map((t) => t.indice)).toEqual([17.1, 22.31, 26.62, 30.03, 35.01]);
  });
});

describe("calcularCronograma - corte y bordes", () => {
  it("corta en el último tramo con índice publicado", () => {
    // La serie llega hasta 2026-08-01: el tramo de 2027-02-01 no existe todavía.
    const tramos = calcularCronograma({
      montoInicial: 300000,
      fechaInicio: "2024-08-01",
      mesesPeriodo: 6,
      serie: ICL_SEMESTRAL,
      frecuencia: "diaria",
    });

    expect(tramos[tramos.length - 1].fecha).toBe("2026-08-01");
  });

  it("devuelve un solo tramo cuando el contrato todavía no se ajustó", () => {
    const tramos = calcularCronograma({
      montoInicial: 300000,
      fechaInicio: "2026-08-01",
      mesesPeriodo: 6,
      serie: ICL_SEMESTRAL,
      frecuencia: "diaria",
    });

    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({ numero: 1, valor: 300000, aumento: 0 });
  });

  it("devuelve vacío cuando el inicio queda fuera de la serie", () => {
    expect(
      calcularCronograma({
        montoInicial: 300000,
        fechaInicio: "2019-01-01",
        mesesPeriodo: 6,
        serie: ICL_SEMESTRAL,
        frecuencia: "diaria",
      }),
    ).toEqual([]);
  });

  it("no arrastra el redondeo del tramo anterior", () => {
    // Cada valor sale de montoInicial x indice[n]/indice[0], no del valor
    // anterior: encadenar montos ya redondeados a centavos corre el resultado.
    const serie: PuntoSerie[] = [
      { fecha: "2024-01-01", valor: 3 },
      { fecha: "2024-02-01", valor: 7 },
      { fecha: "2024-03-01", valor: 11 },
    ];

    const tramos = calcularCronograma({
      montoInicial: 100000,
      fechaInicio: "2024-01-01",
      mesesPeriodo: 1,
      serie,
      frecuencia: "diaria",
    });

    // 100000 x 7/3 = 233333.333... ; 100000 x 11/3 = 366666.666...
    expect(tramos[1].valor).toBe(233333.33);
    expect(tramos[2].valor).toBe(366666.67);
  });

  it("aplica el corrimiento de mes en las series mensuales", () => {
    const serie: PuntoSerie[] = [
      { fecha: "2025-06-01", valor: 100 },
      { fecha: "2025-07-01", valor: 110 },
      { fecha: "2025-08-01", valor: 121 },
    ];

    // Contrato que arranca en julio 2025 y se ajusta cada mes: el tramo de
    // julio usa el índice de junio y el de agosto el de julio.
    const tramos = calcularCronograma({
      montoInicial: 500000,
      fechaInicio: "2025-07-01",
      mesesPeriodo: 1,
      serie,
      frecuencia: "mensual",
    });

    expect(tramos).toHaveLength(3);
    expect(tramos.map((t) => t.indice)).toEqual([100, 110, 121]);
    expect(tramos.map((t) => t.valor)).toEqual([500000, 550000, 605000]);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/unit/calculators.math.test.ts -t "calcularCronograma"`
Expected: FAIL — `calcularCronograma` no existe.

- [ ] **Step 3: Escribir el cálculo**

Agregar al final de `backend/src/modules/calculators/calculators.math.ts`:

```ts
export interface Tramo {
  /** 1-based: el tramo 1 es el arranque del contrato, sin aumento. */
  numero: number;
  /** Fecha del ajuste, en ISO. */
  fecha: string;
  /** Valor del índice que se usó. */
  indice: number;
  /** Fracción respecto del tramo anterior: 0.3047 son 30,47 %. Cero en el primero. */
  aumento: number;
  /** El alquiler a partir de esa fecha. */
  valor: number;
}

/**
 * Tope de tramos.
 *
 * La serie más vieja arranca en 2016 y el período mínimo es de un mes, así que
 * un contrato real no pasa de ~120 tramos. Está para que una fecha disparatada
 * no deje el proceso girando.
 */
const MAX_TRAMOS = 240;

/**
 * Cronograma de actualizaciones de un contrato.
 *
 * Cada tramo se calcula contra el índice **inicial**, no contra el valor del
 * tramo anterior: encadenar montos ya redondeados a centavos acumularía el
 * error tramo a tramo. El cociente contra el índice inicial da el mismo número
 * que la calculadora oficial y no depende de cuántos tramos haya en el medio.
 *
 * Devuelve vacío si la fecha de inicio no tiene índice: el service es quien
 * traduce eso a un mensaje que diga desde cuándo rige la serie.
 */
export function calcularCronograma(params: {
  montoInicial: number;
  fechaInicio: string;
  mesesPeriodo: number;
  serie: PuntoSerie[];
  frecuencia: Frecuencia;
}): Tramo[] {
  const { montoInicial, fechaInicio, mesesPeriodo, serie, frecuencia } = params;

  const base = indiceParaTramo(serie, fechaInicio, frecuencia);
  if (!base) return [];

  const tramos: Tramo[] = [];
  let anterior = base;

  for (let n = 0; n < MAX_TRAMOS; n++) {
    const fecha = n === 0 ? fechaInicio : sumarMeses(fechaInicio, n * mesesPeriodo);
    const indice = indiceParaTramo(serie, fecha, frecuencia);

    // El primer tramo sin índice corta el cronograma: de ahí en adelante el
    // organismo todavía no publicó nada.
    if (!indice) break;

    tramos.push({
      numero: n + 1,
      fecha,
      indice: indice.valor,
      aumento: n === 0 ? 0 : indice.valor / anterior.valor - 1,
      valor: aCentavos(montoInicial * (indice.valor / base.valor)),
    });

    anterior = indice;
  }

  return tramos;
}
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/unit/calculators.math.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/calculators/calculators.math.ts backend/tests/unit/calculators.math.test.ts
git commit -m "feat(calculators): cronograma de ajustes verificado contra la calculadora del Colegio"
```

---

## Task 6: Schema de entrada del cronograma

**Files:**
- Modify: `backend/src/modules/calculators/calculators.schemas.ts`
- Test: cubierto por `backend/tests/unit/calculators.router.test.ts` (Task 8)

- [ ] **Step 1: Reemplazar el archivo**

Reemplazar el contenido completo de `backend/src/modules/calculators/calculators.schemas.ts` por:

```ts
import { z } from "zod";
import { SERIES } from "@/shared/services/indices";

// Un monto de contrato: positivo y acotado por arriba para que un número
// absurdo no llegue al cálculo y vuelva como Infinity.
const monto = z
  .number({ invalid_type_error: "El monto tiene que ser un número" })
  .positive("El monto tiene que ser mayor a cero")
  .max(1_000_000_000_000, "El monto es demasiado grande");

const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que tener el formato AAAA-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "La fecha no existe");

export const cronogramaSchema = z.object({
  montoInicial: monto,
  fechaInicio: fechaIso,
  // Doce es el techo del formulario y también el de la ley: un contrato no se
  // ajusta con período mayor a un año.
  mesesPeriodo: z.coerce
    .number()
    .int("El período tiene que ser un número entero de meses")
    .min(1, "El período va de 1 a 12 meses")
    .max(12, "El período va de 1 a 12 meses"),
  serie: z.enum(SERIES, {
    errorMap: () => ({ message: "Índice desconocido" }),
  }),
});

export type CronogramaBody = z.infer<typeof cronogramaSchema>;
```

- [ ] **Step 2: Verificar que compila**

Run: `cd backend && npx tsc --noEmit`
Expected: los errores que quedan son solo de `calculators.service.ts` y `calculators.router.ts`, que todavía importan `iclSchema`/`ipcSchema`. Se arreglan en las tareas 7 y 8. Ningún error en `calculators.schemas.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/calculators/calculators.schemas.ts
git commit -m "feat(calculators): schema de entrada del cronograma"
```

---

## Task 7: Service — cronograma y estado de las series

**Files:**
- Modify: `backend/src/modules/calculators/calculators.service.ts`
- Test: `backend/tests/unit/calculators.service.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido completo de `backend/tests/unit/calculators.service.test.ts` por:

```ts
import {
  CalculatorsService,
  type IndicesRepository,
} from "@/modules/calculators/calculators.service";
import { FakeIndexProvider, type PuntoSerie, type Serie } from "@/shared/services/indices";
import { AppError, ValidationError } from "@/shared/errors";

const ICL: PuntoSerie[] = [
  { fecha: "2024-08-01", valor: 17.1 },
  { fecha: "2025-02-01", valor: 22.31 },
  { fecha: "2025-08-01", valor: 26.62 },
  { fecha: "2026-02-01", valor: 30.03 },
  { fecha: "2026-08-01", valor: 35.01 },
];

// Índice IPC mensual: el de un mes es el nivel de precios de ese mes.
const IPC: PuntoSerie[] = [
  { fecha: "2025-05-01", valor: 8000 },
  { fecha: "2025-06-01", valor: 8855.5681 },
  { fecha: "2025-07-01", valor: 9023.973 },
  { fecha: "2026-06-01", valor: 11826.4103 },
];

const AHORA = new Date("2026-08-06T12:00:00Z");

/** Repositorio en memoria: guarda lo que le mandan y lo devuelve tal cual. */
function makeRepo(inicial: Partial<Record<Serie, PuntoSerie[]>> = {}) {
  const series: Partial<Record<Serie, PuntoSerie[]>> = { ...inicial };
  const syncs: Partial<Record<Serie, { ultimoDato: string; sincronizadoEn: Date }>> = {};

  for (const serie of Object.keys(inicial) as Serie[]) {
    const puntos = inicial[serie] ?? [];
    if (puntos.length > 0) {
      syncs[serie] = {
        ultimoDato: puntos[puntos.length - 1].fecha,
        sincronizadoEn: AHORA,
      };
    }
  }

  const repo: IndicesRepository = {
    leerSerie: jest.fn(async (serie: Serie) => series[serie] ?? []),
    leerSync: jest.fn(async (serie: Serie) => syncs[serie] ?? null),
    guardarSerie: jest.fn(async (serie: Serie, puntos: PuntoSerie[]) => {
      series[serie] = puntos;
      syncs[serie] = {
        ultimoDato: puntos[puntos.length - 1]?.fecha ?? "",
        sincronizadoEn: AHORA,
      };
    }),
  };

  return { repo, syncs };
}

function makeService(
  repo: IndicesRepository,
  provider = new FakeIndexProvider({ icl: ICL, ipc: IPC }),
  ttlHoras = 12,
) {
  return new CalculatorsService(repo, provider, { ttlHoras, ahora: () => AHORA });
}

const ENTRADA = {
  montoInicial: 300000,
  fechaInicio: "2024-08-01",
  mesesPeriodo: 6,
  serie: "icl" as const,
};

describe("CalculatorsService - refresco de la caché", () => {
  it("baja la serie cuando la caché está vacía", async () => {
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).toHaveBeenCalledWith("icl");
    expect(repo.guardarSerie).toHaveBeenCalledWith("icl", ICL);
  });

  it("no vuelve a pedirla mientras la última sincronización esté dentro del TTL", async () => {
    const { repo } = makeRepo({ icl: ICL });
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).not.toHaveBeenCalled();
  });

  it("la vuelve a pedir cuando la última sincronización venció el TTL", async () => {
    const { repo, syncs } = makeRepo({ icl: ICL });
    syncs.icl = {
      ultimoDato: "2026-08-01",
      sincronizadoEn: new Date(AHORA.getTime() - 13 * 60 * 60 * 1000),
    };
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).toHaveBeenCalledWith("icl");
  });

  it("no dispara dos bajadas simultáneas de la misma serie", async () => {
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");
    const service = makeService(repo, provider);

    await Promise.all([
      service.calcularCronograma(ENTRADA),
      service.calcularCronograma(ENTRADA),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("baja solo la serie que se pidió, no las seis", async () => {
    // Con seis series, bajarlas todas en cada cálculo sería seis viajes contra
    // dos organismos para responder una sola pregunta.
    const { repo } = makeRepo();
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    const spy = jest.spyOn(provider, "obtener");

    await makeService(repo, provider).calcularCronograma(ENTRADA);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("CalculatorsService - la fuente oficial caída", () => {
  function providerCaido() {
    const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
    jest.spyOn(provider, "obtener").mockRejectedValue(new Error("BCRA 500"));
    return provider;
  }

  it("responde con lo cacheado en vez de romper la pantalla", async () => {
    const { repo, syncs } = makeRepo({ icl: ICL });
    // Caché vencida: se intenta refrescar y falla.
    syncs.icl = {
      ultimoDato: "2026-08-01",
      sincronizadoEn: new Date(AHORA.getTime() - 48 * 60 * 60 * 1000),
    };

    const r = await makeService(repo, providerCaido()).calcularCronograma(ENTRADA);

    expect(r.tramos).toHaveLength(5);
  });

  it("devuelve 503 solo si además no hay nada cacheado", async () => {
    const { repo } = makeRepo();

    const error = await makeService(repo, providerCaido())
      .calcularCronograma(ENTRADA)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
  });

  it("nombra la serie que no pudo bajar", async () => {
    const { repo } = makeRepo();

    const error = await makeService(repo, providerCaido())
      .calcularCronograma({ ...ENTRADA, serie: "uva" })
      .catch((e: unknown) => e);

    expect((error as AppError).message).toMatch(/UVA/);
  });
});

describe("CalculatorsService - cronograma", () => {
  it("devuelve los tramos con la serie y cuándo se sincronizó", async () => {
    const { repo } = makeRepo({ icl: ICL });

    const r = await makeService(repo).calcularCronograma(ENTRADA);

    expect(r.serie).toBe("icl");
    expect(r.sincronizadoEn).toBe(AHORA.toISOString());
    expect(r.tramos.map((t) => t.valor)).toEqual([
      300000, 391403.51, 467017.54, 526842.11, 614210.53,
    ]);
  });

  it("usa el índice del mes anterior en una serie mensual", async () => {
    const { repo } = makeRepo({ ipc: IPC });

    const r = await makeService(repo).calcularCronograma({
      montoInicial: 500000,
      fechaInicio: "2025-07-01",
      mesesPeriodo: 1,
      serie: "ipc",
    });

    // Julio 2025 se calcula con el índice de junio 2025.
    expect(r.tramos[0].indice).toBe(8855.5681);
  });

  it("rechaza un inicio anterior al primer dato publicado", async () => {
    const { repo } = makeRepo({ icl: ICL });

    const error = await makeService(repo)
      .calcularCronograma({ ...ENTRADA, fechaInicio: "2019-01-01" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/ICL/);
  });

  it("explica que una serie mensual no admite arrancar en su primer mes", async () => {
    // El IPC de esta caché arranca en mayo 2025; un contrato que arranque en
    // mayo se ajustaría contra abril, que no existe.
    const { repo } = makeRepo({ ipc: IPC });

    const error = await makeService(repo)
      .calcularCronograma({
        montoInicial: 500000,
        fechaInicio: "2025-05-10",
        mesesPeriodo: 1,
        serie: "ipc",
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/2025-06-01/);
  });

  it("rechaza un inicio posterior al último dato publicado", async () => {
    const { repo } = makeRepo({ icl: ICL });

    const error = await makeService(repo)
      .calcularCronograma({ ...ENTRADA, fechaInicio: "2027-01-01" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/todavía no hay índice/i);
  });
});

describe("CalculatorsService - estado de las series", () => {
  it("informa el rango, la sincronización y los datos del catálogo", async () => {
    const { repo } = makeRepo({ icl: ICL, ipc: IPC });

    const estado = await makeService(repo).estadoIndices();

    expect(estado.icl).toMatchObject({
      desde: "2024-08-01",
      hasta: "2026-08-01",
      etiqueta: "ICL",
      nombre: "Índice para Contratos de Locación",
      organismo: "BCRA",
      frecuencia: "diaria",
      sincronizadoEn: AHORA.toISOString(),
    });
  });

  it("informa las seis series", async () => {
    const { repo } = makeRepo();

    const estado = await makeService(repo).estadoIndices();

    expect(Object.keys(estado).sort()).toEqual([
      "cer",
      "icl",
      "ipc",
      "ipim",
      "is",
      "uva",
    ]);
  });

  it("informa la sincronización que acaba de hacer, no la de antes", async () => {
    // Con la caché vacía, estadoIndices baja la serie y recién ahí hay un sync
    // que informar. Leerlo en paralelo con la bajada devolvía null y la
    // pantalla decía "nunca actualizado" justo después de actualizar.
    const { repo } = makeRepo();

    const estado = await makeService(repo).estadoIndices();

    expect(estado.icl.sincronizadoEn).toBe(AHORA.toISOString());
    expect(estado.ipim.sincronizadoEn).toBe(AHORA.toISOString());
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/unit/calculators.service.test.ts`
Expected: FAIL — `calcularCronograma` no existe en `CalculatorsService`.

- [ ] **Step 3: Reescribir el service**

En `backend/src/modules/calculators/calculators.service.ts`:

Reemplazar el bloque de imports y los helpers de mes (líneas 1-81) por:

```ts
import { logger } from "@/config/logger";
import { AppError, ValidationError } from "@/shared/errors";
import type { Frecuencia, IndexProvider, PuntoSerie, Serie } from "@/shared/services/indices";
import { CATALOGO, SERIES } from "@/shared/services/indices";
import {
  calcularCronograma,
  mesSiguiente,
  type Tramo,
} from "./calculators.math";

export interface SyncRecord {
  /** Fecha ISO del dato más nuevo que trajo la última sincronización. */
  ultimoDato: string;
  sincronizadoEn: Date;
}

export interface IndicesRepository {
  leerSerie(serie: Serie): Promise<PuntoSerie[]>;
  leerSync(serie: Serie): Promise<SyncRecord | null>;
  guardarSerie(serie: Serie, puntos: PuntoSerie[]): Promise<void>;
}

export interface EstadoSerie {
  /** Primera fecha con dato, en ISO. */
  desde: string;
  /** Última fecha con dato, en ISO. */
  hasta: string;
  /** Cuándo se trajo por última vez, en ISO. Null si nunca se sincronizó. */
  sincronizadoEn: string | null;
  /** Lo que dice el botón: "ICL". */
  etiqueta: string;
  /** El nombre completo, para el texto de ayuda. */
  nombre: string;
  /** Quién lo publica. Va en el aviso legal. */
  organismo: string;
  frecuencia: Frecuencia;
}

export interface EntradaCronograma {
  montoInicial: number;
  fechaInicio: string;
  mesesPeriodo: number;
  serie: Serie;
}

export interface ResultadoCronograma {
  serie: Serie;
  tramos: Tramo[];
  /** Cuándo se bajó la serie, para que la pantalla diga de cuándo es el dato. */
  sincronizadoEn: string | null;
}

interface Opciones {
  ttlHoras?: number;
  /** Inyectable para que los tests no dependan del reloj. */
  ahora?: () => Date;
}
```

Reemplazar el bloque `throw new AppError(...)` del método privado `serie()` (líneas 155-163 del original) por:

```ts
    if (puntos.length === 0) {
      const { etiqueta, organismo } = CATALOGO[serie];
      throw new AppError(
        `No se pudo obtener el ${etiqueta} del ${organismo} en este momento. Reintentá en unos minutos.`,
        503,
        "INDEX_UNAVAILABLE",
      );
    }
```

Reemplazar `estadoIndices` y los dos métodos de cálculo (`calcularIcl` y `calcularIpc`, líneas 168-268 del original) por:

```ts
  async estadoIndices(): Promise<Record<Serie, EstadoSerie>> {
    const entradas = await Promise.all(
      SERIES.map(async (serie) => {
        // El sync se lee DESPUÉS de resolver la serie, no en paralelo: si la
        // caché estaba vacía, `serie()` acaba de bajarla y escribir el sync.
        // Leerlo antes devolvía null y la pantalla decía "nunca actualizado"
        // justo después de actualizar.
        const puntos = await this.serie(serie);
        const sync = await this.repo.leerSync(serie);
        const { etiqueta, nombre, organismo, frecuencia } = CATALOGO[serie];

        const estado: EstadoSerie = {
          desde: puntos[0].fecha,
          hasta: puntos[puntos.length - 1].fecha,
          sincronizadoEn: sync?.sincronizadoEn.toISOString() ?? null,
          etiqueta,
          nombre,
          organismo,
          frecuencia,
        };
        return [serie, estado] as const;
      }),
    );

    return Object.fromEntries(entradas) as Record<Serie, EstadoSerie>;
  }

  // ── Cronograma ────────────────────────────────────────────

  /**
   * Cronograma de ajustes de un contrato, desde su inicio hasta el último
   * ajuste con índice publicado.
   *
   * Baja **solo** la serie que se pidió: con seis series, resolverlas todas en
   * cada cálculo sería seis viajes contra dos organismos para responder una
   * sola pregunta.
   */
  async calcularCronograma(entrada: EntradaCronograma): Promise<ResultadoCronograma> {
    const { montoInicial, fechaInicio, mesesPeriodo, serie } = entrada;

    const puntos = await this.serie(serie);
    const { etiqueta, frecuencia } = CATALOGO[serie];

    const tramos = calcularCronograma({
      montoInicial,
      fechaInicio,
      mesesPeriodo,
      serie: puntos,
      frecuencia,
    });

    if (tramos.length === 0) {
      throw this.sinIndice(fechaInicio, puntos, etiqueta, frecuencia);
    }

    const sync = await this.repo.leerSync(serie);

    return {
      serie,
      tramos,
      sincronizadoEn: sync?.sincronizadoEn.toISOString() ?? null,
    };
  }

  /**
   * Por qué la fecha de inicio no tiene índice.
   *
   * Son tres motivos distintos y el mensaje tiene que decir cuál: "no se puede
   * calcular" deja a la persona probando fechas al azar.
   */
  private sinIndice(
    fechaInicio: string,
    puntos: PuntoSerie[],
    etiqueta: string,
    frecuencia: Frecuencia,
  ): ValidationError {
    const primera = puntos[0].fecha;
    const ultima = puntos[puntos.length - 1].fecha;

    if (fechaInicio > ultima) {
      return new ValidationError(
        `El último ${etiqueta} publicado es del ${ultima}: todavía no hay índice para el ${fechaInicio}.`,
      );
    }

    if (frecuencia === "mensual") {
      // El contrato se ajusta contra el índice del mes anterior, así que no
      // puede arrancar en el primer mes de la serie: ese mes no tiene base.
      return new ValidationError(
        `Con el ${etiqueta} el contrato no puede arrancar antes del ${mesSiguiente(primera)}: cada tramo se calcula contra el índice del mes anterior.`,
      );
    }

    return new ValidationError(
      `El ${etiqueta} rige desde el ${primera}: no hay índice para el ${fechaInicio}.`,
    );
  }
}
```

Actualizar también el comentario de clase (líneas 83-95 del original) para que hable de seis series en vez de dos:

```ts
/**
 * Calculadoras de indexación de contratos.
 *
 * Las seis series viven cacheadas en la base y se refrescan por TTL, sin
 * scheduler: la primera consulta que llega con la caché vencida dispara la
 * bajada, y solo de la serie que se pidió. No hay cron porque el proyecto no
 * tiene infraestructura de jobs y montarla para series que se publican una vez
 * por día y una vez por mes no se paga.
 *
 * Regla de disponibilidad: **si el organismo oficial está caído, la calculadora
 * sigue andando con lo último que se bajó**. El endpoint de estado expone
 * `sincronizadoEn` para que la pantalla pueda avisar de cuándo es el dato. Solo
 * se corta con 503 cuando no hay absolutamente nada cacheado.
 */
```

- [ ] **Step 4: Correr los tests**

Run: `cd backend && npx jest tests/unit/calculators.service.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/calculators/calculators.service.ts backend/tests/unit/calculators.service.test.ts
git commit -m "feat(calculators): el service arma el cronograma sobre cualquiera de las seis series"
```

---

## Task 8: Router — `POST /cronograma`

**Files:**
- Modify: `backend/src/modules/calculators/calculators.router.ts`
- Test: `backend/tests/unit/calculators.router.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido completo de `backend/tests/unit/calculators.router.test.ts` por:

```ts
import express from "express";
import request from "supertest";
import { createCalculatorsRouter } from "@/modules/calculators/calculators.router";
import {
  CalculatorsService,
  type IndicesRepository,
} from "@/modules/calculators/calculators.service";
import { FakeIndexProvider, type PuntoSerie } from "@/shared/services/indices";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";

const ICL: PuntoSerie[] = [
  { fecha: "2024-08-01", valor: 17.1 },
  { fecha: "2025-02-01", valor: 22.31 },
  { fecha: "2025-08-01", valor: 26.62 },
  { fecha: "2026-02-01", valor: 30.03 },
  { fecha: "2026-08-01", valor: 35.01 },
];

const IPC: PuntoSerie[] = [
  { fecha: "2025-05-01", valor: 8000 },
  { fecha: "2025-06-01", valor: 8855.5681 },
  { fecha: "2025-07-01", valor: 9023.973 },
];

const AHORA = new Date("2026-08-06T12:00:00Z");

const CUERPO = {
  montoInicial: 300000,
  fechaInicio: "2024-08-01",
  mesesPeriodo: 6,
  serie: "icl",
};

function makeApp() {
  const provider = new FakeIndexProvider({ icl: ICL, ipc: IPC });
  const series: Partial<Record<string, PuntoSerie[]>> = {};

  const repo: IndicesRepository = {
    leerSerie: jest.fn(async (s) => series[s] ?? []),
    leerSync: jest.fn(async (s) =>
      series[s]
        ? { ultimoDato: series[s]![series[s]!.length - 1].fecha, sincronizadoEn: AHORA }
        : null,
    ),
    guardarSerie: jest.fn(async (s, puntos) => {
      series[s] = puntos;
    }),
  };

  const service = new CalculatorsService(repo, provider, {
    ttlHoras: 12,
    ahora: () => AHORA,
  });

  const app = express();
  app.use(express.json());
  app.use("/api/calculators", createCalculatorsRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, repo };
}

describe("calculators router", () => {
  it("responde sin token: es una herramienta abierta del portal", async () => {
    const { app } = makeApp();

    const res = await request(app).post("/api/calculators/cronograma").send(CUERPO);

    expect(res.status).toBe(200);
    expect(res.body.serie).toBe("icl");
    expect(res.body.tramos).toHaveLength(5);
    expect(res.body.tramos[4].valor).toBe(614210.53);
  });

  it("expone el rango y los datos de catálogo de cada serie", async () => {
    const { app } = makeApp();

    const res = await request(app).get("/api/calculators/indices");

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["cer", "icl", "ipc", "ipim", "is", "uva"]);
    expect(res.body.icl).toMatchObject({
      desde: "2024-08-01",
      hasta: "2026-08-01",
      etiqueta: "ICL",
      organismo: "BCRA",
      frecuencia: "diaria",
    });
  });

  it("calcula sobre una serie mensual", async () => {
    const { app } = makeApp();

    const res = await request(app).post("/api/calculators/cronograma").send({
      montoInicial: 500000,
      fechaInicio: "2025-07-01",
      mesesPeriodo: 1,
      serie: "ipc",
    });

    expect(res.status).toBe(200);
    expect(res.body.tramos[0].indice).toBe(8855.5681);
  });

  it("rechaza un monto que no es un número positivo", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, montoInicial: -5 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza una fecha que no es una fecha", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, fechaInicio: "ayer" });

    expect(res.status).toBe(422);
  });

  it("rechaza un período fuera del 1..12", async () => {
    const { app } = makeApp();

    for (const mesesPeriodo of [0, 13, 6.5]) {
      const res = await request(app)
        .post("/api/calculators/cronograma")
        .send({ ...CUERPO, mesesPeriodo });

      expect(res.status).toBe(422);
    }
  });

  it("rechaza un índice que no está en el catálogo", async () => {
    const { app } = makeApp();

    // CAC quedó afuera a propósito: pedirlo tiene que ser un 422, no un 500.
    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, serie: "cac" });

    expect(res.status).toBe(422);
  });

  it("explica con un 422 cuando la fecha queda fuera de la serie", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/calculators/cronograma")
      .send({ ...CUERPO, fechaInicio: "2019-01-01" });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/rige desde/i);
  });

  it("ya no expone los endpoints viejos", async () => {
    const { app } = makeApp();

    expect((await request(app).post("/api/calculators/icl").send({})).status).toBe(404);
    expect((await request(app).post("/api/calculators/ipc").send({})).status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd backend && npx jest tests/unit/calculators.router.test.ts`
Expected: FAIL — `POST /api/calculators/cronograma` devuelve 404.

- [ ] **Step 3: Reescribir el router**

Reemplazar el contenido completo de `backend/src/modules/calculators/calculators.router.ts` por:

```ts
import { Router } from "express";
import { env } from "@/config/env";
import { validate } from "@/shared/middleware/validate";
import { publicLimiter } from "@/shared/middleware/rateLimit";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { indexProvider } from "@/shared/services/indices";
import { cronogramaSchema, type CronogramaBody } from "./calculators.schemas";
import { CalculatorsService } from "./calculators.service";
import { indicesRepository } from "./calculators.repository";

/**
 * Calculadora de actualización de alquileres del portal (`/calculadoras`).
 *
 * Abierta y sin login: es una herramienta de consulta, no toca datos de nadie y
 * no hay tenant de por medio. Lleva el rate limit público porque un cálculo
 * puede disparar la bajada de una serie entera contra el BCRA o el INDEC.
 */
export function createCalculatorsRouter(service: CalculatorsService): Router {
  const router = Router();

  router.use(publicLimiter);

  // Rango disponible y datos de catálogo de cada serie: el frontend arma la
  // botonera y acota los selectores con esto, en vez de repetir una lista de
  // índices que puede divergir de la del backend.
  router.get(
    "/indices",
    asyncHandler(async (_req, res) => {
      res.json(await service.estadoIndices());
    }),
  );

  router.post(
    "/cronograma",
    validate(cronogramaSchema),
    asyncHandler(async (req, res) => {
      res.json(await service.calcularCronograma(req.body as CronogramaBody));
    }),
  );

  return router;
}

const service = new CalculatorsService(indicesRepository, indexProvider, {
  ttlHoras: env.INDEX_TTL_HORAS,
});

// Router con el wiring por defecto (caché Prisma + series oficiales).
export const calculatorsRouter = createCalculatorsRouter(service);
```

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `cd backend && npx jest tests/unit/calculators.router.test.ts`
Expected: PASS, 9 tests.

Run: `cd backend && npm run typecheck`
Expected: sin errores.

Run: `cd backend && npm test`
Expected: toda la suite en verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/calculators/calculators.router.ts backend/tests/unit/calculators.router.test.ts
git commit -m "feat(calculators): POST /cronograma reemplaza a /icl y /ipc"
```

---

## Task 9: Contratos y cliente del frontend

**Files:**
- Modify: `frontend/src/api/schemas.ts:794-861`
- Modify: `frontend/src/api/calculators.ts`
- Test: `frontend/tests/unit/calculators.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido completo de `frontend/tests/unit/calculators.test.ts` por:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { calcularCronograma, getIndices } from '../../src/api/calculators'
import { cronogramaFormSchema } from '../../src/api/schemas'
import { ApiError } from '../../src/lib/apiError'
import { setAccessToken, setSessionExpiredHandler } from '../../src/lib/session'
import { useMockServer, type MockServer } from '../helpers/mockServer'

function serie(over: Record<string, unknown> = {}) {
  return {
    desde: '2020-07-01',
    hasta: '2026-08-05',
    sincronizadoEn: '2026-08-06T14:36:13.917Z',
    etiqueta: 'ICL',
    nombre: 'Índice para Contratos de Locación',
    organismo: 'BCRA',
    frecuencia: 'diaria',
    ...over,
  }
}

const INDICES = {
  icl: serie(),
  cer: serie({ etiqueta: 'CER', nombre: 'Coeficiente de Estabilización de Referencia' }),
  uva: serie({ etiqueta: 'UVA', nombre: 'Unidad de Valor Adquisitivo' }),
  ipc: serie({
    etiqueta: 'IPC',
    nombre: 'Índice de Precios al Consumidor',
    organismo: 'INDEC',
    frecuencia: 'mensual',
    desde: '2016-12-01',
    hasta: '2026-06-01',
  }),
  is: serie({
    etiqueta: 'IS',
    nombre: 'Índice de Salarios',
    organismo: 'INDEC',
    frecuencia: 'mensual',
    desde: '2016-10-01',
    hasta: '2026-04-01',
  }),
  ipim: serie({
    etiqueta: 'IPIM',
    nombre: 'Índice de Precios Internos al por Mayor',
    organismo: 'INDEC',
    frecuencia: 'mensual',
    desde: '2015-12-01',
    hasta: '2026-05-01',
  }),
}

const CRONOGRAMA = {
  serie: 'icl',
  sincronizadoEn: '2026-08-06T14:36:13.917Z',
  tramos: [
    { numero: 1, fecha: '2024-08-01', indice: 17.1, aumento: 0, valor: 300000 },
    { numero: 2, fecha: '2025-02-01', indice: 22.31, aumento: 0.3047, valor: 391403.51 },
    { numero: 3, fecha: '2025-08-01', indice: 26.62, aumento: 0.1932, valor: 467017.54 },
  ],
}

let server: MockServer

beforeEach(() => {
  server = useMockServer()
  // La calculadora es pública: no debe exigir sesión.
  setAccessToken(null)
  setSessionExpiredHandler(null)
})

describe('getIndices', () => {
  it('trae las seis series con su rango y sus datos de catálogo', async () => {
    server.on('get', '/calculators/indices', { status: 200, data: INDICES })

    const indices = await getIndices()

    expect(Object.keys(indices).sort()).toEqual(['cer', 'icl', 'ipc', 'ipim', 'is', 'uva'])
    expect(indices.icl.etiqueta).toBe('ICL')
    expect(indices.ipc.frecuencia).toBe('mensual')
    expect(indices.ipim.hasta).toBe('2026-05-01')
  })

  it('no manda Authorization: es una herramienta abierta', async () => {
    server.on('get', '/calculators/indices', { status: 200, data: INDICES })

    await getIndices()

    expect(server.callsTo('get', '/calculators/indices')[0].authorization).toBeUndefined()
  })
})

describe('calcularCronograma', () => {
  it('manda el body completo y devuelve los tramos', async () => {
    server.on('post', '/calculators/cronograma', { status: 200, data: CRONOGRAMA })

    const r = await calcularCronograma({
      montoInicial: 300000,
      fechaInicio: '2024-08-01',
      mesesPeriodo: 6,
      serie: 'icl',
    })

    expect(r.tramos).toHaveLength(3)
    expect(r.tramos[2].valor).toBe(467017.54)
    expect(server.callsTo('post', '/calculators/cronograma')[0].body).toEqual({
      montoInicial: 300000,
      fechaInicio: '2024-08-01',
      mesesPeriodo: 6,
      serie: 'icl',
    })
  })

  it('normaliza el 422 del backend como ApiError con su mensaje', async () => {
    server.on('post', '/calculators/cronograma', {
      status: 422,
      data: {
        error: { code: 'VALIDATION_ERROR', message: 'El ICL rige desde el 2020-07-01' },
      },
    })

    const err = await calcularCronograma({
      montoInicial: 300000,
      fechaInicio: '2019-01-01',
      mesesPeriodo: 6,
      serie: 'icl',
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toMatch(/rige desde/)
  })
})

describe('cronogramaFormSchema', () => {
  it('convierte el monto de texto a número', () => {
    const parsed = cronogramaFormSchema.parse({
      montoInicial: '300000',
      fechaInicio: '2024-08-01',
      mesesPeriodo: 6,
      serie: 'icl',
    })

    expect(parsed.montoInicial).toBe(300000)
  })

  it('rechaza un monto que no es positivo', () => {
    for (const montoInicial of ['0', '-100', 'mil', '']) {
      const r = cronogramaFormSchema.safeParse({
        montoInicial,
        fechaInicio: '2024-08-01',
        mesesPeriodo: 6,
        serie: 'icl',
      })
      expect(r.success).toBe(false)
    }
  })

  it('rechaza un período fuera del 1..12 y un índice desconocido', () => {
    expect(
      cronogramaFormSchema.safeParse({
        montoInicial: '300000',
        fechaInicio: '2024-08-01',
        mesesPeriodo: 13,
        serie: 'icl',
      }).success,
    ).toBe(false)

    expect(
      cronogramaFormSchema.safeParse({
        montoInicial: '300000',
        fechaInicio: '2024-08-01',
        mesesPeriodo: 6,
        serie: 'cac',
      }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `cd frontend && npx vitest run tests/unit/calculators.test.ts`
Expected: FAIL — `calcularCronograma` y `cronogramaFormSchema` no existen.

- [ ] **Step 3: Reescribir los schemas**

En `frontend/src/api/schemas.ts`, reemplazar el bloque de las líneas 786-861 (desde `const estadoSerieSchema` hasta `export type IpcForm`) por:

```ts
export const SERIES = ['icl', 'cer', 'uva', 'ipc', 'is', 'ipim'] as const
export type Serie = (typeof SERIES)[number]

const estadoSerieSchema = z.object({
  desde: z.string(),
  hasta: z.string(),
  /** Null si nunca se pudo bajar la serie del organismo oficial. */
  sincronizadoEn: z.string().nullable(),
  /** Lo que dice el botón. Sale del catálogo del backend, no de una lista de acá. */
  etiqueta: z.string(),
  nombre: z.string(),
  organismo: z.string(),
  frecuencia: z.enum(['diaria', 'mensual']),
})
export type EstadoSerie = z.infer<typeof estadoSerieSchema>

// Las seis se escriben una por una en vez de con z.record: así una respuesta a
// la que le falte una serie falla en la validación en lugar de dejar la
// botonera a medio dibujar.
export const indicesResponseSchema = z.object({
  icl: estadoSerieSchema,
  cer: estadoSerieSchema,
  uva: estadoSerieSchema,
  ipc: estadoSerieSchema,
  is: estadoSerieSchema,
  ipim: estadoSerieSchema,
})
export type Indices = z.infer<typeof indicesResponseSchema>

const tramoSchema = z.object({
  numero: z.number(),
  fecha: z.string(),
  indice: z.number(),
  /** Fracción, no porcentaje: 0.3047 son 30,47 %. */
  aumento: z.number(),
  valor: z.number(),
})
export type Tramo = z.infer<typeof tramoSchema>

export const cronogramaResultSchema = z.object({
  serie: z.enum(SERIES),
  tramos: z.array(tramoSchema),
  sincronizadoEn: z.string().nullable(),
})
export type CronogramaResult = z.infer<typeof cronogramaResultSchema>

// El monto llega como string desde el input y sale como number para el body.
const montoContrato = z
  .string()
  .trim()
  .min(1, 'Ingresá el monto del contrato')
  .regex(/^\d+(?:[.,]\d{1,2})?$/, 'Monto inválido: usá solo números, ej. 250000')
  .transform((v) => Number(v.replace(',', '.')))
  .refine((v) => v > 0, 'El monto tiene que ser mayor a cero')

const fechaContrato = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí una fecha')

export const cronogramaFormSchema = z.object({
  montoInicial: montoContrato,
  fechaInicio: fechaContrato,
  mesesPeriodo: z.coerce.number().int().min(1).max(12),
  serie: z.enum(SERIES),
})
export type CronogramaForm = z.infer<typeof cronogramaFormSchema>
```

Borrar además `puntoSerieSchema` y su tipo `PuntoSerie` (líneas 780-784): sus dos únicos consumidores eran `iclResultSchema` e `ipcResultSchema`, que acaban de irse.

- [ ] **Step 4: Reescribir el cliente**

Reemplazar el contenido completo de `frontend/src/api/calculators.ts` por:

```ts
import { getJson, postJson } from '../lib/api'
import {
  cronogramaResultSchema,
  indicesResponseSchema,
  type CronogramaResult,
  type Indices,
  type Serie,
} from './schemas'

/**
 * Calculadora de actualización de alquileres del portal.
 *
 * Endpoints abiertos: no llevan sesión ni tenant. Las series las publican el
 * BCRA (ICL, CER, UVA) y el INDEC (IPC, IS, IPIM), y el backend las cachea.
 */

/**
 * Rango disponible y datos de cada serie. De acá sale la botonera de índices,
 * el nombre largo que se muestra abajo y el rango que acota el selector de
 * fecha: así el frontend no repite una lista que el backend ya tiene.
 */
export function getIndices(): Promise<Indices> {
  return getJson('/calculators/indices', indicesResponseSchema)
}

export interface CronogramaInput {
  montoInicial: number
  fechaInicio: string
  mesesPeriodo: number
  serie: Serie
}

export function calcularCronograma(input: CronogramaInput): Promise<CronogramaResult> {
  return postJson('/calculators/cronograma', cronogramaResultSchema, input)
}
```

- [ ] **Step 5: Correr los tests**

Run: `cd frontend && npx vitest run tests/unit/calculators.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/calculators.ts frontend/tests/unit/calculators.test.ts
git commit -m "feat(frontend): contrato del cronograma y de las seis series"
```

---

## Task 10: Etiquetas de la calculadora

**Files:**
- Create: `frontend/src/lib/indexLabels.ts`
- Test: `frontend/tests/unit/indexLabels.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/tests/unit/indexLabels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { etiquetaTramo, mesAnterior, nombreMes } from '../../src/lib/indexLabels'

describe('etiquetaTramo', () => {
  it('nombra los períodos usuales por su nombre', () => {
    expect(etiquetaTramo(1, 3)).toBe('Mes 3')
    expect(etiquetaTramo(2, 1)).toBe('Bim. 1')
    expect(etiquetaTramo(3, 4)).toBe('Trim. 4')
    expect(etiquetaTramo(4, 2)).toBe('Cuatrim. 2')
    expect(etiquetaTramo(6, 5)).toBe('Semes. 5')
    expect(etiquetaTramo(12, 2)).toBe('Año 2')
  })

  it('cae a un genérico en las periodicidades sin nombre propio', () => {
    // 5, 7, 8, 9, 10 y 11 meses no tienen nombre en castellano.
    expect(etiquetaTramo(7, 3)).toBe('Período 3')
  })
})

describe('nombreMes', () => {
  it('da el mes en castellano de una fecha ISO', () => {
    expect(nombreMes('2026-08-01')).toBe('Agosto')
    expect(nombreMes('2026-01-15')).toBe('Enero')
  })
})

describe('mesAnterior', () => {
  it('da el mes anterior al de la fecha', () => {
    // La tarjeta HASTA muestra el mes previo al último ajuste.
    expect(mesAnterior('2026-08-01')).toBe('Julio')
    expect(mesAnterior('2026-01-20')).toBe('Diciembre')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd frontend && npx vitest run tests/unit/indexLabels.test.ts`
Expected: FAIL — no existe `src/lib/indexLabels.ts`.

- [ ] **Step 3: Escribir el módulo**

Crear `frontend/src/lib/indexLabels.ts`:

```ts
/**
 * Etiquetas en castellano de la calculadora de actualización.
 *
 * Viven acá y no en el componente por la misma razón que `propertyLabels.ts` y
 * `domainLabels.ts`: son texto de producto, se prueban solas y las puede
 * necesitar más de una pantalla.
 *
 * Cómo se llama un tramo es presentación pura y depende de la periodicidad que
 * eligió quien calcula, así que lo decide el frontend: el backend numera los
 * tramos y nada más.
 */

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** Mes en castellano de una fecha ISO. */
export function nombreMes(fechaIso: string): string {
  return MESES[Number(fechaIso.slice(5, 7)) - 1] ?? ''
}

/** Mes anterior al de una fecha ISO. Es lo que rotula la tarjeta HASTA. */
export function mesAnterior(fechaIso: string): string {
  const mes = Number(fechaIso.slice(5, 7))
  return MESES[mes === 1 ? 11 : mes - 2] ?? ''
}

const PREFIJOS: Record<number, string> = {
  1: 'Mes',
  2: 'Bim.',
  3: 'Trim.',
  4: 'Cuatrim.',
  6: 'Semes.',
  12: 'Año',
}

/** Cómo se llama el tramo N de un contrato que se ajusta cada `mesesPeriodo`. */
export function etiquetaTramo(mesesPeriodo: number, numero: number): string {
  return `${PREFIJOS[mesesPeriodo] ?? 'Período'} ${numero}`
}
```

- [ ] **Step 4: Correr el test**

Run: `cd frontend && npx vitest run tests/unit/indexLabels.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/indexLabels.ts frontend/tests/unit/indexLabels.test.ts
git commit -m "feat(frontend): etiquetas de tramo y de mes de la calculadora"
```

---

## Task 11: Componentes de la calculadora

**Files:**
- Create: `frontend/src/components/calculadora/Botonera.tsx`
- Create: `frontend/src/components/calculadora/SelectorFecha.tsx`
- Create: `frontend/src/components/calculadora/ResultadoCronograma.tsx`

No llevan test propio: son presentación sin lógica de negocio y el proyecto
prueba con Vitest en entorno `node`, sin renderizado. Lo que sí tiene lógica
—las etiquetas— quedó cubierto en la tarea 10.

- [ ] **Step 1: Escribir `Botonera.tsx`**

Crear `frontend/src/components/calculadora/Botonera.tsx`:

```tsx
interface Opcion {
  value: string
  label: string
}

interface Props {
  /** Rótulo del grupo. Se lee como `aria-label` del contenedor. */
  label: string
  options: Opcion[]
  value: string
  onChange: (value: string) => void
}

/**
 * Grupo de botones de opción única.
 *
 * Es un `radiogroup` y no un `select` a propósito: las doce periodicidades y
 * los seis índices se eligen de un vistazo, y desplegarlos escondería la opción
 * que la persona está buscando comparar.
 */
export default function Botonera({ label, options, value, onChange }: Props) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const activa = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onChange(o.value)}
              className={`min-w-[3rem] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activa
                  ? 'bg-brand text-white'
                  : 'border border-line bg-surface text-ink hover:bg-canvas'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escribir `SelectorFecha.tsx`**

Crear `frontend/src/components/calculadora/SelectorFecha.tsx`:

```tsx
import { useState } from 'react'
import Select from '../common/Select'

interface Props {
  label: string
  /** Fecha ISO (AAAA-MM-DD). */
  value: string
  onChange: (iso: string) => void
  /** Primer año elegible, tomado del rango de la serie. */
  anioDesde: number
  /** Último año elegible. */
  anioHasta: number
  error?: string
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const opcionesMes = MESES.map((label, i) => ({ value: String(i + 1), label }))

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Último día del mes: no todos tienen 31, y febrero cambia con el bisiesto. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/**
 * Mes y año de inicio del contrato, con el día escondido detrás de un enlace.
 *
 * El día casi nunca importa: en las series mensuales no cambia nada, y la
 * mayoría de los contratos arranca el 1. Pedirlo de entrada agregaría un
 * selector que el 90 % de las veces se deja como está, así que aparece solo si
 * alguien lo pide — igual que en la calculadora del Colegio.
 */
export default function SelectorFecha({
  label,
  value,
  onChange,
  anioDesde,
  anioHasta,
  error,
}: Props) {
  const [anio, mes, dia] = value.split('-').map(Number)
  const [mostrarDia, setMostrarDia] = useState(dia !== 1)

  const anios: { value: string; label: string }[] = []
  for (let a = anioHasta; a >= anioDesde; a--) anios.push({ value: String(a), label: String(a) })

  const dias = Array.from({ length: diasDelMes(anio, mes) }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }))

  function emitir(nuevoAnio: number, nuevoMes: number, nuevoDia: number) {
    // Si el día no existe en el mes destino (31 de enero → febrero), se corre
    // al último del mes en vez de emitir una fecha que no existe.
    const tope = diasDelMes(nuevoAnio, nuevoMes)
    onChange(`${nuevoAnio}-${pad(nuevoMes)}-${pad(Math.min(nuevoDia, tope))}`)
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>

      <div className={`grid gap-3 ${mostrarDia ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Select
          aria-label="Mes de inicio"
          options={opcionesMes}
          value={String(mes)}
          onChange={(e) => emitir(anio, Number(e.target.value), dia)}
        />
        <Select
          aria-label="Año de inicio"
          options={anios}
          value={String(anio)}
          onChange={(e) => emitir(Number(e.target.value), mes, dia)}
        />
        {mostrarDia && (
          <Select
            aria-label="Día de inicio"
            options={dias}
            value={String(dia)}
            onChange={(e) => emitir(anio, mes, Number(e.target.value))}
          />
        )}
      </div>

      {!mostrarDia && (
        <button
          type="button"
          onClick={() => setMostrarDia(true)}
          className="mt-1.5 text-xs text-brand hover:underline"
        >
          + Elegir día específico
        </button>
      )}

      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 3: Escribir `ResultadoCronograma.tsx`**

Crear `frontend/src/components/calculadora/ResultadoCronograma.tsx`:

```tsx
import type { CronogramaResult, EstadoSerie } from '../../api/schemas'
import { etiquetaTramo, mesAnterior, nombreMes } from '../../lib/indexLabels'
import { formatARS } from '../../lib/format'

interface Props {
  resultado: CronogramaResult
  serie: EstadoSerie
  /** Lo que se ingresó, para repetirlo bajo las tarjetas. */
  entrada: { montoInicial: number; fechaInicio: string; mesesPeriodo: number }
}

function formatPorcentaje(fraccion: number): string {
  return `${(fraccion * 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`
}

function formatFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/**
 * Resultado del cronograma: el valor vigente arriba y el detalle de cada ajuste
 * abajo.
 *
 * Las tarjetas HASTA/DESDE salen de los dos últimos tramos, no de un campo
 * aparte de la respuesta: repetir el mismo dato en dos lugares del cuerpo abre
 * la puerta a que se contradigan.
 */
export default function ResultadoCronograma({ resultado, serie, entrada }: Props) {
  const { tramos } = resultado
  const ultimo = tramos[tramos.length - 1]
  const anteultimo = tramos.length > 1 ? tramos[tramos.length - 2] : null

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {anteultimo && (
          <Tarjeta rotulo="Hasta" mes={mesAnterior(ultimo.fecha)} valor={anteultimo.valor} />
        )}
        <Tarjeta
          rotulo="Desde"
          mes={nombreMes(ultimo.fecha)}
          valor={ultimo.valor}
          destacada
        />
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Valores ingresados: {formatARS(entrada.montoInicial)} · {formatFecha(entrada.fechaInicio)}{' '}
        · cada {entrada.mesesPeriodo} {entrada.mesesPeriodo === 1 ? 'mes' : 'meses'} ·{' '}
        {serie.etiqueta}
      </p>

      {/* La tabla scrollea sola en pantallas chicas en vez de desbordar la página. */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Período
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Fecha
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {serie.etiqueta}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Aumento
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((t) => (
              <tr key={t.numero} className="border-b border-line/60">
                <td className="py-2.5 pr-3 text-muted">
                  {etiquetaTramo(entrada.mesesPeriodo, t.numero)}
                </td>
                <td className="py-2.5 pr-3">{formatFecha(t.fecha)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {t.indice.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {formatPorcentaje(t.aumento)}
                </td>
                <td className="py-2.5 text-right font-medium tabular-nums">
                  {formatARS(t.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tarjeta({
  rotulo,
  mes,
  valor,
  destacada = false,
}: {
  rotulo: string
  mes: string
  valor: number
  destacada?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-5 text-center ${
        destacada ? 'border-accent bg-accent/5' : 'border-line bg-canvas'
      }`}
    >
      <p
        className={`inline-block rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white ${
          destacada ? 'bg-accent' : 'bg-muted'
        }`}
      >
        {rotulo}
      </p>
      <p className="mt-2 text-sm text-muted">{mes}</p>
      <p className="mt-1 text-3xl font-bold text-brand">{formatARS(valor)}</p>
    </div>
  )
}
```

- [ ] **Step 4: Verificar que compilan**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: los únicos errores son de `src/pages/Calculadoras.tsx`, que todavía importa lo viejo. Ninguno en `src/components/calculadora/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/calculadora/
git commit -m "feat(frontend): botonera, selector de fecha y tabla del cronograma"
```

---

## Task 12: Pantalla de la calculadora

**Files:**
- Modify: `frontend/src/pages/Calculadoras.tsx`
- Modify: `frontend/src/components/common/Skeleton.tsx:188-211`

- [ ] **Step 1: Reescribir la pantalla**

Reemplazar el contenido completo de `frontend/src/pages/Calculadoras.tsx` por:

```tsx
import { useState } from 'react'
import { Calculator, Info } from 'lucide-react'
import { calcularCronograma, getIndices } from '../api/calculators'
import {
  SERIES,
  cronogramaFormSchema,
  type CronogramaResult,
  type Indices,
  type Serie,
} from '../api/schemas'
import Botonera from '../components/calculadora/Botonera'
import ResultadoCronograma from '../components/calculadora/ResultadoCronograma'
import SelectorFecha from '../components/calculadora/SelectorFecha'
import Button from '../components/common/Button'
import Input from '../components/common/Input'
import { ErrorState } from '../components/common/AsyncState'
import { CalculadoraSkeleton } from '../components/common/Skeleton'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { ApiError } from '../lib/apiError'

/**
 * Calculadora de actualización de alquileres (portal).
 *
 * Pide cada cuánto se actualiza el contrato, no hasta cuándo calcular, y
 * devuelve el cronograma completo de ajustes: es lo que un corredor necesita
 * para explicar cómo llegó al número, en vez de un monto suelto.
 *
 * Los índices los publican el BCRA y el INDEC; el backend los cachea y expone
 * el rango de cada serie, que es lo que acota el selector de fecha. Sin ese
 * rango no se puede dibujar el formulario: por eso la carga inicial va con
 * esqueleto y el error deja reintentar.
 *
 * El formulario no usa react-hook-form como el resto del panel: de sus cuatro
 * controles, tres son botoneras y un selector compuesto, ninguno un input
 * nativo que se pueda registrar. useState más un `safeParse` al enviar dice lo
 * mismo con menos ceremonia.
 */

const PERIODOS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}))

/** Primer día del mes de una fecha ISO. */
function primeroDelMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export default function Calculadoras() {
  const indices = useResource<Indices>(getIndices, [])

  useSeo({
    title: 'Calculadora de actualización de alquileres',
    description:
      'Calculá el cronograma de ajustes de un contrato de alquiler con los índices oficiales: ICL, IPC, CER, UVA, IS e IPIM.',
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="text-center">
        <h1 className="font-serif text-3xl text-brand md:text-4xl">Calculadora</h1>
        <p className="mt-3 text-muted">
          Actualizá el valor de un contrato de alquiler con los índices oficiales.
        </p>
      </header>

      <div className="mt-10">
        {indices.loading && <CalculadoraSkeleton />}
        {indices.error && <ErrorState error={indices.error} onRetry={indices.reload} />}
        {indices.data && <Formulario indices={indices.data} />}
      </div>
    </div>
  )
}

function Formulario({ indices }: { indices: Indices }) {
  const [serie, setSerie] = useState<Serie>('icl')
  const [monto, setMonto] = useState('')
  const [mesesPeriodo, setMesesPeriodo] = useState(12)
  const [fechaInicio, setFechaInicio] = useState(() => primeroDelMes(indices.icl.hasta))

  const [errores, setErrores] = useState<Partial<Record<string, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [resultado, setResultado] = useState<CronogramaResult | null>(null)
  const [entrada, setEntrada] = useState<{
    montoInicial: number
    fechaInicio: string
    mesesPeriodo: number
  } | null>(null)

  const estado = indices[serie]

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFailure(null)
    setErrores({})

    const parsed = cronogramaFormSchema.safeParse({
      montoInicial: monto,
      fechaInicio,
      mesesPeriodo,
      serie,
    })

    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors
      setErrores({
        montoInicial: flat.montoInicial?.[0],
        fechaInicio: flat.fechaInicio?.[0],
      })
      return
    }

    setCalculando(true)
    try {
      setResultado(await calcularCronograma(parsed.data))
      setEntrada({
        montoInicial: parsed.data.montoInicial,
        fechaInicio: parsed.data.fechaInicio,
        mesesPeriodo: parsed.data.mesesPeriodo,
      })
    } catch (err) {
      setFailure(
        err instanceof ApiError ? err.message : 'No se pudo calcular la actualización',
      )
    } finally {
      setCalculando(false)
    }
  }

  /**
   * Al cambiar de índice se acomoda la fecha al rango de la serie nueva.
   *
   * Sin esto, pasar del ICL (desde 2020) al IPIM (desde 2015) dejaría elegida
   * una fecha que la serie nueva no cubre y el primer cálculo sería un 422.
   */
  function cambiarSerie(nueva: Serie) {
    setSerie(nueva)
    setResultado(null)

    const { desde, hasta } = indices[nueva]
    if (fechaInicio < desde) setFechaInicio(primeroDelMes(desde))
    else if (fechaInicio > hasta) setFechaInicio(primeroDelMes(hasta))
  }

  if (resultado && entrada) {
    return (
      <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <ResultadoCronograma resultado={resultado} serie={estado} entrada={entrada} />

        <Button
          type="button"
          variant="secondary"
          className="mt-6 w-full"
          onClick={() => setResultado(null)}
        >
          Volver
        </Button>

        <NotaLegal estado={estado} />
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {failure && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {failure}
          </p>
        )}

        <Input
          label="Valor inicial del alquiler"
          inputMode="decimal"
          placeholder="Ej: 300000"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          error={errores.montoInicial}
        />

        <SelectorFecha
          label="Fecha de inicio de contrato"
          value={fechaInicio}
          onChange={setFechaInicio}
          anioDesde={Number(estado.desde.slice(0, 4))}
          anioHasta={Number(estado.hasta.slice(0, 4))}
          error={errores.fechaInicio}
        />

        <Botonera
          label="Cada cuánto se actualiza (meses)"
          options={PERIODOS}
          value={String(mesesPeriodo)}
          onChange={(v) => setMesesPeriodo(Number(v))}
        />

        <div>
          <Botonera
            label="Índice de actualización"
            options={SERIES.map((s) => ({ value: s, label: indices[s].etiqueta }))}
            value={serie}
            onChange={(v) => cambiarSerie(v as Serie)}
          />
          <p className="mt-1.5 text-xs text-muted">{estado.nombre}</p>
        </div>

        <Button type="submit" disabled={calculando} className="w-full">
          <Calculator className="h-4 w-4" aria-hidden />
          {calculando ? 'Calculando…' : 'Calcular'}
        </Button>
      </form>

      <NotaLegal estado={estado} />
    </section>
  )
}

/**
 * Aviso de origen del dato.
 *
 * Muestra cuándo se sincronizó la serie a propósito: si el organismo está caído
 * la calculadora sigue respondiendo con lo último que bajó, y quien la usa tiene
 * derecho a saber de cuándo es ese número antes de firmar algo.
 */
function NotaLegal({ estado }: { estado: Indices[Serie] }) {
  return (
    <div className="mt-6 flex gap-3 border-t border-line pt-5 text-xs text-muted">
      <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div className="space-y-1">
        <p>
          {estado.frecuencia === 'diaria'
            ? `El ${estado.organismo} no publica el ${estado.etiqueta} los sábados, domingos ni feriados: si la fecha de un ajuste cae en uno de esos días, se usa el último día hábil publicado.`
            : `El ${estado.organismo} publica el ${estado.etiqueta} de cada mes alrededor de dos semanas después de cerrado, así que el mes en curso todavía no está disponible.`}
        </p>
        <p>
          Herramienta orientativa: verificá el monto final contra la publicación oficial del{' '}
          {estado.organismo}.
          {estado.sincronizadoEn &&
            ` Índices actualizados el ${new Date(estado.sincronizadoEn).toLocaleString('es-AR')}.`}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ajustar el esqueleto al layout nuevo**

En `frontend/src/components/common/Skeleton.tsx`, reemplazar `CalculadoraSkeleton` (líneas 188-211) por:

```tsx
export function CalculadoraSkeleton() {
  return (
    <div role="status" aria-label="Cargando la calculadora">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
        {/* Monto y fecha */}
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={i === 0 ? '' : 'mt-5'}>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-11 w-full rounded-md" />
          </div>
        ))}

        {/* Botonera de periodicidad */}
        <div className="mt-5">
          <Skeleton className="h-3 w-52" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-12 rounded-md" />
            ))}
          </div>
        </div>

        {/* Botonera de índices */}
        <div className="mt-5">
          <Skeleton className="h-3 w-44" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-16 rounded-md" />
            ))}
          </div>
        </div>

        <Skeleton className="mt-6 h-11 w-full rounded" />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compila y que la suite pasa**

Run: `cd frontend && npm run build`
Expected: build limpio, sin errores de TypeScript.

Run: `cd frontend && npm test`
Expected: toda la suite en verde.

- [ ] **Step 4: Verificarlo a mano**

Run (en dos terminales): `cd backend && npm run dev` y `cd frontend && npm run dev`

Abrir `http://localhost:5173/calculadoras` y comprobar:
1. La botonera muestra seis índices y ninguno más.
2. Con 300000, inicio agosto 2024, cada 6 meses e ICL, la tabla trae cinco filas y el último valor ronda los $614.000.
3. Cambiar a IPC reacomoda la fecha y recalcula sin error.
4. "Volver" trae de vuelta el formulario con lo que se había cargado.

Con `INDEX_PROVIDER=fake` en `backend/.env` los números son inventados pero la pantalla se ejercita igual; para el punto 2 hace falta `INDEX_PROVIDER=oficial`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Calculadoras.tsx frontend/src/components/common/Skeleton.tsx
git commit -m "feat(frontend): pantalla de cronograma con seis indices"
```

---

## Task 13: Limpieza y documentación

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Verificar que no quedó nada huérfano**

Run: `cd backend && npx tsc --noEmit && npm run lint`
Expected: sin errores ni warnings de variables sin uso.

Run: `cd frontend && npm run build`
Expected: build limpio.

Buscar referencias sobrevivientes a lo borrado:

Run: `git grep -n "calcularIcl\|calcularIpc\|iclSchema\|ipcSchema\|iclFormSchema\|ipcFormSchema\|mesesEntre\|iclResultSchema\|ipcResultSchema" -- backend/src frontend/src backend/tests frontend/tests`
Expected: sin resultados. Si aparece alguno, borrar esa referencia.

- [ ] **Step 2: Actualizar CLAUDE.md**

En `CLAUDE.md`, reemplazar el párrafo que empieza con "**`calculators` es la segunda excepción a `BaseRepository`**" por:

```markdown
- **`calculators` es la segunda excepción a `BaseRepository`, y por el motivo contrario a `public`**: sus dos tablas (`index_values`, `index_syncs`) no tienen `tenant_id` porque cachean seis series públicas nacionales sin dueño. En `public` había que reemplazar el aislamiento por el filtro de visibilidad; acá no hay nada que reemplazar, porque no hay ningún dato privado en juego. Los endpoints (`/api/calculators`) son abiertos por la misma razón.
- La calculadora **no pregunta hasta cuándo calcular, pregunta cada cuánto se actualiza el contrato** (`POST /api/calculators/cronograma`) y devuelve el cronograma completo de ajustes. Cada tramo se calcula contra el índice inicial —`monto × idx[n] / idx[0]`— y no contra el valor del tramo anterior: encadenar montos ya redondeados a centavos acumula el error. El cronograma corta en el último tramo con índice publicado; un tramo futuro no se emite.
- **Qué series existen lo dice `shared/services/indices/catalogo.ts` y nada más**: etiqueta, organismo, frecuencia y de dónde se baja. Son seis: ICL (BCRA var 40), CER (var 30) y UVA (var 31), diarias; IPC, IS e IPIM del INDEC vía `apis.datos.gob.ar`, mensuales. Sumar una serie es una fila del catálogo, no un `if` en el provider.
- Quedaron afuera a propósito **CAC** y **CasaPropia**: no publican API, solo una planilla mensual, y una serie que alguien tiene que cargar a mano devuelve un número viejo sin avisar. También quedó afuera el envío del resultado por correo.
- **La frecuencia de la serie decide qué índice usa cada tramo.** Diarias: el último día hábil publicado en o antes de la fecha, porque el BCRA no publica sábados, domingos ni feriados. Mensuales: el índice del **mes anterior**, porque el índice de un mes mide el nivel de precios de ese mes y un alquiler que arranca en julio se pactó con los precios de junio. Ojo con las diarias: `valorVigente` devuelve el último dato para cualquier fecha futura, así que `indiceParaTramo` corta explícitamente pasada la última publicación — sin ese corte el cronograma inventa ajustes que el organismo no publicó.
```

Reemplazar también el párrafo "**El IPC se encadena por cociente de índices...**" por:

```markdown
- **Las series mensuales se encadenan por cociente de índices, no multiplicando las variaciones publicadas.** Las variaciones vienen redondeadas y doce redondeos seguidos corren el resultado. El índice da el número exacto en una división.
```

Y en la lista de módulos construidos, dejar `calculators` como está (el nombre no cambió).

- [ ] **Step 3: Correr todo de punta a punta**

Run: `cd backend && npm run typecheck && npm run lint && npm test`
Expected: todo en verde.

Run: `cd frontend && npm run build && npm test`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: la calculadora ahora devuelve el cronograma sobre seis series"
```

---

## Notas de verificación

- **El vector de la tarea 5 es el contrato con el cliente.** Sale de una corrida real de la calculadora que usa el Colegio de Corredores de Entre Ríos. Si esos cinco montos dejan de dar, el cálculo cambió: no ajustar el test para que pase.
- **`INDEX_PROVIDER=fake` no verifica nada contra los organismos.** Para probar contra datos reales hace falta `INDEX_PROVIDER=oficial` y salida a internet. El primer cálculo de cada serie tarda unos segundos porque baja la serie entera.
- **Backend y frontend salen en el mismo deploy.** `POST /calculators/icl` y `POST /calculators/ipc` desaparecen y `GET /calculators/indices` cambia de forma: un frontend viejo contra el backend nuevo rompe la pantalla de la calculadora.
