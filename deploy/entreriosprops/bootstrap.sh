#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Pone la plataforma en un VPS que YA tiene otro Caddy sirviendo otros sitios.
#
#   bash deploy/entreriosprops/bootstrap.sh
#
# Se corre desde la raíz del proyecto, en el VPS. Es idempotente: no pisa un
# .env.production existente ni vuelve a crear datos que ya estén.
#
# Lo que NO hace: tocar el Caddyfile del host. Ese archivo sirve seis sitios en
# producción y un script no tiene por qué editarlo a ciegas — al final imprime
# el bloque exacto para agregar, con su validación.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${DOMINIO:-entreriosprops.stocksystemspp.com}"
COMPOSE="deploy/entreriosprops/docker-compose.vps.yml"
RED_BORDE="${RED_BORDE:-stocksystem_stock-network}"

info() { printf '\n\033[1;36m── %s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$1"; }
aviso() { printf '\033[1;33m!\033[0m %s\n' "$1"; }
morir() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# ── 1. Requisitos ────────────────────────────────────────────
info "Requisitos"
command -v docker >/dev/null 2>&1 || morir "falta Docker"
docker compose version >/dev/null 2>&1 || morir "falta docker compose v2"
command -v openssl >/dev/null 2>&1 || morir "falta openssl"
[ -f "$COMPOSE" ] || morir "corré esto desde la raíz del proyecto (no encuentro $COMPOSE)"
docker network inspect "$RED_BORDE" >/dev/null 2>&1 \
  || morir "no existe la red '$RED_BORDE'. Es la del Caddy del host: sin ella el proxy no llega a los contenedores."
ok "docker ok, red '$RED_BORDE' presente"

# El build de Vite y `prisma generate` en un VPS de 1 núcleo se comen la RAM. Sin
# swap, el kernel elige una víctima y puede ser un contenedor de otro sitio.
if ! swapon --show 2>/dev/null | grep -q .; then
  aviso "este servidor NO tiene swap. El build puede disparar el OOM killer y"
  aviso "matar contenedores de los otros sitios. Recomendado antes de seguir:"
  aviso "  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
fi

# ── 2. Configuración ─────────────────────────────────────────
# Nunca se pisa un .env.production existente: ahí viven la contraseña de la
# base y CREDENTIALS_ENCRYPTION_KEY. Regenerarlas deja datos inaccesibles.
info "Configuración"
if [ -f .env.production ]; then
  ok ".env.production ya existe, se respeta tal cual"
else
  gen() { openssl rand -hex 32; }
  PG_PASS="$(gen)"
  MINIO_PASS="$(gen)"

  cat > .env.production <<EOF
# Generado por deploy/entreriosprops/bootstrap.sh. Secretos aleatorios y únicos
# de este servidor. NO se commitea.

PLATFORM_DOMAIN=${DOMINIO}
CUSTOM_DOMAIN_TARGET=${DOMINIO}
DNS_RESOLVER=node
# Sin on-demand TLS: el Caddy del host tiene un bloque explícito para este
# dominio, así que nadie le pregunta al backend si puede emitir un certificado.
CADDY_ASK_TOKEN=

NODE_ENV=production
PORT=3000
LOG_LEVEL=info
FRONTEND_URL=https://${DOMINIO}
BACKEND_URL=https://${DOMINIO}

POSTGRES_USER=app
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=realestate
DATABASE_URL=postgresql://app:${PG_PASS}@postgres:5432/realestate?schema=public

JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH_EXPIRES_IN=7d

STORAGE_PROVIDER=s3
MINIO_ROOT_USER=inmobiliaria
MINIO_ROOT_PASSWORD=${MINIO_PASS}
# ¡OJO! S3_ENDPOINT tiene que ser la URL PÚBLICA, no http://minio:9000. El
# backend firma la URL de subida y se la manda al navegador, que hace el PUT
# directo: SigV4 incluye el Host en la firma, así que un host interno produce
# una URL que el navegador no puede resolver y toda subida de foto falla.
S3_ENDPOINT=https://${DOMINIO}
S3_REGION=us-east-1
S3_BUCKET=inmobiliaria-media
S3_ACCESS_KEY_ID=inmobiliaria
S3_SECRET_ACCESS_KEY=${MINIO_PASS}
S3_PUBLIC_URL=https://${DOMINIO}/inmobiliaria-media
S3_UPLOAD_URL_TTL_MIN=10
CLOUDINARY_URL=

EMAIL_PROVIDER=fake
EMAIL_API_KEY=
EMAIL_FROM=Entre Rios Propiedades <no-reply@${DOMINIO}>

PAYMENT_PROVIDER=fake
CREDENTIALS_ENCRYPTION_KEY=$(gen)
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=

INDEX_PROVIDER=oficial
INDEX_TTL_HORAS=12
EOF
  chmod 600 .env.production
  ok ".env.production generado (permisos 600)"
fi

# ── 3. Stack ─────────────────────────────────────────────────
info "Levantando el stack (build incluido, tarda varios minutos en 1 núcleo)"
docker compose --env-file .env.production -f "$COMPOSE" up -d --build
ok "contenedores arriba"

# ── 4. Datos ─────────────────────────────────────────────────
# Primero los planes y el super admin (idempotente), después la demo.
info "Sembrando planes y super admin"
docker compose --env-file .env.production -f "$COMPOSE" \
  run --rm migrate npx prisma db seed

info "Sembrando datos de demostración"
docker compose --env-file .env.production -f "$COMPOSE" \
  run --rm migrate npx tsx scripts/seed-demo.ts

# ── Cierre ───────────────────────────────────────────────────
info "Estado"
docker compose --env-file .env.production -f "$COMPOSE" ps

cat <<FIN

$(ok "Stack arriba. Falta el borde, que se hace a mano sobre el Caddyfile del host.")

  1. Agregar deploy/entreriosprops/Caddyfile.snippet al final de
     /opt/stocksystem/Caddyfile (hacé backup antes).
  2. docker exec stock-caddy caddy validate --config /etc/caddy/Caddyfile
  3. docker exec stock-caddy caddy reload  --config /etc/caddy/Caddyfile

Después:

  https://${DOMINIO}/          portal
  https://${DOMINIO}/admin     panel de super admin

  admin@plataforma.com / Demo1234!   (super admin)
  costa@demo.com       / Demo1234!   (inmobiliaria)

FIN
