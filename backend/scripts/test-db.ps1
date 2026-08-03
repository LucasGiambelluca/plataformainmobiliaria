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
$Url = "postgresql://app:devpassword@localhost:5432/$Db`?schema=public"

if (-not (Test-Path (Join-Path $Bin "psql.exe"))) {
  Write-Error "No encuentro los binarios en $Bin. Corré .\scripts\pg.ps1 status primero."
}

$env:PGPASSWORD = "devpassword"

if ($Reset) {
  & "$Bin\psql.exe" -U app -h localhost -d postgres -c "DROP DATABASE IF EXISTS $Db"
}

# `createdb` falla si ya existe: se consulta antes para que el script sea idempotente.
$existe = & "$Bin\psql.exe" -U app -h localhost -d postgres -tAc `
  "SELECT 1 FROM pg_database WHERE datname = '$Db'"

if ($existe -ne "1") {
  & "$Bin\createdb.exe" -U app -h localhost $Db
  Write-Host "Base $Db creada."
}

# migrate deploy y no migrate dev: no genera migraciones nuevas ni pide confirmación.
$env:DATABASE_URL = $Url
& npx prisma migrate deploy

Write-Host "Base de test lista en $Url"
