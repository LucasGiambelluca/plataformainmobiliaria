#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Prepara el VPS para M2Props. Idempotente: se puede volver a correr sin romper
# lo que ya está.
#
# NO levanta la aplicación: eso es update.sh. Este script deja la máquina
# prepared (usuario, directorios, MinIO, base, systemd, nginx) y nada más, para
# que la primera vez y las siguientes hagan lo mismo.
#
#   bash deploy/m2props/install.sh
#
# Es destructivo solo en un sentido: edita el server block del apex para
# agregar un include. Si el include ya está, no lo vuelve a agregar.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR=/opt/m2props
WEB_DIR=/var/www/m2props
DATA_DIR=/var/lib/m2props/minio
CONF_DIR=/etc/m2props
SNIP_DIR=/etc/nginx/snippets
SITE_USER=m2props
DB_NAME=m2props
DB_USER=m2props_app
BACKEND_PORT=3010

# El server block del apex donde se cuelga la app. Es el del sitio estático del
# cliente, así que el include tiene que ir DENTRO de él: dos server blocks con
# el mismo server_name no funcionan, nginx se queda con el primero.
APEX_SITE=/etc/nginx/sites-available/hernandez-landing

# Versiones fijadas, no "latest". Dos razones: MinIO dejó de publicar binarios
# en dl.min.io (responde 410) y el último release de GitHub ya no los trae, así
# que la URL tiene que ser explícita; y aunque los trajera, dl.min.io sirve el
# binario que quiere en el momento, sin que el deploy sea reproducible. El sha256
# se chequea contra el .sha256sum que publica el mismo release.
MINIO_VERSION=RELEASE.2025-07-23T15-54-02Z
MINIO_URL="https://github.com/minio/minio/releases/download/${MINIO_VERSION}/minio.linux-amd64.${MINIO_VERSION}"

log() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Correr como root"; exit 1; }

# ── 1. Usuario de servicio ───────────────────────────────────
log "Usuario $SITE_USER"
if ! id -u "$SITE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SITE_USER"
fi

# ── 2. Directorios ───────────────────────────────────────────
log "Directorios"
install -d -o "$SITE_USER" -g "$SITE_USER" -m 750 "$APP_DIR" "$DATA_DIR"
install -d -o "$SITE_USER" -g "$SITE_USER" -m 755 "$WEB_DIR"
install -d -o root -g "$SITE_USER" -m 750 "$CONF_DIR"
install -d -m 755 "$SNIP_DIR"

# El código pasa a ser del usuario del servicio. Sin esto, `npm ci` como m2props
# falla con EACCES al crear node_modules, porque el clone quedó de root. Es lo
# mismo que hace el otro app del VPS con su propio usuario: cuenta de servicio
# sin shell, que además es dueña de lo que ejecuta.
chown -R "$SITE_USER:$SITE_USER" "$APP_DIR"

# ── 3. MinIO ─────────────────────────────────────────────────
# Binario suelto, no contenedor: este VPS no tiene Docker. Se ata a loopback y
# por eso el único que llega es el nginx local.
log "MinIO"
if [ ! -x /usr/local/bin/minio ]; then
  curl -fsSL -o /tmp/minio "$MINIO_URL"
  curl -fsSL -o /tmp/minio.sha256sum "${MINIO_URL}.sha256sum"
  # Se compara solo el nombre del release contra el archivo: el .sha256sum
  # referencia el nombre del binario, no la ruta de /tmp.
  expected="$(awk '{print $1}' /tmp/minio.sha256sum)"
  actual="$(sha256sum /tmp/minio | awk '{print $1}')"
  [ "$expected" = "$actual" ] || { echo "sha256 de MinIO no coincide: no se instala"; exit 1; }
  install -m 755 /tmp/minio /usr/local/bin/minio
  rm -f /tmp/minio /tmp/minio.sha256sum
fi
/usr/local/bin/minio --version | head -1

# ── 4. Base de datos ─────────────────────────────────────────
# Rol y base propios en el clúster que ya corre: el "desplegador" (Next.js) usa
# otro, y que uno no pueda tocar los datos del otro es justamente el punto.
log "PostgreSQL: rol $DB_USER / base $DB_NAME"
DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
su - postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  END IF;
END
\$\$;
SQL

if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1; then
  su - postgres -c "createdb -O $DB_USER $DB_NAME"
fi

# La contraseña se escribe una sola vez: en un reinstall el rol ya existe y el
# secreto generado no llega a ningún lado. Por eso el env.example la deja como
# CAMBIAR y hay que pegarla a mano.
echo
echo "  Contraseña de $DB_USER: $DB_PASS"
echo "  Anotala en /etc/m2props/backend.env (DATABASE_URL) antes de arrancar."
echo

# ── 5. Unidades systemd ─────────────────────────────────────
log "Unidades systemd"
install -m 644 "$APP_DIR/deploy/m2props/m2props-backend.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/m2props/m2props-minio.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable m2props-minio.service m2props-backend.service

# ── 6. nginx ─────────────────────────────────────────────────
log "nginx"
install -m 644 "$APP_DIR/deploy/m2props/nginx-upstreams.conf" /etc/nginx/conf.d/m2props-upstreams.conf
install -m 644 "$APP_DIR/deploy/m2props/nginx.conf" "$SNIP_DIR/m2props.conf"
install -m 644 "$APP_DIR/deploy/m2props/nginx-headers.conf" "$SNIP_DIR/m2props-headers.conf"

[ -f "$APEX_SITE" ] || { echo "No existe $APEX_SITE: revisá el server block del apex"; exit 1; }

if ! grep -q 'snippets/m2props.conf' "$APEX_SITE"; then
  # El ancla es `location / { try_files $uri $uri/ =404; }`, que aparece UNA sola
  # vez en el archivo: es el fallback del sitio estático del apex, en el server
  # block del 443. Anclar en el primer `location /` del archivo metería el include
  # dentro del server del :80, donde no solo no sirve de nada, sino que además
  # deja la SPA accesible en claro: el 301 de ese bloque no se aplicaría porque
  # los prefix location más largos ganan al `location /` que redirige.
  ANCLA='location / { try_files $uri $uri/ =404; }'
  n="$(grep -cF "$ANCLA" "$APEX_SITE")"
  [ "$n" = "1" ] || { echo "Ancla encontrada $n veces en $APEX_SITE: revisá a mano"; exit 1; }

  sed -i "\|^    ${ANCLA}|i\\    # ── M2Props (plataforma inmobiliaria, ver deploy/m2props/README.md) ──\n    include /etc/nginx/snippets/m2props.conf;\n" "$APEX_SITE"
  echo "  Include agregado a $APEX_SITE (server block del 443)"
else
  echo "  Include ya estaba en $APEX_SITE"
fi

# El include tiene que estar en el bloque del 443 y en ninguno más: si aparece
# dos veces, nginx se queda con el primer server_name que encuentra y el resto
# es warning silencioso. Se verifica por servidor, no por archivo.
dup="$(grep -c 'snippets/m2props.conf' "$APEX_SITE")"
[ "$dup" = "1" ] || { echo "El include aparece $dup veces: revisá a mano"; exit 1; }

nginx -t

log "Listo. Ahora:"
echo "  1. cp deploy/m2props/env.example /etc/m2props/backend.env y completar los secretos"
echo "  2. bash deploy/m2props/update.sh"
echo "  3. systemctl reload nginx   (recién después de que update.sh sirva el front)"
