# PostgreSQL local sin Docker.
#
# Esta PC no tiene Docker, así que el cluster corre desde binarios portables
# instalados en el perfil del usuario. Nada se registró como servicio ni se
# tocó el registro: para desinstalar alcanza con borrar las dos carpetas.
#
#   .\scripts\pg.ps1 start    levanta el servidor en localhost:5432
#   .\scripts\pg.ps1 stop     lo baja
#   .\scripts\pg.ps1 status   dice si está corriendo
#   .\scripts\pg.ps1 psql     abre una consola SQL sobre la base realestate
#
# En el VPS esto no se usa: ahí va PostgreSQL como servicio del sistema.

param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "psql")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$Bin = Join-Path $env:USERPROFILE "pgsql16\pgsql\bin"
$Data = Join-Path $env:USERPROFILE "pgdata16"
$Log = Join-Path $Data "server.log"

if (-not (Test-Path (Join-Path $Bin "pg_ctl.exe"))) {
  Write-Error "No encuentro los binarios en $Bin. Reinstalá PostgreSQL o ajustá la ruta."
}

switch ($Action) {
  "start" {
    # -o "-p 5432" fija el puerto que espera DATABASE_URL del .env.
    & "$Bin\pg_ctl.exe" -D $Data -l $Log -o "-p 5432" start
    Start-Sleep -Seconds 2
    & "$Bin\pg_ctl.exe" -D $Data status
  }
  "stop" {
    & "$Bin\pg_ctl.exe" -D $Data -m fast stop
  }
  "status" {
    & "$Bin\pg_ctl.exe" -D $Data status
  }
  "psql" {
    $env:PGPASSWORD = "devpassword"
    & "$Bin\psql.exe" -h 127.0.0.1 -p 5432 -U app -d realestate
  }
}
