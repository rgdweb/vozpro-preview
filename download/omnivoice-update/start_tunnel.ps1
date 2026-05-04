# ========================================
# OmniVoice TTS - start_tunnel.ps1
# Abre tunnel cloudflared e atualiza URL no HostGator
# ========================================

$port = 7860
$serverUpdate = "https://sorteiomax.com.br/omnivoice/update_tunnel.php"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OmniVoice - Tunnel Cloudflare" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Encontrar cloudflared ---
$cloudflared = $null
$paths = @(
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        $cloudflared = $p
        break
    }
}

if (-not $cloudflared) {
    try {
        $cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
    } catch {}
}

if (-not $cloudflared) {
    Write-Host "[INFO] Instalando cloudflared via winget..." -ForegroundColor Yellow
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements 2>$null
    try {
        $cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
    } catch {}
}

if ($cloudflared) {
    Write-Host "[OK] cloudflared encontrado: $cloudflared" -ForegroundColor Green
} else {
    Write-Host "[ERRO] cloudflared nao encontrado!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# --- 2. Verificar OmniVoice ---
Write-Host ""
Write-Host "[1/2] Verificando OmniVoice na porta $port..." -ForegroundColor Yellow

try {
    # UseBasicParsing evita o aviso de seguranca
    $test = Invoke-WebRequest -Uri "http://localhost:$port/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "[OK] OmniVoice respondendo!" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] OmniVoice NAO esta rodando na porta $port!" -ForegroundColor Red
    Write-Host "Inicie o OmniVoice primeiro: omnivoice-demo --ip 0.0.0.0 --port $port" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# --- 3. Abrir tunnel ---
Write-Host ""
Write-Host "[2/2] Abrindo tunnel cloudflare..." -ForegroundColor Yellow
Write-Host ""

# Remove arquivo de log anterior
$logFile = "$env:TEMP\cloudflared_tunnel.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

# Inicia o cloudflared com log em arquivo
$processArgs = "tunnel", "--url", "http://localhost:$port", "--logfile", $logFile
$tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList $processArgs -PassThru -WindowStyle Hidden

# Aguarda a URL aparecer no log
$maxWait = 45
$waited = 0
$tunnelUrl = ""

Write-Host "[INFO] Aguardando URL do tunnel..." -ForegroundColor Yellow

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2

    if (Test-Path $logFile) {
        $logContent = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($logContent -match 'https://([a-z0-9\-]+)\.trycloudflare\.com') {
            $tunnelUrl = "https://$($matches[1]).trycloudflare.com"
            break
        }
    }
}

if ($tunnelUrl) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  URL: $tunnelUrl" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERRO] Nao conseguiu obter URL do tunnel em ${maxWait}s" -ForegroundColor Red
    Write-Host "[INFO] Verifique o log: $logFile" -ForegroundColor Yellow
    Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
    Read-Host "Pressione Enter para sair"
    exit 1
}

# --- 4. Atualizar HostGator via GET ---
Write-Host "[INFO] Atualizando servidor HostGator..." -ForegroundColor Yellow

try {
    $encodedUrl = [System.Uri]::EscapeDataString($tunnelUrl)
    $updateUrl = "${serverUpdate}?tunnelUrl=${encodedUrl}"
    
    # Usa System.Net.WebClient (rapido, sem overhead do Invoke-WebRequest)
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("User-Agent", "OmniVoice-Tunnel/1.0")
    $response = $webClient.DownloadString($updateUrl)
    
    $result = $response | ConvertFrom-Json
    
    if ($result.status -eq 'ok') {
        Write-Host "[OK] URL atualizada no HostGator!" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Resposta: $($response)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ERRO] Falha ao atualizar HostGator: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[INFO] Tunnel continua ativo. Atualize manualmente se necessario." -ForegroundColor Yellow
}

# --- 5. Teste final ---
Write-Host ""
Write-Host "[INFO] Testando tunnel..." -ForegroundColor Yellow
try {
    $testResult = Invoke-WebRequest -Uri "$tunnelUrl/" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    Write-Host "[OK] Tunnel respondendo!" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Tunnel pode nao estar pronto ainda, mas esta ativo" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Tunnel ativo! Nao feche esta janela." -ForegroundColor Green
Write-Host "Pressione Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

# Mantem o script rodando enquanto o cloudflared estiver ativo
try {
    $tunnelProcess.WaitForExit()
} catch {
    # Ignora
}

Write-Host "[INFO] Tunnel encerrado." -ForegroundColor Yellow
