#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Construye y publica M2Props. Es el paso que se repite en cada update.
#
#   bash deploy/m2props/update.sh
#
# Idempotente y con salida en dos etapas: primero deja los servicios andando con
# el backend nuevo, y recién al final recarga el nginx. Si el build del frontend
# falla, el nginx sigue sirviendo el bundle anterior y nadie se queda sin web a
# mitad de un deploy.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR=/opt/m2props
WEB_DIR=/var/www/m2props
DATA_DIR=/var/lib/m2props/minio
CONF_DIR=/etc/m2props
SITE_USER=m2props
BASE_PATH=/m2props
# Sin esquema: se usa para armar la URL del mensaje final, y las variables de
# entorno ya lo traen.
ORIGIN=hernandezyasociados.com.ar
# El usuario de servicio tiene su home en $APP_DIR, así que sin esto npm deja
# .npm y .cache adentro del repo y `git status` queda sucio después de cada
# update.
NPM_CACHE=/var/cache/m2props-npm

# mc solo se usa para crear el bucket. Versión fijada por lo mismo que MinIO en
# install.sh: dl.min.io ya no publica binarios.
MC_VERSION=RELEASE.2025-08-13T08-35-41Z

install -d -o "$SITE_USER" -g "$SITE_USER" -m 750 "$NPM_CACHE"

log() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Correr como root"; exit 1; }
cd "$APP_DIR"

# ── 1. Dependencias y build del backend ──────────────────────
log "Backend: dependencias, Prisma client y TypeScript"
cd "$APP_DIR/backend"
# Con devDependencies y no con --omit=dev, a diferencia de la imagen del compose:
# acá el mismo node_modules tiene que servir para `prisma migrate deploy` y para
# correr scripts con tsx. Son los dos comandos que hacen falta en una
# actualización, y el disco no es el problema.
sudo -u m2props npm ci --no-audit --no-fund --cache "$NPM_CACHE"
sudo -u m2props npx prisma generate
sudo -u m2props npm run build

# ── 2. Migraciones ───────────────────────────────────────────
# Antes que el backend nuevo, y no en el mismo paso: si una migración falla, el
# backend viejo sigue corriendo contra el schema viejo, que es el estado
# consistente. Recién con las migraciones aplicadas se reinicia.
log "Migraciones"
set -a; . "$CONF_DIR/backend.env"; set +a
sudo -u m2props -E npx prisma migrate deploy

# ── 3. Bucket de MinIO ───────────────────────────────────────
# Idempotente. Se hace antes de reiniciar el backend porque sin bucket el primer
# PUT de una foto falla y el error que ve el usuario no dice nada de MinIO.
log "Bucket de MinIO"
systemctl start m2props-minio.service
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null http://127.0.0.1:9000/minio/health/live; then break; fi
  sleep 1
done

# Credenciales de MinIO y datos del backend, cada uno de su archivo: son
# secretos distintos y no tiene sentido mezclarlos.
set -a; . "$CONF_DIR/minio.env"; . "$CONF_DIR/backend.env"; set +a

mc_dir="$(mktemp -d)"
mc_bin="$mc_dir/mc"
curl -fsSL -o "$mc_bin" "https://github.com/minio/mc/releases/download/${MC_VERSION}/mc.linux-amd64.${MC_VERSION}"
curl -fsSL -o "$mc_dir/mc.sha256sum" "https://github.com/minio/mc/releases/download/${MC_VERSION}/mc.linux-amd64.${MC_VERSION}.sha256sum"
expected="$(awk '{print $1}' "$mc_dir/mc.sha256sum")"
[ "$expected" = "$(sha256sum "$mc_bin" | awk '{print $1}')" ] || {
  echo "sha256 de mc no coincide"; exit 1;
}
chmod +x "$mc_bin"
"$mc_bin" alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
"$mc_bin" mb --ignore-existing "local/$S3_BUCKET" >/dev/null
# El bucket es de lectura pública: las fotos de las propiedades salen en catálogos
# abiertos. La escritura sigue exigiendo URL firmada.
"$mc_bin" anonymous set download "local/$S3_BUCKET" >/dev/null
rm -rf "$mc_dir"
echo "  bucket $S3_BUCKET listo"

# ── 4. Backend ───────────────────────────────────────────────
log "Backend"
set -a; . "$CONF_DIR/backend.env"; set +a
systemctl restart m2props-backend.service
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/health"; then break; fi
  sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/health" && echo

# ── 5. Frontend ──────────────────────────────────────────────
# Con VITE_BASE_PATH: es lo que hace que los assets se pidan bajo /m2props y no
# en la raíz del host, donde vive el sitio estático del cliente. Vite congela la
# variable en el bundle, así que cambiarla es rebuild: no alcanza con reiniciar.
log "Frontend"
cd "$APP_DIR/frontend"
sudo -u m2props npm ci --no-audit --no-fund --cache "$NPM_CACHE"
# OJO con la barra de $BASE_PATH: ya la tiene. "/$BASE_PATH/api" daba
# "//m2props/api", que el browser resuelve como URL protocol-relative y manda a
# https://m2props/api — un host que no existe. El síntoma es que la web carga
# entera y solo el login falla con "no se pudo conectar", porque la petición
# nunca sale de la máquina.
case "$BASE_PATH" in
  /) API_PATH=/api ;;
  *) API_PATH="$BASE_PATH/api" ;;
esac
sudo -u m2props env \
  VITE_BASE_PATH="$BASE_PATH" \
  VITE_API_URL="$API_PATH" \
  VITE_PLATFORM_DOMAIN=hernandezyasociados.com.ar \
  npm run build

# ── 5b. Guard del bundle ─────────────────────────────────────
# Vite congela estas variables y no avisa si quedan mal: una barra de más en la
# URL de la API produce un bundle perfectamente válido que manda las peticiones a
# un host inexistente, y el único síntoma es que la web carga y el login no. Sale
# más barato comprobarlo acá que diagnosticar eso en producción.
log "Verificando el bundle"
BUNDLE="$(ls "$APP_DIR/frontend/dist/assets/"index-*.js | head -1)"

# Con al menos un carácter de host después de las barras: un "//" a secas
# aparece en el bundle (viene de alguna librería de URLs) y no es una URL
# protocol-relative, solo una cadena vacía.
if grep -qE '"//[a-zA-Z0-9]' "$BUNDLE"; then
  echo "ERROR: el bundle tiene una URL protocol-relative (\"//host/...)."
  echo "       El browser la resuelve como otro dominio y la API no llega nunca."
  grep -oE '"//[a-zA-Z0-9][^"]{0,60}' "$BUNDLE" | sort -u | head
  exit 1
fi

if ! grep -q "$API_PATH" "$BUNDLE"; then
  echo "ERROR: la URL de la API ($API_PATH) no aparece en el bundle."
  echo "       ¿Quedó VITE_API_URL sin pasar al build?"
  exit 1
fi

echo "  bundle OK"

# Se arma en un directorio aparte y se mueve con un rename: si el build quedó a
# medias, el nginx nunca ve un dist a medio escribir.
log "Publicando estáticos"
STAGE="$(mktemp -d)"
cp -r "$APP_DIR/frontend/dist/." "$STAGE/"
chown -R "$SITE_USER:$SITE_USER" "$STAGE"
find "$STAGE" -type d -exec chmod 755 {} +
find "$STAGE" -type f -exec chmod 644 {} +
rm -rf "${WEB_DIR:?}.new"
mv "$WEB_DIR" "${WEB_DIR}.old"
mv "$STAGE" "$WEB_DIR"
rm -rf "${WEB_DIR}.old"

# ── 6. nginx ─────────────────────────────────────────────────
# Al final y no antes: hasta acá el bundle nuevo no estaba en disco, y recargar
# antes habría SERVIDO un index.html que apunta a assets que todavía no existen.
# Las imágenes de public/ (el logo, el hero) se referencian desde el código, no
# desde el index.html, así que el base de Vite no las alcanza: van envueltas con
# conBase(). No se puede verificar con un grep sobre el bundle, porque el
# minificador deja la ruta sin prefijo como argumento de la llamada y eso es
# indistinguible de un src="/..." hardcodeado. Lo que sí se puede es pedir la
# URL como la va a pedir el browser, que es el 404 que se veía en pantalla.
log "Comprobando los assets públicos"
FALLAS=0
while IFS= read -r asset; do
  rel="${asset#$WEB_DIR/}"
  url="https://$ORIGIN$BASE_PATH/$rel"
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
  if [ "$code" != "200" ]; then
    echo "  FALLA $code $url"
    FALLAS=$((FALLAS + 1))
  else
    echo "  ok $rel"
  fi
done < <(find "$WEB_DIR/brand" "$WEB_DIR" -maxdepth 1 -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.svg' -o -name '*.webp' -o -name 'favicon*' \) 2>/dev/null | sort -u)

if [ "$FALLAS" -gt 0 ]; then
  echo "ERROR: $FALLAS assets de public/ no responden bajo $BASE_PATH."
  echo "       Suelen ser rutas absolutas en el código: usá conBase()."
  exit 1
fi

log "nginx"
nginx -t
systemctl reload nginx

log "Listo. https://$ORIGIN$BASE_PATH/"
