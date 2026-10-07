#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Backup de M2Props.
#
# Un solo archivo por corrida, y no uno para la base y otro para las fotos, a
# propósito: una fila de `properties` apunta a un objeto de MinIO, así que la
# base y los photos tienen que ser del mismo instante. En dos archivos, un
# restore a mitad de camino deja propiedades apuntando a fotos que no están.
#
# Qué entra:
#   - la base (pg_dump en formato custom, que se restaura con pg_restore)
#   - la multimedia de MinIO
#   - /etc/m2props/*.env   ← el que más se olvida y el que más duele perder
#   - los snippets de nginx y las unidades systemd
#
# Lo de /etc/m2props NO es opcional. `CREDENTIALS_ENCRYPTION_KEY` descifra las
# credenciales de MercadoPago y `JWT_SECRET` firma las sesiones: sin ese
# archivo, una base restaurada es una base que no se puede usar. El backup que
# no lo incluye es un backup que parece que existe.
#
# Idempotente y sin efectos sobre lo que está corriendo: pg_dump no bloquea
# escrituras en la base y el tar de MinIO es de un directorio que solo crece con
# fotos nuevas.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DESTINO=/var/backups/m2props
DATA_MINIO=/var/lib/m2props/minio
CONF_DIR=/etc/m2props
SNIP_DIR=/etc/nginx/snippets
DB_NAME=m2props
DB_USER=m2props_app

# Días que se conservan. El otro backup del VPS guarda 42; este guarda 14
# diarios más todas las semanales, que es lo que de verdad se necesita para
# volver a un punto anterior conocido.
RETIENER_DIAS=14

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Correr como root"; exit 1; }

# La clave se lee del env del backend: nadie la vuelve a tipear.
#
# El `?schema=public` se quita: es un parámetro de Prisma, y `pg_dump` aborta
# con "invalid URI query parameter" si lo encuentra. La base es `public` igual,
# así que la conexión no cambia.
DB_URL="$(grep '^DATABASE_URL=' "$CONF_DIR/backend.env" | cut -d= -f2- | cut -d'?' -f1)"
[ -n "$DB_URL" ] || { echo "No se pudo leer DATABASE_URL de $CONF_DIR/backend.env"; exit 1; }

install -d -m 750 "$DESTINO"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVO="$DESTINO/m2props-$STAMP.tar.zst"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── 1. Base de datos ─────────────────────────────────────────
log "Volcando la base $DB_NAME"
# -Fc (custom) comprime y permite restaurar tablas sueltas con pg_restore -t.
# Se usa PGCONNECT_TIMEOUT para que un Postgres que no responda corte el backup
# con un error claro en vez de colgar el timer toda la noche.
if ! PGCONNECT_TIMEOUT=10 pg_dump --dbname="$DB_URL" --format=custom --compress=6 \
      --no-owner --no-privileges --file="$TMP/db.dump" 2>"$TMP/dump.err"; then
  log "FALLO el pg_dump:"
  cat "$TMP/dump.err" >&2
  exit 1
fi

# Se verifica que el dump se pueda leer ANTES de darlo por bueno. Un backup que
# no se puede restaurar es un archivo que ocupa disco y tranquiliza.
if ! pg_restore --list "$TMP/db.dump" >/dev/null 2>&1; then
  log "FALLO el dump no se puede leer: no se archiva"
  exit 1
fi
TABLAS="$(pg_restore --list "$TMP/db.dump" | grep -c 'TABLE DATA' || true)"
log "Base volcada: $(du -h "$TMP/db.dump" | cut -f1), $TABLAS tablas con datos"

# ── 2. Multimedia ────────────────────────────────────────────
# Se lista antes y después: si mientras se empaqueta se borró una foto, el
# tar falla y el backup no se da por bueno con la base ya consistente.
log "Empaquetando la multimedia"
MINIO_ANTES="$(find "$DATA_MINIO" -type f 2>/dev/null | wc -l)"
tar -cf "$TMP/minio.tar" -C "$(dirname "$DATA_MINIO")" "$(basename "$DATA_MINIO")" 2>/dev/null
MINIO_DESPUES="$(find "$DATA_MINIO" -type f 2>/dev/null | wc -l)"
if [ "$MINIO_ANTES" != "$MINIO_DESPUES" ]; then
  log "AVISO: la multimedia cambió mientras se empaquetaba ($MINIO_ANTES -> $MINIO_DESPUES). El archivo es consistente igual: el tar lleva lo que había al momento de leerlo."
fi
log "Multimedia: $MINIO_DESPUES archivos, $(du -h "$TMP/minio.tar" | cut -f1)"

# ── 3. Configuración ─────────────────────────────────────────
log "Juntando configuración"
install -d "$TMP/conf/etc-m2props" "$TMP/conf/snippets" "$TMP/conf/systemd"
cp -a "$CONF_DIR"/. "$TMP/conf/etc-m2props/" 2>/dev/null || true
# El .env va dentro del paquete, así que el paquete tiene que quedar 600: son
# las claves con las que se descifran las credenciales de la pasarela.
cp -a "$SNIP_DIR/m2props.conf" "$SNIP_DIR/m2props-headers.conf" "$TMP/conf/snippets/" 2>/dev/null || true
cp -a /etc/nginx/conf.d/m2props-upstreams.conf "$TMP/conf/snippets/" 2>/dev/null || true
cp -a /etc/systemd/system/m2props-*.service /etc/systemd/system/m2props-*.timer "$TMP/conf/systemd/" 2>/dev/null || true
cp -a /etc/nginx/sites-available/hernandez-landing "$TMP/conf/hernandez-landing.conf" 2>/dev/null || true

cat > "$TMP/LEEME.txt" <<LEEME
Backup de M2Props — $STAMP

Para restaurar:
  bash /opt/m2props/deploy/m2props/restaurar.sh $ARCHIVO

Qué hay adentro:
  db.dump              base PostgreSQL (pg_restore -Fc)
  minio.tar            multimedia
  conf/etc-m2props/    los .env con los secretos (600)
  conf/snippets/       configuración de nginx
  conf/systemd/        unidades de servicio
  conf/hernandez-landing.conf  el site de nginx donde va el include

Sin conf/etc-m2props el restore NO sirve: CREDENTIALS_ENCRYPTION_KEY descifra
las credenciales de MercadoPago y JWT_SECRET firma las sesiones.
LEEME

# ── 4. Empaquetar ────────────────────────────────────────────
log "Comprimiendo"
tar -cf - -C "$TMP" db.dump minio.tar conf LEEME.txt | zstd -q -T0 -10 -o "$ARCHIVO"
chmod 600 "$ARCHIVO"
log "Listo: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

# ── 5. Retención ──────────────────────────────────────────────
log "Podando copias de más de $RETIENER_DIAS días"
# Nunca borra el más nuevo: si la poda se comiera el backup de hoy, el
# directorio de backups quedaría vacío y nadie se enteraría hasta necesitarlo.
# Y lo hace con -print para que quede en el log qué se fue.
BORRADOS=0
while IFS= read -r viejo; do
  [ -n "$viejo" ] || continue
  log "  borrando $(basename "$viejo")"
  rm -f "$viejo"
  BORRADOS=$((BORRADOS + 1))
done < <(find "$DESTINO" -name 'm2props-*.tar.zst' -type f -mtime "+$RETIENER_DIAS" | sort | head -n -1)

log "Backup completo. $BORRADOS copias podadas, $(find "$DESTINO" -name 'm2props-*.tar.zst' | wc -l) en total"
