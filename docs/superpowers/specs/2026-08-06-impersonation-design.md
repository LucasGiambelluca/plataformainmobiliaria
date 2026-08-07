# Suplantación de inmobiliaria desde el super admin

Fecha: 2026-08-06
Estado: diseño aprobado, sin implementar

## Problema

El panel de super admin es hoy casi puro mirador: dashboards, listados y
auditoría. Cuando una inmobiliaria escribe "no me aparece el botón de publicar"
o "cargué la propiedad y no se ve", no hay forma de mirar lo que ella mira. El
super admin no puede ver sus propiedades, ni sus leads, ni sus usuarios: el
router de usuarios exige `tenant_admin` + `requireTenant`, y el super admin no
tiene `tenantId`.

La salida barata es construir, una por una, pantallas de solo lectura en el
admin que repliquen las ocho del panel. La salida buena es dejar que el super
admin abra el panel real.

## Decisiones tomadas

1. **Solo lectura.** El super admin ve el panel completo pero no puede escribir
   nada. Diagnostica sin poder romper, y ningún cambio queda firmado con la
   cara del cliente.
2. **Sin pedir permiso, con registro.** El evento se audita bajo el `tenantId`
   de la inmobiliaria, así que aparece en su log. No se pide autorización ni se
   manda correo: pedir permiso es inútil justo en el caso más común, que es la
   inmobiliaria que no puede entrar y por eso llamó.
3. **Se suplanta al `tenant_admin`, automático.** Un solo botón. El backend
   elige el `tenant_admin` activo más antiguo. En solo lectura todos los
   administradores ven lo mismo, así que elegir cuál no aporta nada.
4. **Token efímero en memoria, sin refresh.** La cookie httpOnly del super
   admin nunca se toca. Recargar la página devuelve al super admin.

## Arquitectura

### El token

`JwtPayload` (`backend/src/types/auth.ts`) suma dos campos opcionales, ausentes
en toda sesión normal:

```ts
export interface JwtPayload {
  sub: string;            // el tenant_admin suplantado
  tenant: string | null;
  role: UserRole;         // "tenant_admin"
  /** id del super admin que está actuando. Solo en tokens de suplantación. */
  act?: string;
  /** Marca de solo lectura. Solo en tokens de suplantación. */
  ro?: true;
}
```

`act` toma el nombre del claim de RFC 8693 (*actor*), que nombra exactamente
esto: quién está actuando en nombre de quién.

`signImpersonationToken(target, actorId)` vive aparte de `signAccessToken` en
`shared/services/jwt.service.ts`. Separarlas no es cosmético: mientras el camino
normal no tenga forma de escribir `act`, ninguna sesión común puede terminar
marcada como suplantación por un descuido.

TTL propio: `IMPERSONATION_EXPIRES_IN`, default `30m`, validado en
`config/env.ts` junto a `JWT_EXPIRES_IN` y `JWT_REFRESH_EXPIRES_IN`.

`AuthUser` suma `impersonatorId?: string` y `readOnly?: boolean`, que
`authenticate` vuelca desde el payload.

### El endpoint

`POST /api/admin/tenants/:id/impersonate`, colgado del `tenantsRouter`, que ya
aplica `authenticate` + `authorize("super_admin")` a nivel router. Se le suma un
`impersonateLimiter` en `shared/middleware/rateLimit.ts`.

`TenantsService.impersonate(tenantId)`:

1. Resuelve el tenant. Si no existe, `NotFoundError` (ya lo hace `getById`).
2. Busca su `tenant_admin` con `isActive: true` y `createdAt` más viejo.
3. Sin ninguno → 422 `"La inmobiliaria no tiene un administrador activo"`.
4. Devuelve `{ accessToken, expiresAt, user, tenant }`.

Dos cosas que el endpoint **no** hace, a propósito:

- **No emite refresh token ni toca la cookie.** Es el corazón del diseño: la
  cookie httpOnly sigue siendo la del super admin, así que siempre hay a dónde
  volver y no existe forma de quedar atrapado en la identidad ajena.
- **No exige que la inmobiliaria esté activa.** Una suspendida es justo cuando
  más falta hace mirar su panel.

### Cómo se hace cumplir el solo lectura

El chequeo va **dentro de `authenticate`** (`shared/middleware/authenticate.ts`):
si el payload trae `ro` y el método no es `GET` ni `HEAD`, se tira
`ForbiddenError` con un code propio (`IMPERSONATION_READ_ONLY`).

Va ahí, y no en un middleware suelto, por cobertura. `authenticate` está en el
camino de **toda** ruta autenticada; un middleware aparte habría que acordarse
de montarlo en los ~15 routers, y olvidarse de uno significa escritura con la
identidad de otra persona. Mezcla autenticación con autorización: es una
impureza consciente, del mismo tipo que la constante de visibilidad de
`public.repository.ts`, y por la misma razón — un agujero por omisión cuesta
más que una responsabilidad de más en un archivo.

Las rutas públicas no llaman a `authenticate` y por lo tanto ignoran el token.
No es un hueco: cualquier anónimo puede hacer eso mismo sin token, y nada de lo
que pase ahí se atribuye al suplantado.

Dos propiedades más salen gratis del diseño y conviene no perderlas de vista:

- El token declara `role: "tenant_admin"`, así que `authorize("super_admin")` lo
  rechaza. **Desde una suplantación no se vuelve a `/api/admin/*`** ni se
  suplanta de nuevo: no hay escalada de vuelta.
- El `sub` es un usuario real de ese tenant, así que `BaseRepository` sigue
  aislando como siempre. No hay camino a los datos de otra inmobiliaria.

### Auditoría

Se suma `"impersonation.start"` a `AUDIT_ACTIONS` (`modules/audit/audit.service.ts`),
que es lista cerrada.

| campo | valor |
|---|---|
| `tenantId` | la inmobiliaria suplantada — para que salga en **su** log |
| `userId` | el super admin **real** |
| `entityType` / `entityId` | `"user"` / id del usuario suplantado |
| `metadata` | `{ email: <suplantado>, expiresAt: <ISO> }` |

**No hay `impersonation.stop`.** Salir es descartar un token en el navegador: no
hay llamada al servidor que se pueda garantizar (cerrar la pestaña, un corte de
red y el vencimiento del token no avisan nadie). Un evento de cierre que a veces
no llega es peor que no tenerlo, porque invita a leer la duración de la ventana
en un dato que miente. La ventana queda acotada por `expiresAt`, que sí es
firme.

Las acciones hechas durante la suplantación no generan auditoría propia porque
son de solo lectura: no hay nada que registrar.

## Frontend

### Estado de la sesión

`src/store/auth.ts` suma un campo y dos acciones:

```ts
impersonation: { tenant: { id, name, slug }, expiresAt: string } | null
startImpersonation(tenantId)  // pide el token, lo pone en memoria, navega a /panel
stopImpersonation()           // descarta el token, refreshSession(), navega a /admin/inmobiliarias
```

`bootstrap()` no se toca: el F5 usa la cookie y devuelve al super admin solo.
La salida de emergencia sale gratis del diseño del token.

`RequireAuth` tampoco: durante la suplantación `user.role` es `tenant_admin`, así
que `/panel` lo deja pasar y `/admin` no. La UI y el token dicen lo mismo.

### El 401 durante la suplantación

`src/lib/api.ts` refresca ante cualquier 401 que no venga de las rutas de auth.
Si eso corre mientras se suplanta, el super admin vuelve a ser él mismo **en
medio de una pantalla del panel**, con el banner puesto y datos que ya no le
corresponden.

`src/lib/session.ts` suma una bandera a nivel de módulo
(`setImpersonating` / `isImpersonating`) y el interceptor la consulta: si se está
suplantando, el 401 no refresca — corta la suplantación, vuelve al super admin y
avisa "La sesión de soporte venció". Va en `session.ts` y no en el store por el
mismo ciclo de imports que ese archivo ya documenta en su encabezado: `api.ts`
lee, el store escribe, ninguno importa al otro.

### El botón "Salir" del header

`DashShell` (`src/components/panel/DashShell.tsx`) tiene un botón "Salir" que
llama a `logout()` → `POST /auth/logout` con la cookie. Apretarlo suplantando
**mata la sesión real del super admin**, no la suplantada.

Suplantando, ese botón se reemplaza por **"Volver al admin"**
(`stopImpersonation`). No conviven los dos: mientras haya suplantación activa no
hay forma de cerrar sesión de verdad. Primero se sale, después uno se va.

Esa protección es solo de interfaz, y conviene saberlo: `POST /auth/logout`
trabaja sobre la cookie, no sobre el access token, así que no pasa por
`authenticate` y no puede distinguir si quien llama está suplantando. La cookie
que recibe es legítimamente la del super admin y cerrar su sesión es una
respuesta correcta. Nada se rompe si igual ocurre —el super admin vuelve al
login— pero el bloqueo vive en el componente, no en el servidor.

### Señalización

Banner fijo arriba de todo en `DashShell`, visible solo con
`impersonation !== null`:

> ⚠ Estás viendo el panel de **Inmobiliaria Demo** como soporte · solo lectura ·
> vence 14:32 — **[Volver al admin]**

Colores propios (ámbar/rojo), **no** las variables `--brand`: el panel se
re-tematiza con los colores de cada inmobiliaria, y el aviso tiene que gritar
por encima de ese tema, no integrarse a él.

### Dónde entra el botón

Fila de la tabla de `src/pages/admin/Tenants.tsx`, junto a editar y suspender:
un ícono "Ver su panel".

## Fuera de alcance (deuda anotada)

**No se deshabilitan los botones de acción de las ocho pantallas del panel.** En
su lugar, el 403 del backend ya trae el mensaje final —"Estás en modo soporte:
la sesión es de solo lectura."— y `toApiError` lo pasa tal cual a `ApiError.message`,
que es lo que las pantallas muestran. No hace falta traducir nada en el
interceptor: alcanza con que el mensaje del backend esté bien escrito. El code
`IMPERSONATION_READ_ONLY` queda igual, para que una pantalla que quiera
distinguirlo de un 403 por rol pueda hacerlo.

El roce es real: se hace clic en "Guardar" y recién ahí llega el aviso. Con el
banner arriba se acepta para esta versión. Si molesta, el arreglo es un hook
`useReadOnly()` que las pantallas consulten para deshabilitar sus CTA.

También queda afuera, y no es olvido:

- Suplantar a un usuario elegido de una lista (hoy: siempre el `tenant_admin`).
- Suplantación con permiso de escritura.
- Correo de aviso a la inmobiliaria.
- Revocación desde el servidor de una suplantación en curso. No hace falta:
  sin refresh, el token muere solo en 30 minutos y no se puede renovar.

## Pruebas

**Backend** (`backend/tests/unit/`)

- `signImpersonationToken` emite `act` y `ro`; `signAccessToken` no los emite
  nunca.
- `authenticate` deja pasar `GET`/`HEAD` con `ro` y rechaza `POST`, `PATCH`,
  `PUT` y `DELETE` con 403.
- El endpoint elige el `tenant_admin` activo más antiguo entre varios.
- Sin `tenant_admin` activo → 422.
- Una inmobiliaria suspendida se puede suplantar igual.
- Un token de suplantación recibe 403 en una ruta `authorize("super_admin")`.
- La respuesta del endpoint no trae `Set-Cookie`.
- Queda el registro de auditoría, con el super admin como `userId` y la
  inmobiliaria como `tenantId`.

**Frontend** (`frontend/tests/`)

- `startImpersonation` deja el token en memoria y el estado en el store.
- `stopImpersonation` vuelve al super admin, y lo deja anónimo si la sesión real
  también murió.
- Un 401 durante la suplantación no dispara refresh: sale de la suplantación.
- Fuera de la suplantación, un 401 sigue refrescando como siempre.

**Verificación manual, no automática**

El banner y el reemplazo del botón "Salir" por "Volver al admin" son
comportamiento de componente, y el harness de Vitest corre en entorno `node` sin
`@testing-library/react`: no hay forma de montar un componente hoy. Se verifican
a mano en el navegador, con pasos escritos en el plan de implementación. Sumar
RTL es un cambio de infraestructura de tests más grande que esta funcionalidad y
queda para cuando haya varias pantallas que lo justifiquen.

## Archivos que se tocan

| Archivo | Cambio |
|---|---|
| `backend/src/types/auth.ts` | `act` y `ro` en `JwtPayload`; `impersonatorId` y `readOnly` en `AuthUser` |
| `backend/src/config/env.ts` | `IMPERSONATION_EXPIRES_IN` |
| `backend/src/shared/services/jwt.service.ts` | `signImpersonationToken` |
| `backend/src/shared/middleware/authenticate.ts` | bloqueo de escritura con `ro` |
| `backend/src/shared/middleware/rateLimit.ts` | `impersonateLimiter` |
| `backend/src/shared/errors/` | code `IMPERSONATION_READ_ONLY` |
| `backend/src/modules/tenants/tenants.service.ts` | `impersonate()` |
| `backend/src/modules/tenants/tenants.repository.ts` | buscar el `tenant_admin` activo más antiguo |
| `backend/src/modules/tenants/tenants.router.ts` | `POST /:id/impersonate` + auditoría |
| `backend/src/modules/audit/audit.service.ts` | `impersonation.start` |
| `frontend/src/lib/session.ts` | bandera de suplantación |
| `frontend/src/lib/api.ts` | el 401 no refresca suplantando |
| `frontend/src/store/auth.ts` | estado y acciones |
| `frontend/src/api/tenants.ts` + `schemas.ts` | cliente y contrato |
| `frontend/src/components/panel/DashShell.tsx` | banner y botón "Volver al admin" |
| `frontend/src/pages/admin/Tenants.tsx` | botón "Ver su panel" |
