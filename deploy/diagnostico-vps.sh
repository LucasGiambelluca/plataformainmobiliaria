#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Diagnóstico del VPS. SOLO LECTURA: no instala, no borra, no levanta nada.
#
# Correlo antes del bootstrap para saber contra qué estamos jugando. Si ya hay
# un despliegue con datos, el orden correcto cambia por completo — primero
# backup, después tocar.
#
#   bash diagnostico-vps.sh
#
# Pegame la salida entera y armo el plan sobre eso.
# ─────────────────────────────────────────────────────────────
set -uo pipefail

titulo() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

titulo "Sistema"
(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || echo "distro desconocida"
echo "kernel:    $(uname -r)"
echo "arch:      $(uname -m)"
echo "uptime:    $(uptime -p 2>/dev/null || echo '?')"

titulo "Recursos"
echo "CPU:  $(nproc) núcleos"
free -h 2>/dev/null | awk 'NR<=2'
echo "Disco:"
df -h / 2>/dev/null | awk 'NR<=2'

titulo "Docker"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || echo "compose v2 NO disponible"
else
  echo "Docker NO instalado"
fi

titulo "Contenedores corriendo"
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo "no se pudo listar"
else
  echo "—"
fi

titulo "Volúmenes de Docker (acá viven los datos)"
if command -v docker >/dev/null 2>&1; then
  docker volume ls 2>/dev/null || echo "no se pudo listar"
else
  echo "—"
fi

titulo "Puertos escuchando en 80 / 443 / 3000 / 5432"
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ':(80|443|3000|5432)\b' || echo "ninguno ocupado"

titulo "Servicios que podrían pelear por el puerto 80"
for s in nginx apache2 caddy httpd; do
  if systemctl is-active --quiet "$s" 2>/dev/null; then
    echo "ACTIVO: $s  ← hay que apagarlo antes de levantar Caddy"
  fi
done
echo "(sin líneas arriba = ninguno molesta)"

titulo "Despliegue previo del proyecto"
for d in /opt/plataformainmobiliaria /root/plataformainmobiliaria /srv/plataformainmobiliaria; do
  [ -d "$d" ] && echo "encontrado: $d"
done
echo "(sin líneas arriba = instalación nueva)"

titulo "PostgreSQL instalado fuera de Docker"
command -v psql >/dev/null 2>&1 && psql --version || echo "no hay cliente psql en el host"
systemctl is-active --quiet postgresql 2>/dev/null && echo "ACTIVO: servicio postgresql del sistema" || echo "sin servicio postgresql del sistema"

titulo "IP pública"
curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "no se pudo averiguar"
echo

titulo "Listo"
echo "Pegá TODA esta salida en el chat."
