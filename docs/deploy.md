# Guía de despliegue

VPS único con Docker Compose. Cinco contenedores: Caddy en el borde, la SPA,
el backend, PostgreSQL y MinIO.

```
                    internet
                       │  :80 :443
                 ┌─────▼─────┐
                 │   Caddy   │  TLS, incluido On-Demand para dominios propios
                 └──┬─────┬──┘
        /api/*      │     │      todo lo demás
             ┌──────▼─┐ ┌─▼────────┐
             │backend │ │ frontend │
             └──┬───┬─┘ └──────────┘
        ┌───────▼┐ ┌▼──────┐
        │postgres│ │ minio │   ← ninguno publicado a internet
        └────────┘ └───────┘
```

Solo Caddy publica puertos. A Postgres y MinIO se llega desde la red interna
del compose, o por túnel SSH para administrarlos.

---

## 1. Requisitos

| | Mínimo |
|---|---|
| VPS | 2 vCPU, 4 GB RAM, 40 GB disco |
| SO | Cualquiera con Docker Engine 24+ y el plugin `compose` |
| Puertos abiertos | 80 y 443 (TCP), 443 (UDP) para HTTP/3 |
| Dominio | Con acceso al panel de DNS |

El puerto 80 tiene que quedar abierto aunque todo vaya por HTTPS: Let's Encrypt
valida por ahí. Cerrarlo deja los certificados sin renovar y el sitio se cae a
los 90 días.

---

## 2. DNS

Antes del primer arranque. Reemplazá `plataforma.com` por el dominio real y
`203.0.113.10` por la IP del VPS.

| Tipo | Nombre | Valor | Para qué |
|---|---|---|---|
| A | `@` | `203.0.113.10` | El portal |
| A | `www` | `203.0.113.10` | Redirección del portal |
| A | `cdn` | `203.0.113.10` | Fotos y videos (MinIO detrás de Caddy) |
| A | `*` | `203.0.113.10` | **La web de cada inmobiliaria por subdominio** |

El comodín `*` es el que hace que `demo.plataforma.com` funcione sin tocar el
DNS cada vez que se da de alta una inmobiliaria.

**Dominios propios de las inmobiliarias.** No se cargan acá: los configura cada
inmobiliaria en su proveedor, desde las instrucciones del panel.

| Caso | Registro |
|---|---|
| `www.inmobiliaria.com.ar` o cualquier subdominio | `CNAME` → `plataforma.com` |
| `inmobiliaria.com.ar` pelado | `A` → la IP del VPS (el DNS no admite CNAME en la raíz) |

Verificá que el comodín propaga antes de seguir:

```bash
dig +short cualquier-cosa.plataforma.com
```

---

## 3. Primer despliegue

```bash
git clone <repo> /opt/inmobiliaria
cd /opt/inmobiliaria

cp .env.production.example .env.production
```

Generá los secretos y pegalos en `.env.production`:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET (distinto del anterior)
openssl rand -hex 32      # CADDY_ASK_TOKEN
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # MINIO_ROOT_PASSWORD
```

Repasá antes de levantar, porque cambiarlos después cuesta:

- `PLATFORM_DOMAIN` sin `https://` ni `www`.
- `DATABASE_URL` con la misma contraseña que `POSTGRES_PASSWORD` y host
  `postgres` (no `localhost`: cada contenedor tiene el suyo).
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` iguales a las credenciales de
  MinIO.
- `S3_PUBLIC_URL` apuntando a `https://cdn.TU-DOMINIO/inmobiliaria-media`.
  **Cambiarlo con fotos ya cargadas las deja huérfanas**: la clave del objeto
  se deriva de la URL guardada, así que las viejas dejan de resolver. Migrar de
  dominio exige reescribir las `url` en la base.

Levantá:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

El `--env-file` no es opcional: de ahí salen también las variables que el
compose interpola. Sin él, Caddy arranca pidiendo certificados para el host
vacío.

El orden lo maneja el compose: Postgres primero, después `migrate` corre
`prisma migrate deploy` y termina, y recién ahí arranca el backend.

Sembrá los planes y el super admin (una sola vez):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npx prisma db seed
```

**Entrá a `https://TU-DOMINIO/login` y cambiá la contraseña del super admin
antes de hacer nada más.** El seed la deja con un valor conocido, que está en
`backend/prisma/seed.ts` y por lo tanto en el repositorio.

---

## 4. El endpoint que autoriza los certificados

Caddy usa **On-Demand TLS** para las webs de las inmobiliarias: emite el
certificado la primera vez que alguien visita ese host, sin reiniciar nada.

Antes de emitir, le pregunta al backend si el host pertenece a alguna
inmobiliaria (`src/modules/domains/caddy.router.ts`):

```
GET http://backend:3000/api/internal/caddy/ask?token=<CADDY_ASK_TOKEN>&domain=<host>
```

| Respuesta | Qué hace Caddy |
|---|---|
| `200` | Emite el certificado |
| Cualquier otra, o sin respuesta | No emite; el handshake TLS falla |

Responde `200` para:

- `PLATFORM_DOMAIN` y `www.PLATFORM_DOMAIN`
- `cdn.PLATFORM_DOMAIN`
- `<slug>.PLATFORM_DOMAIN` cuando existe una inmobiliaria **activa** con ese slug
- cualquier host en `tenant_domains` con estado `active` o `verifying`, de una
  inmobiliaria activa — y su variante con `www.`, que `resolveTenant` ya sirve

Y `403` en cualquier otro caso, incluido el token equivocado o vacío.

> **Por qué importa.** Sin esta autorización, cualquiera que apunte su dominio
> a la IP del VPS hace que Caddy pida un certificado a nombre de la plataforma.
> Let's Encrypt permite 50 certificados por semana y por dominio registrado:
> un tercero puede agotar la cuota en minutos y dejar a las inmobiliarias
> reales sin poder renovar los suyos.
>
> Se acepta `verifying` además de `active` a propósito: mientras el DNS
> propaga, el certificado ya se puede emitir, y el host todavía no sirve
> ninguna web porque `resolveTenant` solo resuelve dominios `active`.
>
> Con `CADDY_ASK_TOKEN` vacío el endpoint rechaza **todo**, incluido el dominio
> de la plataforma. Falla cerrado a propósito: si aceptara el token vacío,
> cualquiera podría autorizar el dominio que quisiera.

Comprobalo después de levantar, reemplazando el token y el dominio:

```bash
# 200
curl -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/internal/caddy/ask?token=TU_TOKEN&domain=TU-DOMINIO"

# 403 — no es de ninguna inmobiliaria
curl -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/internal/caddy/ask?token=TU_TOKEN&domain=ejemplo-ajeno.com"
```

---

## 5. Verificación

```bash
# Todos arriba; `migrate` tiene que figurar Exited (0)
docker compose --env-file .env.production -f docker-compose.prod.yml ps

curl -sSf https://TU-DOMINIO/health
```

Después, a mano:

- [ ] `https://TU-DOMINIO` abre el portal con candado válido
- [ ] Login del super admin y `/admin` carga métricas
- [ ] Crear una inmobiliaria de prueba y entrar a su panel
- [ ] Cargar una propiedad con foto — la foto se ve desde `cdn.TU-DOMINIO`
- [ ] Publicar el sitio y abrirlo en `https://<slug>.TU-DOMINIO` — tiene que
      salir la web de la inmobiliaria, **no** la home del portal
- [ ] Mandar una consulta desde la ficha pública y verla en la bandeja
- [ ] Recargar con F5 estando logueado: la sesión sobrevive (cookie de refresh)

Y el SEO, que también depende del host:

```bash
# En el portal: páginas fijas, inmobiliarias con web publicada y propiedades
curl -sS https://TU-DOMINIO/sitemap.xml | head -20
curl -sS https://TU-DOMINIO/robots.txt

# En el subdominio de una inmobiliaria: solo sus propiedades, y el Sitemap:
# de robots.txt apunta a su propio host
curl -sS https://<slug>.TU-DOMINIO/sitemap.xml | head -20
```

> Si `/sitemap.xml` devuelve el `index.html` de la SPA, Caddy está sirviendo los
> estáticos antes de consultar al backend: revisar que los `handle
> /sitemap.xml` y `handle /robots.txt` del `Caddyfile` estén **antes** del
> `handle` sin ruta.

> Si el subdominio de una inmobiliaria muestra la home del portal, el bundle se
> construyó sin `VITE_PLATFORM_DOMAIN`. Sale de `PLATFORM_DOMAIN` en
> `.env.production` y se congela en la imagen: hay que reconstruir el frontend
> (`up -d --build`), no alcanza con reiniciarlo.

---

## 6. Actualizaciones

```bash
cd /opt/inmobiliaria
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Las migraciones corren solas antes de que arranque el backend. Si una falla, el
backend no arranca y queda la versión anterior sirviendo: es lo buscado.

---

## 7. Backups

Tres cosas que perder duele:

```bash
# Base de datos
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U app realestate | gzip > backup-$(date +%F).sql.gz

# Multimedia
docker run --rm -v inmobiliaria_miniodata:/data -v $(pwd):/backup alpine \
  tar czf /backup/minio-$(date +%F).tar.gz -C /data .

# Certificados y clave de la cuenta ACME
docker run --rm -v inmobiliaria_caddy_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/caddy-$(date +%F).tar.gz -C /data .
```

El volumen de Caddy entra en el backup porque borrarlo obliga a reemitir todos
los certificados de golpe, que es justo cuando la cuota semanal molesta.

Un cron diario alcanza. Guardá las copias fuera del VPS.

---

## 8. Administrar la base y MinIO

Ninguno de los dos publica puertos. Para llegar con un cliente, túnel SSH:

```bash
# Postgres en localhost:5432 de tu máquina
ssh -L 5432:localhost:5432 usuario@vps \
  -t 'docker compose -f /opt/inmobiliaria/docker-compose.prod.yml exec postgres true'
```

Más simple, y suficiente casi siempre:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec postgres psql -U app -d realestate
```

Para la consola web de MinIO (puerto 9001), túnel al contenedor:

```bash
ssh -L 9001:localhost:9001 usuario@vps
```

---

## 9. Cuando algo falla

**Un dominio propio no verifica.** El estado sale del DNS, no de un botón.
Comprobá adónde apunta de verdad:

```bash
dig +short CNAME inmobiliaria.com.ar
dig +short A inmobiliaria.com.ar
```

`verifying` es propagación en curso — hasta 48 h. `failed` es que apunta a otro
lado y hay que corregir el registro. El panel muestra el detalle exacto.

**Un subdominio no levanta HTTPS.** En orden: que el comodín `*` esté en el
DNS, que el endpoint de la sección 4 exista y responda `200` para ese host, y
después los logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs caddy | grep -i "on-demand\|ask\|certificate"
```

**Las fotos no cargan.** `S3_PUBLIC_URL` tiene que resolver desde el navegador,
no desde el contenedor. Probá `curl -I https://cdn.TU-DOMINIO/inmobiliaria-media/`
y revisá que `minio-init` haya terminado bien: es quien deja el bucket de
lectura pública.

**La sesión se cae al recargar.** Pasa si la API quedó en otro host que la web.
`VITE_API_URL` tiene que ser `/api`: la cookie de refresh es `sameSite: lax` y
no viaja cross-origin. Se arregla rebuildeando el frontend, porque Vite congela
la variable en el bundle.

**El backend no arranca.** Casi siempre son variables de entorno: valida con Zod
y aborta con el detalle. Miralo:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs backend
```

---

## 10. Antes de cobrar de verdad

El sistema arranca con `PAYMENT_PROVIDER=fake` y `EMAIL_PROVIDER=fake`: se puede
lanzar así y cargar las suscripciones a mano. Para pasar a producción:

1. **Correo** — `EMAIL_PROVIDER=resend` con la API key y el dominio verificado.
   Sin SPF y DKIM configurados los correos van a spam.
2. **Pagos** — `PAYMENT_PROVIDER=mercadopago` con las credenciales de
   producción, y el webhook en el panel de MercadoPago apuntando a
   `https://TU-DOMINIO/api/billing/webhook`. La clave secreta del webhook va en
   `PAYMENT_WEBHOOK_SECRET`: sin ella el backend se niega a arrancar, porque un
   webhook sin firma verificada deja que cualquiera se acredite un pago.

Después de cambiarlas:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```
