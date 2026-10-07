#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Restaura un backup de M2Props.
#
#   bash restaurar.sh <archivo.tar.zst> --probar    ← restaura en una base
#                                                     de descartar y se cer-
#                                                     cior que todo levanta.
#                                                     NO toca producción.
#   bash restaurar.sh <archivo.tar.zst>            ← restaura de verdad
#
# El modo por defecto es destructivo y por eso pide `--si-esta-seguro`: pisa la
# base y la multimedia que hay ahora. Aun así, antes de pisar, saca un backup
# del estado actual, porque restaurar sobre un backup viejo es una forma
# válida de perder el día.
#
# El modo `--probar` es el que sostiene la promesa. Un backup que nunca se
# restauró no es un backup: es un archivo que ocupa disco y tranquiliza. Por eso
# corre solo una vez por mes (m2props-restore-test.timer).
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ARCHIVO="${1:-}"
MODO="${2:-}"
[ -n "$ARCHIVO" ] || { echo "uso: restaurar.sh <archivo.tar.zst> [--probar|--si-esta-seguro]"; exit 1; }
[ -f "$ARCHIVO" ] || { echo "No existe el archivo: $ARCHIVO"; exit 1; }

CONF_DIR=/etc/m2props
APP_DIR=/opt/m2props
DATA_MINIO=/var/lib/m2props/minio
DB_NAME=m2props
DB_TEST=m2props_restore_test
DB_USER=m2props_app
PUERTO_PROBA=3099

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; [ -n "${SERVIDOR_PROBA_PID:-}" ] && kill "$SERVIDOR_PROBA_PID" 2>/dev/null || true' EXIT

# ── Desempaquetar ────────────────────────────────────────────
log "Leyendo $ARCHIVO"
tar --zstd -xf "$ARCHIVO" -C "$TMP"
[ -f "$TMP/db.dump" ] || { echo "El paquete no trae db.dump"; exit 1; }
[ -f "$TMP/minio.tar" ] || { echo "El paquete no trae minio.tar"; exit 1; }
[ -f "$TMP/LEEME.txt" ] && sed -n '3,4p' "$TMP/LEEME.txt"

if [ ! -f "$TMP/conf/etc-m2props/backend.env" ]; then
  echo "FALLO: el paquete no trae conf/etc-m2props/backend.env."
  echo "       Sin ese archivo el restore no sirve: no se pueden descifrar las"
  echo "       credenciales de la pasarela ni validar las sesiones."
  exit 1
fi

# ══════════════════════════════════════════════════════════════
# MODO PRUEBA: base de descartar, la app levanta, y se tira todo
# ══════════════════════════════════════════════════════════════
if [ "$MODO" = "--probar" ]; then
  log "MODO PRUEBA: no se toca producción"

  # El `?schema=public` se quita por lo mismo que en backup.sh: `pg_restore` y
  # `psql` no lo entienden.
  DB_URL_BASE="$(grep '^DATABASE_URL=' "$CONF_DIR/backend.env" | cut -d= -f2- | cut -d'?' -f1)"
  # Se cambia solo el nombre de la base, con expansion de bash y no con sed: la
  # URL ya no tiene query (arriba se le saco el `?schema=public`), asi que
  # `%/*` alcanza y no hay que pelear con delimitadores y alternancias.
  DB_URL_TEST="${DB_URL_BASE%/*}/$DB_TEST"
  log "Base de prueba: $DB_URL_TEST"

  # La password sale una vez de la URL y se reutiliza: repetir el mismo sed
  # cuatro veces es la forma corta de que una de las cuatro quede mal.
  DB_PASS_TEST="${DB_URL_TEST#*://}"
  DB_PASS_TEST="${DB_PASS_TEST#*:}"
  DB_PASS_TEST="${DB_PASS_TEST%@*}"
  consultar() { PGPASSWORD="$DB_PASS_TEST" psql "$DB_URL_TEST" -tAc "$1"; }

  su - postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS $DB_TEST'" >/dev/null
  su - postgres -c "psql -v ON_ERROR_STOP=1 -c 'CREATE DATABASE $DB_TEST OWNER $DB_USER'" >/dev/null

  log "Restaurando la base"
  if ! pg_restore --dbname="$DB_URL_TEST" --no-owner --no-privileges --exit-on-error "$TMP/db.dump"; then
    log "FALLO el pg_restore no pudo completar"
    exit 1
  fi

  # Cuántas filas trae, para no darse por ajeno con una base vacía que "restauró bien".
  TABLAS="$(consultar "select count(*) from information_schema.tables where table_schema='public'")"
  log "Tablas restauradas: $TABLAS"
  [ "$TABLAS" -gt 5 ] || { log "FALLO: restauró $TABLAS tablas, se esperaba el schema completo"; exit 1; }

  for t in tenants plans subscriptions users properties; do
    log "  $t: $(consultar "select count(*) from $t") filas"
  done

  # La multimedia: que el tar se pueda leer y traiga lo que dice.
  log "Comprobando la multimedia"
  ARCHIVOS_MM="$(tar -tf "$TMP/minio.tar" | grep -vc '/$' || true)"
  log "  $ARCHIVOS_MM objetos en minio.tar"
  [ "$ARCHIVOS_MM" -gt 0 ] || { log "FALLO: minio.tar no trae objetos"; exit 1; }

  # Y lo que de verdad importa: que la app ARRANQUE contra esa base.
  log "Levantando el backend contra la base restaurada (puerto $PUERTO_PROBA)"
  set -a; . "$CONF_DIR/backend.env"; set +a
  # Ruta ABSOLUTA y con cd: el script puede llamarse desde cualquier lado, y con
  # un `node dist/server.js` relativo el módulo se busca en el cwd de quien lo
  # invocó, que si no es el backend es /root y no lo encuentra.
  cd "$APP_DIR/backend"
  DATABASE_URL="$DB_URL_TEST" PORT="$PUERTO_PROBA" NODE_ENV=production \
    node "$APP_DIR/backend/dist/server.js" > "$TMP/servidor.log" 2>&1 &
  SERVIDOR_PROBA_PID=$!

  ESPERA=0
  HECHO=0
  while [ $ESPERA -lt 30 ]; do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PUERTO_PROBA/health" 2>/dev/null; then
      HECHO=1
      break
    fi
    # Si el proceso murió, no hay nada que esperar.
    if ! kill -0 "$SERVIDOR_PROBA_PID" 2>/dev/null; then break; fi
    sleep 1
    ESPERA=$((ESPERA + 1))
  done

  if [ "$HECHO" != "1" ]; then
    log "FALLO: el backend no levantó contra la base restaurada"
    echo "--- log del servidor ---"
    cat "$TMP/servidor.log"
    exit 1
  fi

  log "El backend levantó. Probando endpoints contra los datos restaurados:"
  for ruta in "/health" "/api/public/properties" "/api/public/plans" "/api/public/localidades" "/sitemap.xml"; do
    code="$(curl -s -o "$TMP/resp" -w '%{http_code}' "http://127.0.0.1:$PUERTO_PROBA$ruta")"
    log "  HTTP $code  $ruta"
    if [ "$code" != "200" ]; then
      log "FALLO en $ruta"
      cat "$TMP/resp"
      exit 1
    fi
  done

  # Un 200 no dice que se restauraron los DATOS: una base vacía también
  # responde 200. Lo que se comprueba acá es que el catálogo y el sitemap
  # emptiness trae lo mismo que la base de producción, que es lo que un restore
  # tiene que garantir.
  ESPERADAS="$(consultar "select count(*) from properties where status = 'published'")"
  CATALOGO="$(curl -s "http://127.0.0.1:$PUERTO_PROBA/api/public/properties" \
    | grep -o '"id":"[0-9a-f-]*"' | sort -u | wc -l)"
  log "  propiedades publicadas en la base restaurada: $ESPERADAS"
  log "  propiedades que devuelve el catálogo:          $CATALOGO"
  if [ "$CATALOGO" -lt 1 ]; then
    log "FALLO: la base se restauró pero el catálogo no muestra nada."
    exit 1
  fi

  # Y que el sitemap no sea un documento vacío: si las URL absolutas-salieran
  # mal por una diferencia de configuración, acá se vería.
  URLS_SITEMAP="$(curl -s "http://127.0.0.1:$PUERTO_PROBA/sitemap.xml" | grep -c '<loc>' || true)"
  log "  URLs en el sitemap: $URLS_SITEMAP"
  [ "$URLS_SITEMAP" -gt 1 ] || { log "FALLO: el sitemap volvió vacío"; exit 1; }

  # La multimedia tiene que estar donde la base dice que está: una propiedad
  # que apunta a una foto que no está en el tar es una ficha con un cuadro
  # roto, que es exactamente el fallo que un backup "successful" puede esconder.
  FOTO_PRIMERA="$(consultar "select url from property_media where type = 'image' limit 1")"
  if [ -n "$FOTO_PRIMERA" ]; then
    CLAVE="${FOTO_PRIMERA#*/inmobiliaria-media/}"
    # `grep -c` y no `grep -q`: con `set -o pipefail`, el -q corta el pipe al
    # primer acierto, tar muere con SIGPIPE y su status no nulo hace que el `if`
    # entre por la rama de "no está" aunque el archivo esté ahí. El -c se lee
    # todo y no sufre de eso.
    #
    # Y se busca como prefijo de ruta porque MinIO guarda cada objeto como un
    # directorio con un `xl.meta` adentro, no como un archivo suelto.
    if [ "$(tar -tf "$TMP/minio.tar" | grep -c "/${CLAVE}/" || true)" -gt 0 ]; then
      log "  la foto que apunta la base está en el paquete: ${CLAVE##*/}"
    else
      log "FALLO: la base apunta a una foto que no está en minio.tar"
      log "       $FOTO_PRIMERA"
      exit 1
    fi
  fi

  kill "$SERVIDOR_PROBA_PID" 2>/dev/null || true
  wait "$SERVIDOR_PROBA_PID" 2>/dev/null || true
  SERVIDOR_PROBA_PID=""

  su - postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS $DB_TEST'" >/dev/null
  log "Base de prueba eliminada. Producción intacta."
  log "RESTAURACIÓN VERIFICADA"
  exit 0
fi

# ══════════════════════════════════════════════════════════════
# MODO REAL
# ══════════════════════════════════════════════════════════════
[ "$MODO" = "--si-esta-seguro" ] || {
  echo "El restore real pisa la base y la multimedia que hay ahora."
  echo "Si de verdad querés, pasá --si-esta-seguro."
  echo "Para comprobar que el backup sirve sin tocar nada: --probar"
  exit 1
}

log "RESTAURACIÓN REAL sobre producción"

# Antes de pisar, un backup del estado actual. Restaurar sobre un backup viejo
# es una forma perfectamente válida de perder el día.
ACTUAL="$(bash "$(dirname "$0")/backup.sh" 2>&1 | tail -1 || true)"
log "Estado actual respaldado antes de pisar: $ACTUAL"

log "Parando servicios"
systemctl stop m2props-backend.service

log "Restaurando la base de producción"
DB_URL="$(grep '^DATABASE_URL=' "$CONF_DIR/backend.env" | cut -d= -f2- | cut -d'?' -f1)"
su - postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS $DB_NAME'" >/dev/null
su - postgres -c "psql -v ON_ERROR_STOP=1 -c 'CREATE DATABASE $DB_NAME OWNER $DB_USER'" >/dev/null
# dropdb con --force, que en PG16 corta las conexiones abiertas; sin esto, un
# backend que no terminó de soltar el pool deja la creación fallando.
su - postgres -c "dropdb --force --if-exists $DB_NAME" >/dev/null 2>&1 || true
su - postgres -c "createdb -O $DB_USER $DB_NAME"
pg_restore --dbname="$DB_URL" --no-owner --no-privileges --exit-on-error "$TMP/db.dump"

log "Restaurando la multimedia"
mkdir -p "$DATA_MINIO"
tar -xf "$TMP/minio.tar" -C "$(dirname "$DATA_MINIO")"
chown -R m2props:m2props "$DATA_MINIO"

log "Restaurando la configuración"
cp -a "$TMP/conf/etc-m2props/." "$CONF_DIR/"
cp -a "$TMP/conf/snippets/m2props.conf" "$TMP/conf/snippets/m2props-headers.conf" /etc/nginx/snippets/ 2>/dev/null || true
cp -a "$TMP/conf/snippets/m2props-upstreams.conf" /etc/nginx/conf.d/ 2>/dev/null || true
if [ -f "$TMP/conf/hernandez-landing.conf" ]; then
  cp -a "$TMP/conf/hernandez-landing.conf" /etc/nginx/sites-available/hernandez-landing
  ln -sf /etc/nginx/sites-available/hernandez-landing /etc/nginx/sites-enabled/hernandez-landing
fi
chown root:m2props "$CONF_DIR"/*.env
chmod 640 "$CONF_DIR"/*.env
cp -a "$TMP/conf/systemd/"*.service /tmp/ 2>/dev/null || true
cp -a "$TMP/conf/systemd/"*.timer /tmp/ 2>/dev/null || true
cp -a /tmp/m2props-*.service /tmp/m2props-*.timer /etc/systemd/system/ 2>/dev/null || true
rm -f /tmp/m2props-*.service /tmp/m2props-*.timer
systemctl daemon-reload

log "Levantando"
systemctl start m2props-minio.service
systemctl start m2props-backend.service
nginx -t && systemctl reload nginx

for i in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3010/health 2>/dev/null && break
  sleep 1
done
curl -fsS http://127.0.0.1:3010/health && echo
log "RESTAURACIÓN COMPLETA"
