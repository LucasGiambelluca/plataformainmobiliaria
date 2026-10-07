# Gate de producción — Plataforma Inmobiliaria Multitenant

---

# Revisión 2026-10-07 — ¿Cobra la suscripción? ¿Publican las inmobiliarias?

**Rama:** `fase-5-testing` con los cambios sin commitear del 2026-10-02.
**Foco:** los dos flujos de negocio de punta a punta, no la higiene general (eso
es la revisión de abajo).

> **Actualización 2026-10-07 (misma fecha, después del gate):** C1, C2, C3, H1,
> H2, H3, N1 y N2 quedaron **cerrados en código** según
> `docs/superpowers/plans/2026-10-07-cobro-recurrente.md`, con 651 tests verdes
> (555 unitarios + 96 de integración contra Postgres). El test de C3 se validó
> rompiendo la regla a propósito: falla sin ella. **Sigue faltando H4**: nada de
> esto se probó todavía contra MercadoPago sandbox, y eso es lo que separa
> "cerrado en código" de "puede cobrar".

## 🔴 VEREDICTO: NO LISTO PARA COBRAR — SÍ PARA PUBLICAR

| Flujo | Estado |
|---|---|
| Inmobiliaria publica y el público ve | ✅ Funciona de punta a punta (con 🟠 de alcance) |
| Cobrar el **primer** mes por MercadoPago | ⚠️ Probablemente funciona, nunca probado en sandbox |
| Cobrar **todos los meses** y cortar al que no paga | ❌ No funciona |

| Severidad | Nuevos abiertos |
|---|---|
| 🔴 Bloqueante | **3** (todos de cobro) |
| 🟠 Alto | 8 |
| 🟡 Medio | 9 |

**Checks corridos hoy:** backend `tsc` ✅, 531/531 unitarios ✅; frontend `tsc -b` ✅,
114/114 ✅. **Integración no corrió**: el puerto 5432 lo ocupa otro PostgreSQL
(`C:\Program Files\PostgreSQL\16\bin\postgres.exe`, PID 4884) — la instalación
que CLAUDE.md describe como huérfana "sin binarios" hoy tiene binarios y está
corriendo. No se tocó.

### 🔴 C1 — Los débitos de los meses 2+ no tienen camino garantizado — ✅ CERRADO EN CÓDIGO
`backend/src/shared/services/payments/mercadopago.provider.ts:114-152`

Con `preapproval`, cada débito mensual MercadoPago lo notifica como
`subscription_authorized_payment`. `fetchEvent` solo reconoce `payment`,
`preapproval` y `subscription_preapproval`; el resto cae en "tema no manejado" y
el webhook responde 200 sin hacer nada. Que el mes 2 se registre depende de que
además llegue un `payment` con `external_reference` o `metadata.preapproval_id`
— no está verificado. Escenario: se debita el mes 2, no hay fila `payments`,
`currentPeriodEnd` no se mueve, el MRR del admin no lo ve.
**Fix:** manejar `subscription_authorized_payment` vía
`GET /authorized_payments/{id}` (trae `preapproval_id`, `payment.id`, estado).

### 🔴 C2 — Cambiar de plan deja dos débitos automáticos vivos — ✅ CERRADO EN CÓDIGO
`backend/src/modules/billing/billing.service.ts:114-151` · `billing.repository.ts` (`setPendingPlan`)

`createCheckout` crea un preapproval nuevo y pisa `externalRef` sin cancelar el
anterior. Pro → Enterprise = dos débitos mensuales en la tarjeta del cliente.
Peor: abrir el checkout de Enterprise y abandonarlo deja `externalRef` apuntando
al abandonado, así que "Cancelar suscripción" cancela ese y **Pro sigue
debitando**. Y como los dos preapprovals comparten `external_reference`
(= `subscription.id`), un evento del viejo (p. ej. su cancelación) pisa el
estado de la suscripción nueva.
**Fix:** guardar el preapproval pendiente aparte del vigente; al aprobarse el
nuevo, cancelar el viejo; ignorar eventos de un preapproval que ya no es el
vigente ni el pendiente.

### 🔴 C3 — Dejar de pagar no tiene ninguna consecuencia — ✅ CERRADO EN CÓDIGO
`subscriptions.repository.ts:51-66` (`getPlanLimits`) · `public.repository.ts:21-24`

Ningún código fuera de tasaciones (`appraisals.repository.ts:34`) lee
`Subscription.status` ni `currentPeriodEnd`. Una inmobiliaria `past_due` o
`canceled` conserva el plan pago, sus cupos y su web para siempre. Lo único que
corta es que el super admin la suspenda a mano. Cancelar
(`subscriptions.service.ts:48-58`) tampoco baja el plan.
**Fix:** evaluación perezosa (sin scheduler, mismo criterio que índices):
`currentPeriodEnd` + gracia vencida → plan gratuito (o suspensión), aplicado en
`getPlanLimits` y en la visibilidad pública.

### 🟠 Altos

| | Hallazgo | Evidencia |
|---|---|---|
| H1 ✅ | El plan se concede con el preapproval `authorized`, antes de que entre plata. Si el primer débito se rechaza, nada lo revierte | `mercadopago.provider.ts:25`, `billing.service.ts:244-246` |
| H2 ✅ | Con `past_due`/`canceled` no se puede reactivar el mismo plan: "Ya estás suscripto a ese plan" y botón deshabilitado | `billing.service.ts:128-130`, `Suscripcion.tsx` |
| H3 ✅ | Un preapproval recién creado está `pending` → `past_due`: abrir un checkout y abandonarlo puede marcar morosa a una inmobiliaria al día (si MP notifica la creación — a verificar) | `billing.service.ts:77` |
| H4 (código ✅: `status: "pending"`; falta sandbox) | Nunca se hizo un cobro de punta a punta en sandbox. Dudas sobre el body: falta `status: "pending"`; `notification_url` no es campo documentado de `/preapproval` (configurar el webhook en el panel de MP); `payer_email` tiene que ser usuario de prueba en sandbox | `mercadopago.provider.ts:49-63` |
| H5 ✅ | Buscador y web de la inmobiliaria muestran máximo 24 propiedades, sin paginación. El encabezado dice "40" y se ven 24 | `SearchResults.tsx:71`, `AgencySite.tsx:57` |
| H6 ✅ (`Plan.maxFeatured`: Básico 0, Pro 5, Enterprise 20) | Destacar no tiene límite de plan: un plan Básico destaca toda la cartera y ocupa el lugar que paga el plan superior | `properties.service.ts:128-133`, `schema.prisma` (`Plan`) |
| H7 ✅ (0 en producción) | `npm audit` backend: `proxy-addr` **crítica** (IP spoofing con subnet IPv4-mapped). Mitigada en la práctica porque `trust proxy` es `1` (conteo de saltos, no subnet), pero se arregla con `npm audit fix` | `app.ts:16` |
| H8 ✅ axios / ⚠️ react-router | `npm audit` frontend: `axios` **alta** (12 advisories, la mayoría del adaptador Node; impacto bajo en navegador) + `react-router` moderada (ya era A8) | `frontend/package.json` |

### 🟡 Medios

| | Hallazgo | Evidencia |
|---|---|---|
| N1 ✅ | Cada notificación de preapproval `authorized` reenvía "pago confirmado", audita `payment.received` y reinicia el período a +30 días (no trae `externalPaymentId`, así que siempre "aporta") | `billing.service.ts:221` |
| N2 ✅ | `in_process` → `past_due`; un `refunded` → `canceled` | `billing.service.ts:75-81` |
| N3 | En `/m2props`, `FRONTEND_URL` no lleva el prefijo: `back_url` de MP y links de los correos caen fuera de la SPA. Además ahí corre `PAYMENT_PROVIDER=fake` | `deploy/m2props/env.example:15`, `billing.router.ts:97` |
| N4 | No hay trial: el alta nace `active` en Básico $0; `trialing` no se usa. Bajar a gratuito solo lo puede hacer el super admin, y eso no cancela el preapproval | `tenants.repository.ts:52-60`, `billing.service.ts:125` |
| N5 ✅ | Web por subdominio/dominio propio: el primer `getCatalog` sale sin `agencySlug`, puede mostrar por un instante propiedades de otras inmobiliarias (a verificar en navegador) | `AgencySite.tsx:49,266` |
| N6 | Editar no puede vaciar un campo opcional (descripción, dirección, m²): `toPayload` descarta vacíos | `frontend/src/api/properties.ts:41-65` |
| N7 | Validación front ≠ back: piso (subsuelo imposible), año, topes de características; el 422 sale como error genérico | `schemas.ts:739,769`, `properties.schemas.ts:60` |
| N8 | Fotos `failed`/`processing` colgadas siguen sumando al cupo de storage, sin limpieza ni forma de descartarlas en la UI | `media.service.ts:209`, `MediaUploader.tsx:139` |
| N9 | 402 de cupo sin link a `/panel/suscripcion`; footer/redes con `href="#"`, sin ruta 404 (pantalla en blanco), ficha desde dominio propio abre con layout del portal | `PropertyForm.tsx:89`, `Footer.tsx`, `App.tsx` |

### Lo que funciona (verificado en código)

- **Publicar:** formulario ↔ schema Zod alineados (precio decimal string, moneda,
  enums, `city` desde `/api/public/localidades`). Fotos por URL firmada con
  `content-type` firmado, confirm contra `head()`, portada, reorden, borrado.
  Transiciones `draft→published→featured/paused` validadas. Catálogo, ficha,
  sitemap y ciudades con el filtro `visibilidad` en todas las queries. Consultas
  públicas con `tenantId` desde la propiedad, honeypot y rate limit, llegan a
  `/panel/leads`. Suspender una inmobiliaria la saca de todo lo público.
  `LimitService` aplicado a propiedades, usuarios, storage y dominios.
- **Cobrar (lo que está bien):** alta con tenant + admin + suscripción en una
  transacción. Firma HMAC correcta y antes de todo; estado consultado a MP.
  `pendingPlanId` en vez de `planId` al abrir checkout. Webhook transaccional e
  idempotente por `external_payment_id` único. Credenciales cifradas en base;
  sin credenciales el webhook se rechaza.

> **Etapa 2 (2026-10-07):** paginación en buscador y web de la inmobiliaria con
> la página en la URL; cupo de destacadas por plan, controlado en los dos caminos
> que cambian el estado; `npm audit fix` en backend (0 vulnerabilidades de
> producción) y axios 1.20 en frontend. **Queda `react-router` moderada**: el fix
> solo existe en v7. No es explotable acá: el único `navigate` a una ruta
> variable usa `location.state.from`, que arma `RequireAuth` y no viene de la
> URL, y la parte de SSR no aplica. Migrar a v7 queda como deuda.
> N5 se cerró de paso: la web por host no pide el catálogo hasta saber de qué
> inmobiliaria es. 657 tests de backend (con integración) y 114 de frontend.

### Camino a "puede cobrar"

1. **C1** — procesar `subscription_authorized_payment`.
2. **C2** — un solo preapproval vivo: cancelar el anterior al aprobarse el nuevo.
3. **C3** — vencimiento perezoso con gracia → plan gratuito / suspensión.
4. **H1–H3** — plan solo con pago aprobado; permitir reactivar; no degradar por checkout abandonado.
5. **H4** — un ciclo completo en sandbox: alta → checkout → débito → **segundo débito** (MP permite acelerarlo en sandbox) → rechazo → cancelación. Recién ahí `PAYMENT_PROVIDER=mercadopago`.
6. `npm audit fix` en los dos paquetes (H7, H8) y paginación del catálogo (H5).

---

# Revisión anterior (2026-10-02) — rúbrica completa

**Fecha:** 2026-08-06 · **Última revisión:** 2026-10-02
**Rama:** `fase-5-testing` · commit `1dfcc19` (sin los cambios posteriores)
**Alcance:** rúbrica completa de 8 categorías, verificada contra el código.

> **Nota de mantenimiento (2026-10-02):** la plataforma se desplegó en
> producción el 2026-10-02 en `https://hernandezyasociados.com.ar/m2props`
> (VPS con nginx nativo, sin Docker ni Caddy — ver `deploy/m2props/README.md`).
> Desde entonces **los dos bloqueantes están cerrados**: B1 (pago duplicado, con
> test de concurrencia) y B2 (backup con restore verificado y timers). Lo que
> sigue impediendo facturar es configuración, no código: `PAYMENT_PROVIDER` y
> `EMAIL_PROVIDER` están en `fake` y `payment_settings` está vacía.

---

# 🔴 VEREDICTO: SIN BLOQUEANTES TÉCNICOS, AÚN NO LISTO PARA FACTURAR

| Severidad | Abiertos |
|---|---|
| 🔴 Bloqueante | **0** (B1 y B2 cerrados el 2026-10-02) |
| 🟠 Alto | 8 |
| 🟡 Medio | 7 |
| ⚪ Bajo | 2 |

Los dos bloqueantes están cerrados. Lo que impide facturar ya no es una
falla técnica sino configuración: **la pasarela y el correo están en `fake`**,
que se resuelve en `/admin/pagos` y en una variable de entorno. Los 8 altos
siguen abiertos y los medios y bajos pueden quedar como deuda documentada.

Vale decirlo con todas las letras: **el código de producto está sólido.** Las
dos cosas que bloquean no son features faltantes, son un agujero de
concurrencia en el registro de pagos y el hecho de que nada del deploy corrió
nunca. Ninguna se arregla escribiendo pantallas.

---

## 🔴 Bloqueantes

## B1 — Un pago puede registrarse dos veces — ✅ CERRADO 2026-10-02

`backend/prisma/schema.prisma:186` · `backend/src/modules/billing/billing.repository.ts:138` · `billing.service.ts:172`

> **Estado:** cerrado y verificado. Migración `20261002190000_unico_external_payment_id`
> aplicada en producción. El test de concurrencia se validó **revirtiendo el fix
> a propósito**: falla sin él y pasa con él.

`Payment.externalPaymentId` era `String?` **sin `@unique`**, y `upsertPayment`
resolvía la idempotencia con un *check-then-insert* fuera de transacción:

```ts
const existente = await prisma.payment.findFirst({
  where: { externalPaymentId: data.externalPaymentId },
});
if (existente) { /* update */ return; }
await prisma.payment.create({ ... });
```

Dos entregas concurrentes del mismo webhook —Mercado Pago reintenta, y no
espera a que la anterior termine— pasan las dos por el `findFirst`, las dos no
encuentran nada, y las dos insertan. El resultado son dos filas `payments` para
un solo cobro: los ingresos y el MRR del panel del super admin quedan
inflados, y `payment.received` se audita y se notifica dos veces.

No duplica el **cargo** —eso lo controla la pasarela— pero sí el **registro**, y
en una plataforma que factura eso es igual de grave: no hay forma de distinguir
después un cobro genuinamente duplicado de uno anotado dos veces.

El propio repo ya tenía el patrón correcto documentado para otro caso. En
`schema.prisma:198-202`, sobre `User.email`:

> *"El chequeo previo de los servicios da el 409 lindo; **esta restricción es la
> que cierra la carrera**."*

Acá faltaba justo la restricción que cierra la carrera.

### Cómo se cerró

1. **`@unique` en `externalPaymentId`**, nullable a propósito: PostgreSQL no
   cuenta los NULL como duplicados entre sí, así que los pagos que todavía no
   pasaron por la pasarela conviven. La migración deduplica antes de indexar,
   conservando la fila más antigua de cada id.
2. **`upsertPayment` devuelve `{ created, changed }`** y captura el P2002 como
   "ya estaba registrado": relee la fila ganadora y devuelve `changed` según el
   estado real. Solo una de las dos entregas concurrentes gana el índice.
3. **El servicio solo notifica y audita si esta entrega aportó algo.** Esto no
   estaba en el cierre original y sin él el arreglo quedaba a medias: la fila
   duplicada la tapaba la base, pero el correo de "pago confirmado" a la
   inmobiliaria lo tenía que tapar el código, y era el efecto más visible.
4. **Tests.** 5 unitarios para el servicio (reentrega del mismo estado no
   avisa; `pending → approved` sí avisa, porque la plata entró recién ahí) y 3
   de integración: 8 entregas simultáneas dejan **una** fila; pagos distintos
   simultáneos se registran **todos**; y el índice existe en `pg_indexes` y se
   comporta como único. Este último es el que se entera si alguien saca el
   `@unique` del schema aunque el servicio conserve el chequeo previo.

**Lo que aprendió la verificación:** la corrección tiene dos capas y cada una
cubre un síntoma distinto. Con `@unique` pero sin manejar el P2002, el bug de
"fila duplicada" se convierte en "500 y tormenta de reintentos" de la pasarela.
El test de concurrencia detectó exactamente eso, que es el motivo por el que el
fix no es solo el índice.

### B2 — Nunca se probó un backup, ni un deploy — ✅ CERRADO 2026-10-02

`deploy/m2props/backup.sh` · `deploy/m2props/restaurar.sh` · `deploy/m2props/README.md`

> **Estado:** cerrado. Backup diario y **restore verificado**, no solo escrito.
> Probado a mano el 2026-10-02 y automatizado en `m2props-restore-test.timer`.

El procedimiento de backup ya estaba escrito y era correcto, pero nunca se
ejecutó, y menos se restauró. Tampoco corrió nunca el `docker-compose.prod.yml`.

**Qué se hizo:**

- **Un archivo por corrida**, con la base (`pg_dump -Fc`), la multimedia de
  MinIO, `/etc/m2props/*.env` y la configuración de nginx y systemd. Uno solo y
  no dos porque una fila de `properties` apunta a un objeto de MinIO: en dos
  archivos, un restore a mitad de camino deja propiedades apuntando a fotos que
  no están.
- **El paquete incluye los secretos**, y sin ellos no sirve de nada:
  `CREDENTIALS_ENCRYPTION_KEY` descifra las credenciales de la pasarela y
  `JWT_SECRET` firma las sesiones. Es el detalle que más se olvida y el que más
  duele perder; el paquete queda en `600`.
- **`restaurar.sh --probar`** restaura en una base de descartar, **levanta el
  backend contra ella** y comprueba que el catálogo, el sitemap y la multimedia
  coincidan con lo que dice la base. Un 200 no alcanza: una base vacía también
  responde 200, y una propiedad apuntando a una foto que no está en el tar es
  una ficha con un cuadro roto.
- **Dos timers**: backup diario a las 04:20 (misma franja y demora aleatoria que
  el otro servicio del VPS) y **prueba de restore mensual**, porque un backup
  que nadie restauró no es un backup y la garantía hay que mantenerla.
- **El restore real pide `--si-esta-seguro` y saca un backup antes de pisar.**

**Lo que NO cubre, y hay que tener claro:** el backup vive en el mismo VPS que
los datos. Sobrevive a que se rompa la base, a un `TRUNCATE` accidental y a un
deploy roto; no sobrevive a perder el disco ni a que se caiga el VPS. Cuando
haya un bucket externo, es agregar un `mc cp` al final de `backup.sh`.

---

## 🟠 Altos

### A1 — El webhook de pago no es atómico — ✅ CERRADO 2026-10-02

`backend/src/modules/billing/billing.service.ts` · `billing.repository.ts`

> **Estado:** cerrado y verificado. La transacción se validó **revirtiéndola a
> propósito** en el VPS: el test falla sin ella y pasa con ella.

Cuatro escrituras seguidas sin transacción: `upsertPayment` →
`updateSubscriptionStatus` → `applyPendingPlan` → auditoría. Si el proceso se
cae entre la segunda y la tercera, el pago queda registrado y la suscripción
activa, pero **el plan que se pagó no se aplica**: la inmobiliaria pagó el plan
caro y sigue en el barato.

Lo amortigua que un 500 hace que la pasarela reintente y el reintento rehaga
todo. Pero depender del reintento de un tercero para no perder plata es una
apuesta, no un diseño.

**Cómo se cerró:**

1. **`enTransaccion(fn)` en el repositorio**, con las tres escrituras del webhook
   adentro. Los métodos aceptan un cliente transaccional opcional, así que el
   servicio conserva el control del **orden**, que es donde vive el significado.
2. **`upsertPayment` pasó de `create` a `createMany` con `skipDuplicates`**
   (`INSERT ... ON CONFLICT DO NOTHING`). No es un detalle: **dentro de una
   transacción, cualquier error la deja abortada en PostgreSQL** y no se puede
   seguir consultando. El try/catch sobre P2002 que se puso para B1 funciona
   fuera de una transacción y es inservible adentro. Con `ON CONFLICT DO
   NOTHING` no hay error que capturar, y el caso de "ya existía" se resuelve
   leyendo.
3. **Auditoría y notificación quedan AFUERA**, y no por descuido: son efectos
   secundarios que no se pueden deshacer. Si el proceso se cae entre el commit y
   el aviso, el correo se pierde — problema recuperable, porque la suscripción
   pagada se ve en el panel. La alternativa es peor: avisar dentro de la
   transacción es mandar un "pago confirmado" que después rollbackea.

**El test que lo sostiene** rompe la **tercera** escritura de verdad, no la
primera: `subscriptions.pending_plan_id` no tiene foreign key, así que se puede
dejar un id de plan inexistente; la restricción aparece recién cuando
`applyPendingPlan` lo copia a `plan_id`, que sí la tiene. Las dos primeras
escrituras salen y la tercera falla: exactamente el escenario de A1.

> Un primer intento del test usaba un desborde de `Decimal(12,2)` en el monto,
> para romper la escritura del pago. **Pasaba igual sin transacción**, porque si
> la primera escritura falla, las siguientes tampoco se ejecutan y no hay nada
> que revertir. Un test de atomicidad tiene que romper una escritura posterior,
> o no está probando atomicidad.

### A2 — Ningún `fetch` externo tiene timeout — ✅ CERRADO 2026-10-02

`backend/src/shared/http/fetch-con-timeout.ts` (nuevo) y sus 4 consumidores

> **Estado:** cerrado y verificado contra los organismos reales desde el VPS.

El `fetch` de Node no trae timeout por defecto. Un organismo que acepta la
conexión y no responde deja el request colgado sin límite. En el caso de los
índices es peor: el single-flight guarda la promesa en `enVuelo`, así que **una
sola bajada colgada bloquea a todas las consultas siguientes de esa serie**, y
como el `finally` que la saca del mapa solo corre cuando la promesa se resuelve,
la calculadora quedaba muerta hasta reiniciar el proceso.

**Cómo se cerró:** un helper único, `fetchConTimeout`, por el que pasan las
cuatro llamadas externas (Resend, BCRA, datos.gob.ar, MercadoPago) y el token
check. La regla "toda llamada saliente tiene timeout" queda cumplida por
construcción y no por acordarse. Cortes: 10s para pagos y correo, 20s por
página de índices — el ICL baja paginado y pasa los 2000 puntos, así que el
corte va por petición y no por descarga completa.

**Dos cosas que la implementación tiene que hacer bien y que no son obvias:**

1. **No alcanza con `AbortSignal.timeout`.** Abortar es cooperativo: si el
   `fetch` —o el mock de un test— ignora la señal, el `await` sigue esperando
   para siempre. La respuesta tiene que **ganarle a un timer** con
   `Promise.race`, que no depende de que el otro cumpla. El `AbortSignal` se le
   pasa igual, para que el pedido real aborte y libere la conexión.
2. **El timer NO puede ir en `unref()`.** Este lo encontró corriendo el código
   en el VPS y no en Jest: un timer sin referencias no mantiene vivo el event
   loop, así que un `fetch` colgado —que no abre ningún handle— dejaba que el
   proceso **terminara limpiamente sin que el corte llegara a dispararse**.
   Los tests de Jest no lo ven, porque el timer de test de Jest sí mantiene vivo
   el loop. O sea: el `unref` hacía que el timeout no cortara, exactamente lo
   contrario de lo que vino a hacer. Hay un test de regresión, aunque solo
   mirando la propiedad del timer.

**Verificado contra los organismos reales desde producción:**
`fetch que no responde → cortada en 2004ms, UPSTREAM_TIMEOUT, "nunca.invalid no
respondió en 2s"` y `BCRA real → HTTP 200 en 537ms` con el corte ya puesto.

### A3 — Sin handler de `unhandledRejection` / `uncaughtException` — ✅ CERRADO 2026-10-02

`backend/src/server.ts` · `backend/src/shared/proceso/apagado.ts` (nuevo)

> **Estado:** cerrado y verificado en producción con un SIGTERM real.

Una promesa rechazada fuera de un `try` mataba el proceso sin dejar rastro de qué
la causó, y de golpe.

**La decisión de fondo es no cambiar el criterio, cambiar cómo se muere.** Node
desde la v15 tira el proceso ante un `unhandledRejection`, y para un sistema que
maneja plata ese fail-fast es el correcto: si una promesa se rechaza y nadie la
atiende, puede haber un bug que dejó el mundo en un estado raro, y seguir como
si nada es peor que reiniciar.

Lo que faltaba eran las dos mitades que lo volvían aceptable:

1. **Que quede escrito por qué.** El handler loguea el motivo con su stack
   antes de que el proceso caiga.
2. **Que la muerte sea un drain y no una guillotina.** El rechazo dispara el
   mismo apagado ordenado que un SIGTERM: deja de aceptar conexiones, espera a
   que terminen las que están en vuelo y recién ahí desconecta la base. Sin
   esto, un rechazo al azar cortaba el pago de alguien que estaba confirmando en
   ese instante.

`uncaughtException` sí sale de una, sin drain: ahí el estado del proceso es
desconocido y no hay nada que drenar. Se loguea con `fatal` y se sale con 1.

**El apagado se movió a `shared/proceso/apagado.ts`** para poder testearlo: un
handler de señales probado en `server.ts` mataría al propio runner de tests. La
lógica entra en una función con `salir` inyectable, y `server.ts` solo la conecta
a `process`.


### A4 — El graceful shutdown no espera nada
`backend/src/server.ts:16-18`

```ts
server.close();
await disconnectDatabase();
```

`server.close()` no se espera: corta la escucha y sigue de largo, así que Prisma
se desconecta con requests todavía en vuelo. En un deploy eso son respuestas 500
para quien justo estaba pagando.

### A5 — Sin error tracking
No hay Sentry ni equivalente. Los errores viven en el log del contenedor: nadie
se entera de un 500 en producción salvo que el usuario avise.

### A6 — `npm run lint` está roto en todo el repo
`backend/package.json:13` · `frontend/`

No existe `eslint.config.js` en ninguno de los dos paquetes. ESLint 9 dejó de
leer `.eslintrc`, así que el comando falla siempre. Está documentado en
`CLAUDE.md` como parte del flujo y **el CI no lo corre**, con lo cual nadie lo
notó: es una red de seguridad que todos creen tener y no existe.

### A7 — SPF, DKIM y DMARC sin configurar
`docs/deploy.md:365`

La doc lo advierte pero no está hecho: depende de registros DNS que no se
cargaron. Sin eso, los correos de lead, bienvenida y confirmación de pago van a
spam — o sea, la inmobiliaria no se entera de las consultas que paga por recibir.

### A8 — `react-router` con dos vulnerabilidades moderadas
`npm audit` en `frontend/`: open redirect vía backslash en `<Link>`/`useNavigate`
(bypass de CVE-2025-68470) y constructor injection en `deserializeErrors()`. Hay
fix disponible.

---

## 🟡 Medios

| | Hallazgo | Evidencia |
|---|---|---|
| M1 | Sin correlation/request ID: no se puede seguir un request de punta a punta en el log | `app.ts:28` (pinoHttp sin `genReqId`) |
| M2 | `/health` no chequea la base: responde ok con Postgres caído, así que no sirve de readiness | `app.ts:30-32` |
| M3 | Connection pooling en los defaults de Prisma, sin dimensionar para el VPS | `config/database.ts:13-17` |
| M4 | Sin test de idempotencia ni de concurrencia del webhook — es lo que habría cazado B1 | `tests/` |
| M5 | El subsistema de fotos de tasaciones está expuesto pero sin cablear: cero call sites en el frontend | `modules/appraisals/appraisals.media.service.ts` |
| M6 | `property.city` es obligatoria en el alta pero la columna sigue nullable | `schema.prisma:249` |
| M7 | `body-parser` con vulnerabilidad baja (DoS por límite inválido) | `npm audit` backend |

---

## ⚪ Bajos

- Sin OpenAPI/Swagger (tarea 0.10, nunca arrancada).
- Sin manual de usuario para los dos paneles (tarea 5.10).

---

## Lo que pasó el gate

No todo es deuda. Estas son las que verifiqué y **cumplen**:

**Seguridad.** Secrets fuera del código, `.env` en `.gitignore` y
`.env.example` sin valores reales. Todo el acceso a datos va por Prisma
parametrizado: no hay una sola concatenación con input del usuario.
Autorización por recurso resuelta en `BaseRepository`, donde toda query exige
`tenantId` y las operaciones por id filtran por `{ id, tenantId }` devolviendo
404 —sin revelar que el recurso existe—, con 11 casos de aislamiento probados
contra dos inmobiliarias reales. JWT de 15 minutos con refresh rotativo en
cookie httpOnly y secrets separados; contraseñas con bcrypt. Validación con Zod
en todo endpoint. Rate limit en login, registro, webhook, endpoints públicos, y
uno más estricto en las consultas públicas. `helmet` y CORS restringido a
`FRONTEND_URL` con `credentials`, nunca `*`. TLS forzado por Caddy con
On-Demand.

**Plata.** Los importes son `Decimal(12,2)` en la base y viajan como string:
no hay un `float` en el camino del dinero. El webhook **verifica la firma HMAC
antes de mirar el cuerpo** (`mercadopago.provider.ts:86-100`) y **consulta el
estado real al proveedor** en vez de creerle al payload. El upgrade de plan se
concede únicamente al confirmarse el pago: abrir el checkout deja el plan en
`pendingPlanId`, así que abandonarlo no regala nada. Migraciones versionadas, 7
aplicadas, 16 índices y 7 restricciones únicas.

**Confiabilidad.** Ni un `catch` vacío en todo el backend. El correo y la
auditoría nunca voltean la operación que los disparó. Un organismo caído
—BCRA, INDEC— no rompe la calculadora: responde con la caché y avisa de cuándo
es el dato.

**Observabilidad.** Log estructurado JSON en producción con `pino`, y
**redacción de `authorization`, `cookie`, `password` y `passwordHash`**.
Auditoría de eventos de plata con `payment.received` y `payment.failed`.

**Testing.** 451 unitarios, 88 de integración contra Postgres real y 101 de
frontend, todos verdes. CI en `.github/workflows/ci.yml` que corre typecheck,
unitarios e integración en cada push.

**Deploy.** Config 12-factor validada con Zod que **aborta el arranque** si
falta algo. Lockfiles commiteados. `docker-compose.prod.yml`, Dockerfiles
multi-etapa, `Caddyfile` y `.env.production.example` escritos y completos.

---

## Camino a LISTO

Por orden de riesgo, no de esfuerzo:

1. ~~**B1**~~ — **cerrado el 2026-10-02** (`@unique` + P2002 + notificación
   única), con test de concurrencia validado revirtiendo el fix.
2. ~~**B2**~~ — **cerrado el 2026-10-02**: backup diario con timers y restore
   verificado, incluido el que levanta la app contra la copia.
3. **Correo a `resend`** — no estaba en la lista de agosto y es lo único que
   separa el código de la facturación: con `EMAIL_PROVIDER=fake` una
   inmobiliaria no se entera de que recibió una consulta, ni de que le cobró.
   Necesita dominio con SPF, DKIM y DMARC (es el A7 de abajo).
4. **Credenciales de MercadoPago en `payment_settings`** (hoy 0 filas) y
   `PAYMENT_PROVIDER=mercadopago`, con un pago de punta a punta en sandbox antes
   que real.
5. **A2, A3, A4** — timeouts, handlers de proceso, shutdown que espere. Las
   tres son de higiene y van juntas.
6. **A7** — SPF, DKIM y DMARC junto con los registros DNS que ya hacen falta
   para los dominios propios.
7. **A5, A6, A8** — Sentry, arreglar el lint, actualizar `react-router`.

Los medios se pueden documentar como deuda y atacar después del go-live, con
una excepción de criterio: **M4 conviene hacerlo junto con B1**, porque un test
de concurrencia es lo que evita que ese agujero vuelva. *Hecho: quedó junto
con el fix, en `tests/integration/billing.test.ts`.*
