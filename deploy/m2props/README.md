# M2Prop — despliegue en un VPS con nginx y sin Docker

Variante del despliegue para un VPS que **no** es el del compose: no hay Docker
ni Caddy, hay nginx sirviendo otros sitios, un PostgreSQL nativo que ya usa otra
aplicación y un Next.js en el 3000. La app se sirve **bajo un subpath** de un
dominio que en la raíz tiene el sitio estático de otro cliente.

```
   https://hernandezyasociados.com.ar/
   ├── /                     → /var/www/hernandez-landing   (sitio del cliente, intacto)
   ├── /inmobiliaria-media/  → 127.0.0.1:9000               (MinIO, sin reescribir)
   └── /m2prop/             → esta plataforma
       ├── /                 → /var/www/m2props             (SPA)
       ├── /api/             → 127.0.0.1:3010              (backend)
       └── /sitemap.xml, /robots.txt → 127.0.0.1:3010
```

La URL pública es **`/m2prop`** desde el 2026-10-09 (antes `/m2props`). Lo
viejo responde 308 a lo nuevo conservando camino y query, así que los enlaces
compartidos siguen andando. Los nombres internos —servicios systemd, usuario,
`/opt/m2props`, `/etc/m2props`, la base— siguen con `m2props` a propósito:
nadie los ve, y renombrarlos obligaba a migrar systemd, backups y permisos.

## La multimedia es la excepción: va en la raíz

Todo lo demás vive bajo `/m2prop`, menos las fotos. No es una inconsistencia
sino una restricción de S3, y conviene tenerla escrita porque no se deduce:

con direccionamiento por path —que es lo que necesita cualquier S3-compatible—
la URL se arma como `/<bucket>/<clave>`, y MinIO interpreta **el primer segmento
de la ruta** como el nombre del bucket. Si el endpoint llevara el prefijo, la
ruta firmada quedaría `/m2prop/inmobiliaria-media/<clave>` y MinIO buscaría un
bucket llamado `m2props`.

No se arregla reescribiendo en el proxy: la reescritura cambia la ruta sobre la
que MinIO valida la firma y todo PUT pasa a fallar con `SignatureDoesNotMatch`.
Verificado contra el despliegue, no es una lectura teórica.

La salida sería darle a MinIO su propio hostname (`media.TU-DOMINIO`, que es lo
que hace el compose con `cdn`). Acá no se justificaba: el comodín
`*.hernandezyasociados.com.ar` ya resuelve a este VPS, pero el certificado que lo
cubre tiene un SAN por sitio publicado y no es un comodín, así que habría que
agregar un nombre y un certificado a un dominio de otro cliente. Un prefijo de
ruta que no colisiona con nada (`/` y `/assets/` son del sitio estático) es menos
superficie que eso. Si más adelante se quiere la multimedia en su propio
dominio, es agregar el A, el certbot y cambiar estas tres líneas.

## Archivos

| | |
|---|---|
| `nginx.conf` | Las rutas. Va como `include` **dentro** del server block del apex del 443 |
| `nginx-upstreams.conf` | Los `upstream`, que solo son válidos en el contexto http (→ `conf.d`) |
| `nginx-headers.conf` | Cabeceras de seguridad, en snippet aparte (ver el comentario) |
| `m2props-backend.service` | systemd del backend |
| `m2props-minio.service` | systemd de MinIO |
| `env.example` | → `/etc/m2props/backend.env` |
| `minio.env.example` | → `/etc/m2props/minio.env` |
| `install.sh` | Prepara la máquina. Idempotente |
| `update.sh` | Construye y publica. Es el que se corre en cada update |
| `backup.sh` | Backup diario. Corre solo por el timer |
| `restaurar.sh` | Restaura. Con `--probar` no toca producción |
| `m2props-backup.timer` | Diario a las 04:20, con 20 min de demora aleatoria |
| `m2props-restore-test.timer` | Mensual, el 1º: restaura y levanta la app contra la copia |

## Backup y restauración

```bash
# Ver el estado
systemctl list-timers | grep m2props
ls -la /var/backups/m2props/

# Forzar un backup ahora
bash /opt/m2props/deploy/m2props/backup.sh
systemctl start m2props-backup.service

# Comprobar que el último backup se restaura, sin tocar producción
bash /opt/m2props/deploy/m2props/restaurar.sh \
  /var/backups/m2props/m2props-<timestamp>.tar.zst --probar

# Restaurar de verdad (pide --si-esta-seguro, y saca un backup antes de pisar)
bash /opt/m2props/deploy/m2props/restaurar.sh \
  /var/backups/m2props/m2props-<timestamp>.tar.zst --si-esta-seguro
```

Cada corrida deja **un** archivo con la base, la multimedia, los secretos y la
configuración. Uno solo y no dos porque una fila de `properties` apunta a un
objeto de MinIO: en dos archivos, un restore a mitad de camino deja propiedades
apuntando a fotos que no están.

**El paquete incluye `/etc/m2props/*.env` y sin ese archivo no sirve de nada.**
`CREDENTIALS_ENCRYPTION_KEY` descifra las credenciales de MercadoPago y
`JWT_SECRET` firma las sesiones: una base restaurada sin los secretos es una
base que no se puede usar. El paquete queda en `600` por lo mismo.

### Por qué hay un timer que solo prueba

Un backup que nunca se restauró no es un backup: es un archivo que ocupa disco y
tranquiliza. `m2props-restore-test.timer` corre el 1º de cada mes, restaura el
último backup en una base de descartar, **levanta el backend contra ella** y
comprueba que el catálogo, el sitemap y la multimedia digan lo mismo que antes.
Después borra la base de prueba y no toca producción.

Si alguna vez falla, el backup no sirve:

```bash
journalctl -u m2props-restore-test.service -n 50
```

### Lo que todavía no cubre

**El backup vive en el mismo VPS que los datos.** Sobrevive a que se rompa la
base, a un `TRUNCATE` accidental, a que alguien deployed una versión rota. No
sobrevive a que se pierda el disco ni a que el VPS se caiga. Cuando haya
credenciales de un bucket externo (las mismas de `S3_ACCESS_KEY_ID` que ya
existen), copiar el `.tar.zst` a otro lado es agregar un `mc cp` al final de
`backup.sh` y una poda de los de más viejos.

**La retención es de 14 días en el mismo directorio.** Si el disco se llena, el
backup también falla. Con 4,8 MB por día son 67 MB al mes, así que hoy no es un
problema, pero con video de 500 MB por propiedad deja de serlo antes de lo que
uno cree.

## Lo que hace distinto a `docker-compose.prod.yml`

- **Sin contenedor ni Caddy.** El TLS lo termina el nginx del host, que ya tiene
  el certificado del apex. Por eso no hace falta DNS ni certificado nuevo.
- **Subpath en vez de raíz.** Tres cosas se parametrizaron para eso, y las tres
  se rompen si se dejan en `/`:
  - `VITE_BASE_PATH` → el `base` de Vite, el `basename` del router y las URL
    absolutas del SEO (`frontend/src/lib/basePath.ts`).
  - `APP_BASE_PATH` → el `path` de la cookie de refresh, el prefijo del sitemap
    y las reglas de `robots.txt`. **Sin esto la web anda pero la sesión se cae
    en cada recarga**, que es el síntoma más difícil de diagnosticar de todos.
- **`S3_ENDPOINT` es el origen público pelado, sin el prefijo de la app.** Las
  URLs de subida van firmadas con SigV4, que firma host y ruta. Si el backend
  firma contra loopback, el navegador nunca manda una petición que MinIO pueda
  validar; y si el endpoint lleva `/m2prop`, MinIO toma ese prefijo como nombre
  de bucket. Ver la sección de arriba.
- **Una base y un rol propios** en el clúster de Postgres que ya corre, para que
  esta app no pueda tocar los datos de la otra.

## Límites de este despliegue

- **Las webs de inmobiliaria no funcionan por subdominio.** `*.hernandezyasociados.com.ar`
  ya lo sirve el Next.js del `desplegador`, y ganaría él. Se acceden por ruta:
  `/m2prop/inmobiliaria/:slug`.
- **Los dominios propios tampoco.** Sin Caddy con on-demand TLS no hay emisión
  automática de certificados, y `DNS_RESOLVER=fake` evita que el panel prometa
  una verificación que el nginx no puede sostener. Para habilitarlos hay que
  sumar el subdominio del portal a `PLATFORM_DOMAIN` con su propio A.
- **`/robots.txt` y `/sitemap.xml` viven bajo `/m2prop`.** En la raíz del dominio
  ya están los del sitio estático del cliente, que no se tocan.
- **La cookie de refresh es `Secure`.** Con `NODE_ENV=production` no hay manera de
  probarlo por HTTP: cualquier prueba de sesión tiene que ir por https.

## Actualizar

```bash
cd /opt/m2props && git pull && bash deploy/m2props/update.sh
```

Si algo falla, el backend viejo sigue corriendo contra el schema viejo (las
migraciones corren antes del reinicio) y el nginx sigue sirviendo el bundle
anterior (el reload es el último paso). Para volver atrás:

```bash
git checkout <commit-anterior> && bash deploy/m2props/update.sh
```
