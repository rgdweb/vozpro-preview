# ========================================
# OmniVoice TTS - start_tunnel.ps1
# Abre tunnel cloudflared e atualiza URL no HostGator
# Usa GET query string (sem POST body, sem timeout)
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

# Tenta encontrar via comando
if (-not $cloudflared) {
    try {
        $cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
    } catch {
        # Se nao encontrar, tenta instalar
        Write-Host "[INFO] Instalando cloudflared via winget..." -ForegroundColor Yellow
        winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements 2>$null
        $cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
    }
}

if ($cloudflared) {
    Write-Host "[OK] cloudflared encontrado: $cloudflared" -ForegroundColor Green
} else {
    Write-Host "[ERRO] cloudflared nao encontrado!" -ForegroundColor Red
    Write-Host "Instale manualmente: winget install Cloudflare.cloudflared" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# --- 2. Verificar OmniVoice ---
Write-Host ""
Write-Host "[1/2] Verificando OmniVoice na porta $port..." -ForegroundColor Yellow

try {
    $test = Invoke-WebRequest -Uri "http://localhost:$port/" -TimeoutSec 5 -ErrorAction Stop
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

$tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList "tunnel", "--url", "http://localhost:$port" -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\cloudflared_out.txt" -RedirectStandardError "$env:TEMP\cloudflared_err.txt"

# Aguarda a URL aparecer
$maxWait = 30
$waited = 0
$tunnelUrl = ""

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++

    # Lê a saída do cloudflared
    if (Test-Path "$env:TEMP\cloudflared_out.txt") {
        $output = Get-Content "$env:TEMP\cloudflared_out.txt" -Raw -ErrorAction SilentlyContinue
        if ($output -match 'https://([a-z0-9\-]+)\.trycloudflare\.com') {
            $tunnelUrl = "https://$($matches[1]).trycloudflare.com"
            break
        }
    }
}

if ($tunnelUrl) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  URL: $tunnelUrl" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "[ERRO] Nao conseguiu obter URL do tunnel em ${maxWait}s" -ForegroundColor Red
    Write-Host "Verifique a saida do cloudflared em: $env:TEMP\cloudflared_out.txt" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# --- 4. Aguardar tunnel estabilizar ---
Write-Host ""
Write-Host "[INFO] Aguardando tunnel estabilizar..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# --- 5. Atualizar HostGator via GET (simples e sem timeout) ---
Write-Host "[INFO] Atualizando servidor HostGator..." -ForegroundColor Yellow

try {
    # Usa GET com a URL na query string - simples, rapido, sem POST body
    $updateUrl = "${serverUpdate}?tunnelUrl=[System.Web.HttpUtility]::UrlEncode('$tunnelUrl')"
    
    # Comando simples usando System.Net.WebClient (mais rapido que Invoke-WebRequest)
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("User-Agent", "OmniVoice-Tunnel/1.0")
    $webClient.Encoding = [System.Text.Encoding]::UTF8
    
    $response = $webClient.DownloadString("${serverUpdate}?tunnelUrl=$([System.Web.HttpUtility]::UrlEncode($tunnelUrl))")
    
    $result = $response | ConvertFrom-Json
    
    if ($result.status -eq 'ok') {
        Write-Host "[OK] URL atualizada no HostGator!" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Resposta inesperada: $($result.error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ERRO] Falha ao atualizar HostGator: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[INFO] Mas o tunnel continua ativo! Atualize manualmente se necessario." -ForegroundColor Yellow
}

# --- 6. Teste final ---
Write-Host ""
Write-Host "[INFO] Testando tunnel..." -ForegroundColor Yellow
try {
    $testTunnel = Invoke-WebRequest -Uri "$tunnelUrl/" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[OK] Tunnel respondendo!" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Tunnel pode nao estar respondendo ainda, mas a URL esta ativa" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Tunnel ativo! Nao feche esta janela." -ForegroundColor Green
Write-Host "Pressione Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

# Mantém o script rodando
try {
    Wait-Process -Id $tunnelProcess.Id
} catch {
    # Se o processo já terminou
    Write-Host "[INFO] Tunnel encerrado." -ForegroundColor Yellow
}
