# ─────────────────────────────────────────────────────────────
# Levanta la demo completa y la publica por un túnel de ngrok.
#
#   .\scripts\demo-ngrok.ps1                      # URL nueva cada vez
#   .\scripts\demo-ngrok.ps1 -Dominio mi-app.ngrok-free.app   # URL fija
#
# El -Dominio es el dominio estático del plan free de ngrok, el que figura en
# dashboard.ngrok.com → Domains. Con él la URL no cambia entre reinicios.
#
# Qué hace, en orden:
#   1. Baja lo que haya quedado corriendo en 3000, 5173 y 4040.
#   2. Levanta Postgres y MinIO portables si están apagados.
#   3. Abre el túnel y averigua la URL pública.
#   4. Escribe esa URL en las cuatro variables de backend/.env que dependen del
#      host, porque el backend firma las URLs de subida contra ese nombre.
#   5. Levanta backend y frontend, cada uno en su ventana.
#
# El túnel apunta a Vite y no al backend a propósito: vite.config.ts proxea
# /api, /sitemap.xml, /robots.txt y /inmobiliaria-media, así que la SPA, la API
# y las fotos salen por un mismo origen. Es el mismo esquema que deploy/Caddyfile
# en el VPS, y es lo único que hace funcionar la cookie de sesión detrás de un
# túnel de un solo host.
# ─────────────────────────────────────────────────────────────
param(
    [string]$Dominio = ""
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $raiz "backend"
$frontend = Join-Path $raiz "frontend"

function Liberar-Puerto([int]$puerto, [string]$que) {
    $conns = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Write-Host "  bajando $que (PID $($c.OwningProcess))"
        try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop } catch {}
    }
}

Write-Host "`n── Liberando puertos ──" -ForegroundColor Cyan
Liberar-Puerto 3000 "backend"
Liberar-Puerto 5173 "frontend"
Liberar-Puerto 4040 "ngrok"

Write-Host "`n── Base y storage ──" -ForegroundColor Cyan
# Solo si no están escuchando: `pg_ctl start` contra un cluster ya levantado
# falla, y no hay motivo para reiniciar la base entre demos.
function Escuchando([int]$puerto) {
    [bool](Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue)
}
if (Escuchando 5432) { Write-Host "  Postgres ya está arriba" }
else { & (Join-Path $backend "scripts\pg.ps1") start }
if (Escuchando 9000) { Write-Host "  MinIO ya está arriba" }
else { & (Join-Path $backend "scripts\minio.ps1") start }

Write-Host "`n── Túnel ──" -ForegroundColor Cyan
$argsNgrok = if ($Dominio) { "http 5173 --url=$Dominio" } else { "http 5173" }
Start-Process -FilePath "ngrok" -ArgumentList $argsNgrok -WindowStyle Minimized

# El agente tarda un par de segundos en registrar el túnel; su API local es la
# única fuente confiable de la URL asignada.
$url = $null
foreach ($i in 1..20) {
    Start-Sleep -Milliseconds 700
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
        $url = ($r.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
        if ($url) { break }
    } catch {}
}
if (-not $url) { throw "El túnel no levantó. Mirá la ventana de ngrok." }
Write-Host "  $url" -ForegroundColor Green

Write-Host "`n── backend\.env ──" -ForegroundColor Cyan
$envPath = Join-Path $backend ".env"
$lineas = Get-Content $envPath
$lineas = $lineas `
    -replace '^FRONTEND_URL=.*', "FRONTEND_URL=$url" `
    -replace '^BACKEND_URL=.*', "BACKEND_URL=$url" `
    -replace '^S3_ENDPOINT=.*', "S3_ENDPOINT=$url" `
    -replace '^S3_PUBLIC_URL=.*', "S3_PUBLIC_URL=$url/inmobiliaria-media"
Set-Content -Path $envPath -Value $lineas -Encoding UTF8
Write-Host "  cuatro variables apuntando al túnel"

Write-Host "`n── Servidores ──" -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c title backend && npx tsx watch src/server.ts" -WorkingDirectory $backend -WindowStyle Minimized
Start-Process -FilePath "cmd.exe" -ArgumentList "/c title frontend && npx vite" -WorkingDirectory $frontend -WindowStyle Minimized

foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    $ok = $false
    try { $ok = (Invoke-WebRequest "http://localhost:3000/health" -TimeoutSec 2).StatusCode -eq 200 } catch {}
    if ($ok) { break }
}

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Green
Write-Host " Demo arriba:  $url" -ForegroundColor Green
Write-Host " Login:        $url/login"
Write-Host " Contraseña:   Demo1234!"
Write-Host "   super admin        admin@plataforma.com"
Write-Host "   admin inmobiliaria costa@demo.com"
Write-Host "════════════════════════════════════════════`n" -ForegroundColor Green
