# Calculadora de actualización de alquileres — cronograma por período

Fecha: 2026-08-06
Estado: aprobado, pendiente de plan de implementación

## Problema

La calculadora que hay hoy (`/calculadoras`) pide dos fechas y devuelve **un**
monto. El cliente quiere la que usa el Colegio de Corredores Públicos
Inmobiliarios de Entre Ríos en `colegiocorredoreser.org.ar/servicios/`, que es un
widget de ARquiler.com embebido en un iframe.

Esa calculadora no pregunta "hasta cuándo": pregunta **cada cuánto se actualiza
el contrato** y devuelve el **cronograma completo** de ajustes desde el inicio
hasta hoy. Es lo que un corredor necesita para explicarle a un inquilino cómo
llegó al número, no un monto suelto.

## Referencia capturada

Corrida real contra el widget (300.000 · inicio 1/8/2024 · 6 meses · ICL):

| Tramo | Fecha | ICL | Aumento | Valor |
|---|---|---|---|---|
| Semes. 1 | 2024-08-01 | 17,10 | 0 % | $ 300.000 |
| Semes. 2 | 2025-02-01 | 22,31 | 30,47 % | $ 391.404 |
| Semes. 3 | 2025-08-01 | 26,62 | 19,32 % | $ 467.018 |
| Semes. 4 | 2026-02-01 | 30,03 | 12,81 % | $ 526.842 |
| Semes. 5 | 2026-08-01 | 35,01 | 16,58 % | $ 614.211 |

Encabezado del resultado: dos tarjetas, `HASTA Julio $ 526.842` y
`DESDE Agosto $ 614.211`, más una línea con los valores ingresados
(`300.000 · 1/8/2024 · 6 meses · ICL`) y un botón `VOLVER`.

Esta tabla es el vector de prueba del cálculo. Ver "Fórmula".

## Alcance

### Índices

Ocho botones en el original. Seis tienen API pública y entran; dos no y quedan
afuera:

| Índice | Fuente | id |
|---|---|---|
| ICL | BCRA `estadisticas/v4.0/monetarias` | variable 40 |
| CER | BCRA `estadisticas/v4.0/monetarias` | variable 30 |
| UVA | BCRA `estadisticas/v4.0/monetarias` | variable 31 |
| IPC | `apis.datos.gob.ar/series` | `148.3_INIVELNAL_DICI_M_26` |
| IS (Índice de Salarios) | `apis.datos.gob.ar/series` | `149.1_TL_INDIIOS_OCTU_0_21` |
| IPIM | `apis.datos.gob.ar/series` | `448.1_NIVEL_GENERAL_0_0_13_46` |

**CAC** (Cámara Argentina de la Construcción) y **CasaPropia** (coeficiente CVS)
quedan afuera: no publican API, solo PDF/planilla mensual. Cargarlas a mano
significa que una serie desactualizada devuelve un número viejo sin que nadie se
entere, y scrapear la publicación se rompe con cualquier cambio de formato. Es la
misma decisión que el proyecto ya había tomado con CasaPropia.

Sus botones no se muestran. No hay estado "próximamente".

### Fuera de alcance

- Envío del resultado por correo.
- Guardar cálculos o asociarlos a una propiedad o a un tenant.
- Elegir la fecha final: el cronograma corre siempre hasta el último ajuste con
  índice publicado, como el original.

## Diseño

### 1. Series — `backend/src/shared/services/indices/`

`Serie` pasa de `"icl" | "ipc"` a los seis valores. La metadata de cada una vive
en un único catálogo, porque hoy está repartida entre el provider (de dónde se
baja), el service (mensaje de error) y el frontend (etiqueta):

```ts
export type Serie = "icl" | "cer" | "uva" | "ipc" | "is" | "ipim";

export type Frecuencia = "diaria" | "mensual";

export interface Descriptor {
  etiqueta: string;      // "ICL"      — el botón
  nombre: string;        // "Índice para Contratos de Locación"
  organismo: string;     // "BCRA"     — el aviso legal
  frecuencia: Frecuencia;
  fuente: { tipo: "bcra"; idVariable: number } | { tipo: "datosGob"; idSerie: string };
}

export const CATALOGO: Record<Serie, Descriptor>;
export const SERIES: readonly Serie[];
```

`OficialIndexProvider` deja de ramificar por serie con un `if`. Queda con dos
métodos privados —`bcra(idVariable)` (paginado con `offset`, ya escrito) y
`datosGob(idSerie)`— y `obtener(serie)` despacha por `CATALOGO[serie].fuente`.
Sumar una serie nueva pasa a ser una fila del catálogo.

Las dos trampas ya documentadas de la fuente se mantienen: el BCRA devuelve
`results` como **array** de variables aunque se pida una sola, y pagina de a 1000
puntos; datos.gob.ar puede traer los últimos meses con `valor: null`.

`FakeIndexProvider` inventa las seis, con la forma correcta según la frecuencia:
un punto por día hábil para las diarias, uno por mes para las mensuales.

**Base de datos: sin migración.** `index_values.serie` ya es `VarChar(10)` con PK
`(serie, fecha)` y `index_syncs.serie` es la clave. Las seis entran en las tablas
que hay. El TTL, el single-flight y el "responder con la caché si el organismo
está caído" ya son por serie.

### 2. Cálculo — `POST /api/calculators/cronograma`

Reemplaza a `POST /calculators/icl` y `POST /calculators/ipc`, que se borran.

```
{ montoInicial: number, fechaInicio: "AAAA-MM-DD", mesesPeriodo: 1..12, serie: Serie }
```

Devuelve:

```ts
{
  serie: Serie,
  tramos: Array<{
    numero: number,      // 1-based
    fecha: string,       // ISO, la fecha del ajuste
    indice: number,      // el valor del índice usado
    aumento: number,     // fracción respecto del tramo anterior; 0 en el primero
    valor: number,       // el alquiler a partir de esa fecha
  }>,
  vigente: {
    // null cuando solo hay un tramo: el contrato todavía no se ajustó nunca
    hasta: { mes: string, anio: number, valor: number } | null,
    desde: { mes: string, anio: number, valor: number },
  },
  sincronizadoEn: string | null,
}
```

**Generación de tramos.** Tramo *n* cae en `fechaInicio + n · mesesPeriodo`
meses. Si el día del mes no existe en el mes destino (31 de enero + 1 mes), se
usa el último día de ese mes. Se emiten tramos mientras haya índice publicado
para su fecha; el primero que no lo tenga corta la serie. Tope duro de 240
tramos, que con las series más viejas (IPC desde 2016) no se alcanza nunca y
está solo para que una fecha disparatada no deje el proceso girando.

**Qué índice usa cada tramo**, según la frecuencia de la serie:

- **Diarias** (ICL, CER, UVA): `valorVigente()` — el último publicado en o antes
  de la fecha. El BCRA no publica sábados, domingos ni feriados: pedir el índice
  de un domingo tiene que devolver el del viernes, no un error. Ya está escrito.
- **Mensuales** (IPC, IS, IPIM): el índice del **mes anterior** al del tramo. Un
  alquiler que arranca en julio se pactó con los precios de junio, y el índice de
  un mes mide el nivel de precios de ese mes. Es la regla que el proyecto ya
  documenta para el IPC; acá se aplica a los dos extremos del cociente, así que
  el corrimiento es consistente y no introduce sesgo.

**Fórmula.** Cada tramo se calcula contra el índice **inicial**, no contra el
valor del tramo anterior:

```
valor[n]   = montoInicial × indice[n] / indice[0]
aumento[n] = indice[n] / indice[n-1] − 1        (aumento[0] = 0)
```

Arrastrar el valor anterior acumularía el redondeo a centavos de cada tramo. El
cociente contra el índice inicial da el mismo número que el original —verificado
contra la corrida capturada, los cuatro valores coinciden al peso— y no depende
de cuántos tramos haya en el medio.

**`vigente`** sale de los dos últimos tramos: `desde` es el mes y el valor del
último, `hasta` es el mes anterior a ese y el valor del anteúltimo. Con un solo
tramo, `hasta` es null.

**Errores.** `422` si `fechaInicio` es anterior al primer dato de la serie
elegida (con el mensaje que diga desde cuándo rige ese índice) o si es posterior
al último publicado. `503` solo si no hay absolutamente nada cacheado para esa
serie, igual que hoy.

Los tramos llevan `numero`, no una etiqueta armada: `Semes. 3` es presentación y
se arma en el frontend, que es quien sabe la periodicidad elegida. El backend no
tiene por qué opinar sobre cómo se llama un tramo.

`GET /api/calculators/indices` sigue existiendo y ahora devuelve las seis series
—`{ icl: { desde, hasta, sincronizadoEn, etiqueta, nombre, organismo, frecuencia }, cer: {...}, ... }`—
para que la botonera, el nombre largo y el aviso legal del frontend salgan del
catálogo del backend y no de una lista duplicada que puede divergir.

### 3. Pantalla — `frontend/src/pages/Calculadoras.tsx`

Un solo formulario, sin solapas:

1. **Valor inicial del alquiler** — texto con `inputMode="decimal"`.
2. **Fecha de inicio de contrato** — selector de mes y año, con un enlace
   "elegir día específico" que despliega el día. Por defecto el día 1: para las
   series mensuales el día no cambia nada, y para las diarias la mayoría de los
   contratos arranca a principio de mes.
3. **Cada cuánto se actualiza (meses)** — botonera 1 a 12.
4. **Índice de actualización** — botonera de seis, con el nombre largo del índice
   seleccionado debajo.
5. **CALCULAR**.

El resultado reemplaza al formulario en la misma tarjeta: las dos tarjetas
HASTA/DESDE, la línea de valores ingresados, la tabla y un botón **VOLVER** que
devuelve el formulario con lo que se había cargado.

Encabezado de la columna del índice = la etiqueta de la serie elegida (`ICL`,
`IPC`, …), como en el original.

Etiqueta de cada tramo según la periodicidad: 1 → `Mes N`, 2 → `Bim. N`,
3 → `Trim. N`, 4 → `Cuatrim. N`, 6 → `Semes. N`, 12 → `Año N`, el resto →
`Período N`.

Estilo con los tokens del proyecto (`--brand` teal, `--accent` amber, Poppins),
no el violeta del original. Los rangos de fecha del selector salen del `desde` /
`hasta` de la serie elegida y se recalculan al cambiar de índice. Carga inicial
con `CalculadoraSkeleton`, error con `ErrorState` y reintento — sin el rango de
las series no se puede dibujar el formulario.

Se mantiene el aviso al pie: herramienta orientativa, contrastar contra la
publicación oficial del organismo, y de cuándo es el dato (`sincronizadoEn`). Con
seis series el organismo del aviso sale del catálogo, no de una constante.

La tabla scrollea horizontalmente en pantallas chicas en vez de desbordar.

### 4. Qué se borra

Nada queda huérfano:

- backend: `iclSchema`, `ipcSchema`, `calcularIcl`, `calcularIpc` (en
  `calculators.math.ts` y en `calculators.service.ts`), `mesesEntre`, y las rutas
  `POST /icl` y `POST /ipc`.
- frontend: `calcularIcl` / `calcularIpc` de `api/calculators.ts`;
  `iclResultSchema`, `ipcResultSchema`, `iclFormSchema`, `ipcFormSchema` y sus
  tipos de `api/schemas.ts`; los componentes `FormularioIcl` y `FormularioIpc`.
- tests que cubrían esos caminos.

`valorVigente()` se conserva: es lo que resuelve el fin de semana en las series
diarias.

## Testing

- **`calculators.math.test.ts`** — vector de la corrida capturada: 300.000,
  inicio 2024-08-01, 6 meses, índices 17,10 / 22,31 / 26,62 / 30,03 / 35,01 →
  391.404 · 467.018 · 526.842 · 614.211 y aumentos 30,47 / 19,32 / 12,81 /
  16,58 %. Más: tramo único (sin `hasta`), corte cuando falta el índice del
  siguiente tramo, 31 de enero + 1 mes, y que el valor no dependa de la
  periodicidad (mismo monto a la misma fecha con 1 y con 12 meses cuando el
  índice coincide).
- **`calculators.service.test.ts`** — elección del índice por frecuencia (día
  hábil anterior en las diarias, mes anterior en las mensuales), 422 de fecha
  fuera de rango, 503 sin caché, y que un fallo del organismo con caché presente
  siga respondiendo.
- **`calculators.router.test.ts`** — service falso por la factory: validación del
  body (`mesesPeriodo` fuera de 1..12, serie desconocida, monto negativo) y forma
  de la respuesta.
- **`indices.provider.test.ts`** — `fetch` falso: las dos formas de respuesta
  (BCRA paginado con `results` como array; datos.gob.ar con `null` al final) y
  que las seis series peguen a la URL que les corresponde según el catálogo.
- **`frontend/tests/unit/calculators.test.ts`** — con el adapter falso de axios:
  el cronograma se pide con el body correcto, la tabla se arma con las etiquetas
  de tramo de cada periodicidad, y un 422 del backend se muestra sin romper la
  pantalla.

## Riesgos

- **Cambio de contrato de API sin versionar.** `/icl` y `/ipc` desaparecen y
  `/indices` cambia de forma. Los consume solo nuestro frontend, que se despliega
  junto: aceptable, pero backend y frontend tienen que salir en el mismo deploy.
- **Cuatro series nuevas contra dos organismos.** El primer cálculo de una serie
  fría baja la serie entera. Con seis series el arranque en frío es más pesado;
  lo amortigua el TTL y el single-flight que ya existen, y cada serie se baja
  solo cuando alguien la elige.
- **`is` como nombre de serie.** Es la etiqueta oficial del Índice de Salarios,
  pero es también una palabra reservada en varios contextos. Se usa siempre como
  string literal, nunca como identificador.
