#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Puesta en marcha de la plataforma en un VPS Debian/Ubuntu limpio.
#
#   PLATFORM_DOMAIN=midominio.com ACME_EMAIL=vos@midominio.com \
#     bash bootstrap-vps.sh
#
# Qué hace:
#   1. Instala Docker si falta.
#   2. Clona (o actualiza) el repositorio.
#   3. Genera .env.production con secretos aleatorios — SOLO si no existe.
#   4. Levanta el stack y corre las migraciones.
#   5. Siembra planes y super admin con una contraseña aleatoria.
#
# Es idempotente: se puede volver a correr para actualizar. Lo único que nunca
# vuelve a tocar es .env.production — pisar esos secretos dejaría la base
# inaccesible y las credenciales de pasarela ilegibles.
#
# ANTES DE CORRERLO: el DNS de $PLATFORM_DOMAIN, www, *.PLATFORM_DOMAIN y
# cdn.PLATFORM_DOMAIN tiene que resolver a la IP de este VPS. Caddy pide
# certificados apenas levanta, y Let's Encrypt tiene cuota semanal: los
# intentos fallidos se pagan.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${REPO:-https://github.com/LucasGiambelluca/plataformainmobiliaria.git}"
RAMA="${RAMA:-main}"
DESTINO="${DESTINO:-/opt/plataformainmobiliaria}"

info() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$1"; }
aviso(){ printf '\033[1;33m! %s\033[0m\n' "$1"; }
fatal(){ printf '\033[1;31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fatal "Corré esto como root."
: "${PLATFORM_DOMAIN:?Falta PLATFORM_DOMAIN (ej: PLATFORM_DOMAIN=midominio.com)}"
: "${ACME_EMAIL:?Falta ACME_EMAIL (ej: ACME_EMAIL=vos@midominio.com)}"

# ── 1. Docker ────────────────────────────────────────────────
info "Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "ya instalado: $(docker --version)"
else
  aviso "instalando desde get.docker.com…"
  curl -fsSL https://get.docker.com | sh
  ok "instalado: $(docker --version)"
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# ── 2. Código ────────────────────────────────────────────────
info "Código"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" fetch --all --prune
  git -C "$DESTINO" checkout "$RAMA"
  git -C "$DESTINO" pull --ff-only origin "$RAMA"
  ok "actualizado en $DESTINO ($RAMA)"
else
  git clone --branch "$RAMA" "$REPO" "$DESTINO"
  ok "clonado en $DESTINO ($RAMA)"
fi
cd "$DESTINO"

# ── 3. Secretos ──────────────────────────────────────────────
# Nunca se pisa un .env.production existente: ahí viven la contraseña de la
# base y la clave con la que se descifran las credenciales de MercadoPago.
# Regenerarlas dejaría los datos inaccesibles.
info "Configuración de producción"
if [ -f .env.production ]; then
  ok ".env.production ya existe, se respeta tal cual"
  aviso "si agregaste variables nuevas al ejemplo, compará a mano:"
  aviso "  diff <(grep -o '^[A-Z_]*' .env.production.example | sort -u) <(grep -o '^[A-Z_]*' .env.production | sort -u)"
else
  gen() { openssl rand -hex 32; }
  PG_PASS="$(gen)"
  MINIO_PASS="$(gen)"

  cat > .env.production <<EOF
# Generado por bootstrap-vps.sh. Los secretos son aleatorios y únicos de este
# servidor. NO se commitea (está en .gitignore).

PLATFORM_DOMAIN=${PLATFORM_DOMAIN}
CUSTOM_DOMAIN_TARGET=${PLATFORM_DOMAIN}
DNS_RESOLVER=node
ACME_EMAIL=${ACME_EMAIL}
CADDY_ASK_TOKEN=$(gen)

NODE_ENV=production
PORT=3000
LOG_LEVEL=info
FRONTEND_URL=https://${PLATFORM_DOMAIN}
BACKEND_URL=https://${PLATFORM_DOMAIN}

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
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=inmobiliaria-media
S3_ACCESS_KEY_ID=inmobiliaria
S3_SECRET_ACCESS_KEY=${MINIO_PASS}
S3_PUBLIC_URL=https://cdn.${PLATFORM_DOMAIN}/inmobiliaria-media
S3_UPLOAD_URL_TTL_MIN=10
CLOUDINARY_URL=

EMAIL_PROVIDER=fake
EMAIL_API_KEY=
EMAIL_FROM=Entre Rios Propiedades <no-reply@${PLATFORM_DOMAIN}>

# Arranca en fake: se puede operar y cargar suscripciones a mano. Para cobrar
# de verdad, poné mercadopago acá y cargá las credenciales en /admin/pagos —
# NO van en este archivo.
PAYMENT_PROVIDER=fake
# Clave con la que se cifran esas credenciales en la base. NO la cambies nunca:
# si la perdés, hay que volver a cargar las credenciales de MercadoPago.
CREDENTIALS_ENCRYPTION_KEY=$(gen)
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=
EOF
  chmod 600 .env.production
  ok ".env.production generado con secretos aleatorios (permisos 600)"
fi

# ── 4. Stack ─────────────────────────────────────────────────
info "Levantando el stack (build incluido, puede tardar varios minutos)"
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
ok "contenedores arriba"

# ── 5. Datos iniciales ───────────────────────────────────────
# El seed es idempotente: los planes se upsertean y el super admin no se
# recrea si ya existe. Por eso se puede correr en cada actualización.
info "Sembrando planes y super admin"
SEED_PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
SEED_MAIL="admin@${PLATFORM_DOMAIN}"

docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm \
  -e SEED_SUPER_ADMIN_EMAIL="$SEED_MAIL" \
  -e SEED_SUPER_ADMIN_PASSWORD="$SEED_PASS" \
  migrate npx prisma db seed

# ── Cierre ───────────────────────────────────────────────────
info "Estado"
docker compose --env-file .env.production -f docker-compose.prod.yml ps

cat <<FIN

$(ok "Listo.")

  Portal:      https://${PLATFORM_DOMAIN}
  Panel admin: https://${PLATFORM_DOMAIN}/admin

  Super admin: ${SEED_MAIL}
  Contraseña:  ${SEED_PASS}

  ↑ Anotala AHORA: es la única vez que se muestra. Si el super admin ya existía
  de una corrida anterior, su contraseña NO cambió y esta no sirve.

Qué sigue:

  1. Entrar al panel y cambiar la contraseña.
  2. Para cobrar: poner PAYMENT_PROVIDER=mercadopago en .env.production,
     'docker compose --env-file .env.production -f docker-compose.prod.yml up -d',
     y cargar las credenciales en /admin/pagos. La pantalla te da la URL del
     webhook para pegar en el panel de MercadoPago — sin ese paso los pagos
     entran y las suscripciones quedan pendientes para siempre.
  3. Para que salgan los correos: EMAIL_PROVIDER=resend con su API key.

Logs:     docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
Detener:  docker compose --env-file .env.production -f docker-compose.prod.yml down

FIN
