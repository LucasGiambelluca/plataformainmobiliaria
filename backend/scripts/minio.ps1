# MinIO local sin Docker.
#
# Esta PC no tiene Docker, así que el storage corre desde el binario portable
# en el perfil del usuario. Nada se instaló ni se registró como servicio: para
# desinstalar alcanza con borrar las dos carpetas.
#
#   .\scripts\minio.ps1 start    levanta MinIO (API :9000, consola :9001)
#   .\scripts\minio.ps1 stop     lo baja
#   .\scripts\minio.ps1 status   dice si está corriendo
#   .\scripts\minio.ps1 init     crea el bucket y lo deja de lectura pública
#
# Consola web: http://127.0.0.1:9001 (minioadmin / devminiopassword)
#
# En el VPS esto no se usa: ahí va el servicio `minio` del docker-compose.

param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "init")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"

$Exe = Join-Path $env:USERPROFILE "minio\minio.exe"
$Data = Join-Path $env:USERPROFILE "miniodata"

# Se mira el puerto y no el proceso: entre que se pide el cierre y que el
# proceso desaparece hay una ventana en la que Get-Process todavía lo ve, y
# "está el puerto atendiendo" es lo que realmente importa.
function Running {
  return (Test-NetConnection -ComputerName 127.0.0.1 -Port 9000 `
      -InformationLevel Quiet -WarningAction SilentlyContinue)
}

function WaitFor([bool]$expected, [int]$seconds = 15) {
  foreach ($i in 1..($seconds * 2)) {
    if ((Running) -eq $expected) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

switch ($Action) {
  "start" {
    if (-not (Test-Path $Exe)) {
      Write-Error "No encuentro $Exe. Descargalo de https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
    }
    if (Running) { Write-Output "MinIO ya está corriendo"; break }

    New-Item -ItemType Directory -Force -Path $Data | Out-Null
    # Las credenciales tienen que coincidir con las S3_* del .env.
    $env:MINIO_ROOT_USER = "minioadmin"
    $env:MINIO_ROOT_PASSWORD = "devminiopassword"
    Start-Process -FilePath $Exe `
      -ArgumentList "server", "`"$Data`"", "--address", ":9000", "--console-address", ":9001" `
      -WindowStyle Hidden
    if (WaitFor $true) {
      Write-Output "MinIO levantado en :9000 (consola :9001)"
    } else {
      Write-Error "MinIO no llegó a atender en :9000"
    }
  }
  "stop" {
    Get-Process minio -ErrorAction SilentlyContinue | Stop-Process -Force
    if (WaitFor $false) {
      Write-Output "MinIO detenido"
    } else {
      Write-Error "MinIO sigue atendiendo en :9000"
    }
  }
  "status" {
    if (Running) { Write-Output "MinIO corriendo" } else { Write-Output "MinIO detenido" }
  }
  "init" {
    node (Join-Path $PSScriptRoot "init-bucket.cjs")
  }
}
