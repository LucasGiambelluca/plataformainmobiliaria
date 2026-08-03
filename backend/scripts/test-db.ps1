# Base de datos para los tests de integración.
#
# Vive en el mismo cluster portable que la base de desarrollo pero es OTRA base:
# los tests la truncan entera antes de cada caso, así que apuntarlos a
# `realestate` borraría los datos con los que trabajás.
#
#   .\scripts\test-db.ps1          crea la base si no existe y aplica migraciones
#   .\scripts\test-db.ps1 -Reset   la borra y la vuelve a crear desde cero

param([switch]$Reset)

$ErrorActionPreference = "Stop"

$Bin = Join-Path $env:USERPROFILE "pgsql16\pgsql\bin"
$Db = "realestate_test"
$Url = "postgresql://app:devpassword@localhost:5432/${Db}?schema=public"

if (-not (Test-Path (Join-Path $Bin "psql.exe"))) {
  Write-Error "No encuentro los binarios en $Bin. Corré .\scripts\pg.ps1 status primero."
}

# Un .ps1 corre en el proceso de la consola que lo invoca, no en uno hijo:
# sin restaurar esto al salir, la terminal queda con DATABASE_URL apuntando a
# la base de test y el próximo `npm run dev` en esa misma consola conecta el
# servidor de desarrollo ahí — exactamente el desastre que este script existe
# para evitar.
$urlPrevia = $env:DATABASE_URL
$passPrevia = $env:PGPASSWORD

try {
  $env:PGPASSWORD = "devpassword"

  if ($Reset) {
    # WITH (FORCE) (PG13+, el cluster es 16) cierra conexiones abiertas: sin
    # eso, un psql o un jest olvidado hace fallar el DROP en silencio y
    # -Reset "funciona" sin haber reseteado nada.
    & "$Bin\psql.exe" -U app -h localhost -d postgres -c "DROP DATABASE IF EXISTS $Db WITH (FORCE)"
    if ($LASTEXITCODE -ne 0) { throw "No se pudo borrar $Db." }
  }

  # `createdb` falla si ya existe: se consulta antes para que el script sea idempotente.
  $existe = & "$Bin\psql.exe" -U app -h localhost -d postgres -tAc `
    "SELECT 1 FROM pg_database WHERE datname = '$Db'"
  if ($LASTEXITCODE -ne 0) { throw "No se pudo consultar si $Db existe." }

  if ($existe -ne "1") {
    & "$Bin\createdb.exe" -U app -h localhost $Db
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $Db." }
    Write-Host "Base $Db creada."
  }

  # migrate deploy y no migrate dev: no genera migraciones nuevas ni pide confirmación.
  $env:DATABASE_URL = $Url
  & npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw "Falló prisma migrate deploy sobre $Db." }

  Write-Host "Base de test lista en $Url"
} finally {
  $env:DATABASE_URL = $urlPrevia
  $env:PGPASSWORD = $passPrevia
}
