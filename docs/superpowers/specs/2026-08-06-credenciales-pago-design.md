# Credenciales de MercadoPago cargadas desde el panel del super admin

Fecha: 2026-08-06
Estado: diseño aprobado, sin implementar

## Problema

Las credenciales de la pasarela viven en `PAYMENT_API_KEY` y
`PAYMENT_WEBHOOK_SECRET` del `.env`, y `env.ts` **aborta el proceso** si faltan
cuando `PAYMENT_PROVIDER=mercadopago`. Eso convierte tres operaciones normales
—rotar el access token, pasar de sandbox a producción, cambiar de cuenta de
MercadoPago— en un deploy con downtime.

## Lo que NO cambia: el modelo de cobro

La conversación arrancó por "usemos Checkout Pro", y hay que dejar escrito por
qué el módulo de cobro no se toca.

`mercadopago.provider.ts` postea a `/preapproval` y redirige al `init_point`
que devuelve. Eso **ya es** una página de checkout alojada por MercadoPago, muy
parecida a Checkout Pro: la diferencia entre los dos no está en la pantalla que
ve la inmobiliaria, está en qué pasa el mes siguiente.

- **`preapproval` (lo que hay):** la inmobiliaria autoriza una vez y MercadoPago
  debita todos los meses. Requiere tarjeta o dinero en cuenta.
- **Checkout Pro clásico (`/checkout/preferences`):** un pago suelto por período.
  Acepta efectivo y transferencia, pero la renovación, el aviso de vencimiento,
  la mora y la suspensión quedan de nuestro lado.

Se confirmó que el comportamiento buscado es el débito automático, así que el
modelo de cobro queda como está. Este diseño cubre **solo** el traslado de las
credenciales al panel.

## Decisiones tomadas

1. **La base es la fuente de verdad, sembrada una vez desde el `.env`.**
2. **Dos juegos de credenciales guardados en paralelo** (sandbox y producción)
   con un interruptor de cuál está activo.
3. **Los secretos van cifrados** con AES-256-GCM y clave en el entorno.
4. **El token nunca vuelve al navegador**: se reemplaza, no se lee.

## Modelo de datos

Fila única: la plataforma cobra con una sola cuenta de MercadoPago, así que no
hay `tenant_id` acá.

Los dos juegos van como columnas de la misma fila y no como dos filas con un
`isActive`, para que "cuál está activa" sea un dato y no un invariante que
alguien tenga que sostener a mano en cada escritura.

```prisma
enum PaymentMode {
  sandbox
  production
}

/// Credenciales de la pasarela, cargadas desde el panel del super admin.
/// Fila única (id fijo). Los secretos se guardan cifrados: ver secretBox.
model PaymentSettings {
  id                      String      @id @default("singleton")
  activeMode              PaymentMode @default(sandbox) @map("active_mode")

  sandboxAccessToken      String?     @map("sandbox_access_token")
  sandboxWebhookSecret    String?     @map("sandbox_webhook_secret")
  productionAccessToken   String?     @map("production_access_token")
  productionWebhookSecret String?     @map("production_webhook_secret")

  updatedAt               DateTime    @updatedAt @map("updated_at")
  updatedById             String?     @map("updated_by_id")

  @@map("payment_settings")
}
```

`activeMode` arranca en `sandbox` a propósito: si alguien carga credenciales y
se olvida de activar, el peor caso es que no cobre, no que cobre con la cuenta
equivocada.

La unicidad de la fila la sostiene el repositorio, que siempre hace `upsert`
sobre `id: "singleton"`. No hay constraint en la base: nadie más escribe esa
tabla.

## Cifrado

`backend/src/shared/services/crypto/secretBox.ts`, dos funciones:

```ts
encryptSecret(plain: string): string   // "v1:<iv>:<tag>:<cipher>", todo base64
decryptSecret(payload: string): string
```

AES-256-GCM con IV aleatorio de 12 bytes por cifrado y el tag de autenticación
guardado junto al texto.

**GCM y no CBC porque es autenticado.** Un ciphertext manipulado falla ruidoso
en vez de descifrar a basura que después sale como `Bearer` hacia MercadoPago.
El prefijo `v1:` está para que el día que cambie el algoritmo se note, en lugar
de descifrar mal en silencio.

La clave sale de `CREDENTIALS_ENCRYPTION_KEY` (64 caracteres hex = 32 bytes),
validada en `env.ts` y exigida solo cuando `PAYMENT_PROVIDER=mercadopago` — el
mismo `superRefine` que hoy exige el access token. La regla se mueve, no
desaparece.

**Por qué esto no es circular.** La objeción razonable es: si igual hace falta
un secreto en el `.env`, ¿qué se ganó? Se ganó que **la clave no cambia y las
credenciales sí**. Rotar el token, pasar a producción o cambiar de cuenta dejan
de ser un deploy, que es el punto entero. La clave de cifrado se pone una vez.

## Resolución del provider

`paymentProvider` deja de ser una constante creada al cargar el módulo y pasa a
ser `resolvePaymentProvider(): Promise<PaymentProvider>`:

1. `PAYMENT_PROVIDER=fake` → `FakePaymentProvider`, **sin tocar la base**. El
   desarrollo local sigue arrancando con cero configuración.
2. `PAYMENT_PROVIDER=stripe` → el `UnavailablePaymentProvider` de siempre.
3. `PAYMENT_PROVIDER=mercadopago` → lee la fila, descifra el juego activo y arma
   el `MercadoPagoProvider`.
4. Sin credenciales cargadas para el modo activo → `UnavailablePaymentProvider`.

El punto 4 apoya en algo que ya estaba escrito y conviene no romper:
`UnavailablePaymentProvider.verifyWebhook()` devuelve `false`
(`shared/services/payments/index.ts`). **Una plataforma sin configurar rechaza
los webhooks en lugar de aceptarlos.** El modo de falla correcto ya existía.

### Por qué un resolver y no un proxy

`verifyWebhook` es **síncrono** en la interfaz (`payment.provider.ts`), y leer
credenciales de la base es asíncrono. No hay forma de esconder la lectura
detrás de un objeto que implemente `PaymentProvider` sin volver `async` ese
método — y ese método es el control de seguridad más importante del módulo, no
es donde conviene tocar la firma por comodidad.

Entonces `BillingService` recibe `() => Promise<PaymentProvider>` en el
constructor en lugar de la instancia, y sus cuatro llamadas pasan a
`(await this.resolve()).x()`. La interfaz `PaymentProvider` no se toca y los
tests inyectan `async () => fakeProvider`.

### Sin caché, a propósito

El volumen es un checkout por inmobiliaria por mes más los webhooks. Una query
por operación es ruido. Sin caché no hay nada que invalidar, el cambio de
credenciales toma efecto en el acto, y sigue siendo correcto si mañana corren
dos procesos Node. Si alguna vez importa, la caché entra como decorador del
resolver sin tocar nada más.

### Qué pasa sin credenciales

El checkout responde 503 `PAYMENT_UNAVAILABLE` con mensaje claro y **el resto de
la plataforma funciona igual**. Nadie deja de publicar propiedades porque falte
configurar la pasarela.

## Endpoints

Todos bajo `/api/admin/payment-settings`, con `authorize("super_admin")` a nivel
router como `tenants` y `plans`.

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/` | Estado. Nunca los secretos. |
| `PUT` | `/:mode` | Guarda un juego (`sandbox` \| `production`) |
| `POST` | `/activate` | Cambia cuál está activo |

Respuesta del GET:

```json
{
  "activeMode": "sandbox",
  "credentials": {
    "sandbox":    { "configured": true,  "last4": "c8f2" },
    "production": { "configured": false, "last4": null }
  },
  "webhookUrl": "https://api.plataforma.com/api/billing/webhook",
  "updatedAt": "2026-08-06T12:00:00.000Z",
  "updatedBy": "admin@plataforma.com"
}
```

`last4` alcanza para confirmar cuál credencial está cargada sin exponer nada
aprovechable.

Cuerpo del `PUT /:mode`:

```json
{ "accessToken": "APP_USR-…", "webhookSecret": "…" }
```

**Los dos campos son obligatorios; no hay actualización parcial.** Es tentador
permitir rotar solo el webhook secret sin volver a pegar el token, pero son
campos que no se pueden leer: la pantalla muestra `···· c8f2` y nada más. Un
formulario donde un campo vacío a veces significa "no lo cambies" y a veces
"borralo" es exactamente el que termina dejando la plataforma sin cobrar. Se
pegan los dos juntos, que es como vienen del panel de MercadoPago.

`webhookUrl` viaja en la respuesta y no se arma en el frontend a propósito: sale
de `BACKEND_URL`, que es lo que el provider realmente manda como
`notification_url`. Si el frontend la dedujera por su cuenta podrían divergir, y
el resultado sería una URL que el super admin copia a MercadoPago y que nunca
recibe nada.

## Validación al guardar

`PUT /:mode` llama a `/users/me` de MercadoPago con el token recibido antes de
guardarlo:

- **401 del proveedor** → no se guarda. 422 "MercadoPago rechazó esas
  credenciales".
- **Red caída o 5xx** → se guarda igual y la respuesta avisa que no se pudo
  verificar.

Misma regla que el proyecto ya aplica al correo y a las series de índices: un
servicio externo caído no puede voltear la pantalla. Pero un token mal pegado sí
tiene que frenarse acá, porque si no el error aparece recién cuando una
inmobiliaria intenta pagar.

Nota: `/users/me` valida el access token, **no** el webhook secret. El secret no
tiene endpoint de verificación; su primer ejercicio real es el primer webhook
que llegue. La pantalla lo dice.

## Auditoría

Dos acciones nuevas en `AUDIT_ACTIONS`: `payment_settings.update` y
`payment_settings.activate`. `tenantId: null` (son globales, como el resto de lo
del super admin) y metadata `{ mode, last4 }`.

**El token no se loguea nunca**, ni entero ni parcial más allá de esos cuatro
caracteres.

## Cambiar de modo inutiliza las suscripciones vigentes

Un `preapproval` nacido en la cuenta A no se puede consultar ni cancelar con el
token de la cuenta B: MercadoPago responde 404. Los `externalRef` guardados
quedan apuntando a algo que la credencial nueva no ve.

No se bloquea, porque hay un caso legítimo y frecuente: pasar de sandbox a
producción el día del lanzamiento, cuando lo de sandbox era de mentira igual.

Lo que sí se hace: `POST /activate` devuelve, antes de confirmar, cuántas
suscripciones activas tienen `externalRef` creado bajo el modo saliente, y la
pantalla lo pone en la confirmación con esas palabras: *"quedan N suscripciones
que no vas a poder cancelar ni consultar desde acá después del cambio"*.

Rotar solo el webhook secret es más benigno: los webhooks en vuelo firmados con
el secreto viejo se rechazan, pero MercadoPago reintenta, así que se recuperan
solos.

## Pantalla

`/admin/pagos` → `frontend/src/pages/admin/PaymentSettings.tsx`, con su ítem en
el sidebar de `AdminLayout`.

- **Arriba**: badge del modo activo (ámbar para sandbox, verde para producción),
  última actualización y quién la hizo.
- **La URL del webhook** con botón de copiar y una línea diciendo que hay que
  pegarla en el panel de MercadoPago. Es el paso que siempre se olvida y después
  nadie entiende por qué los pagos quedan pendientes.
- **Dos tarjetas**, Sandbox y Producción. Cada una con access token y webhook
  secret como campos de contraseña, con placeholder `···· c8f2` si ya hay algo
  cargado, y un botón Guardar. La que no está activa muestra "Activar".
- Activar producción pide confirmación con el conteo de suscripciones de arriba.

## Migración desde el `.env`

Va en `prisma/seed.ts`, **no** en `server.ts`: si la tabla está vacía y hay
`PAYMENT_API_KEY` en el entorno, crea la fila con esas credenciales como
`production` y deja `activeMode: production`. Loguea qué hizo.

El motivo de correrlo ahí es que `npm run prisma:seed` ya es un paso documentado
del despliegue y es idempotente por naturaleza, mientras que en `server.ts`
sería código que se ejecuta en cada arranque durante años para una condición que
se cumple una sola vez.

`PAYMENT_API_KEY` y `PAYMENT_WEBHOOK_SECRET` quedan en `.env.example` marcadas
como **solo para la migración inicial**. El `superRefine` que hoy las exige pasa
a exigir `CREDENTIALS_ENCRYPTION_KEY`.

## Fuera de alcance

- Checkout Pro clásico y el cobro por período. Ver la sección del modelo de
  cobro: se evaluó y se descartó.
- Credenciales por inmobiliaria. La plataforma cobra con una sola cuenta; el
  día que una inmobiliaria cobre alquileres por la plataforma, eso es otro
  módulo y otra tabla.
- Rotación automática o programada del token.
- Un endpoint de "probar webhook". El secret se ejerce con el primer webhook
  real y no hay forma de simularlo desde nuestro lado sin que MercadoPago lo
  firme.

## Pruebas

**Backend** (`backend/tests/unit/`)

- `secretBox`: round-trip; un ciphertext manipulado tira error en vez de
  devolver basura; dos cifrados del mismo texto dan distinto (IV aleatorio); un
  payload sin el prefijo `v1:` se rechaza.
- El resolver devuelve `Unavailable` cuando no hay credenciales para el modo
  activo.
- Con `PAYMENT_PROVIDER=fake` el resolver no consulta la base.
- **El webhook se rechaza cuando no hay configuración.** Es la propiedad
  importante de todo el archivo.
- 403 en los tres endpoints para quien no es super admin.
- El GET no devuelve el access token ni el webhook secret bajo ninguna forma.
- `PUT /:mode` con un token que MercadoPago responde 401 → 422 y no escribe.
- `PUT /:mode` con MercadoPago inalcanzable → guarda y avisa.
- La auditoría queda registrada sin el token.
- `POST /activate` informa el conteo de suscripciones del modo saliente.

**Frontend** (`frontend/tests/`)

- Cliente y schema contra el servidor falso: el GET parsea, el PUT manda el
  cuerpo correcto.

**Verificación manual, no automática**

La pantalla es comportamiento de componente, y el harness de Vitest corre en
entorno `node` sin `@testing-library/react`. Se verifica a mano, con pasos
escritos en el plan de implementación. Es la misma limitación anotada en
`2026-08-06-impersonation-design.md`.

## Archivos que se tocan

| Archivo | Cambio |
|---|---|
| `backend/prisma/schema.prisma` | `PaymentMode` y `PaymentSettings` |
| `backend/prisma/seed.ts` | sembrado desde el `.env` |
| `backend/src/config/env.ts` | `CREDENTIALS_ENCRYPTION_KEY`; el `superRefine` deja de exigir las credenciales |
| `backend/src/shared/services/crypto/secretBox.ts` | cifrado autenticado (nuevo) |
| `backend/src/shared/services/payments/index.ts` | `resolvePaymentProvider` |
| `backend/src/modules/billing/billing.service.ts` | recibe el resolver en vez de la instancia |
| `backend/src/modules/billing/billing.router.ts` | wiring del resolver |
| `backend/src/modules/paymentSettings/` | router + service + repository + schemas (nuevo) |
| `backend/src/routes/index.ts` | monta `/admin/payment-settings` |
| `backend/src/modules/audit/audit.service.ts` | dos acciones nuevas |
| `frontend/src/api/paymentSettings.ts` + `schemas.ts` | cliente y contrato |
| `frontend/src/pages/admin/PaymentSettings.tsx` | pantalla (nueva) |
| `frontend/src/components/admin/AdminLayout.tsx` | ítem del sidebar |
| `frontend/src/App.tsx` | ruta `/admin/pagos` |
