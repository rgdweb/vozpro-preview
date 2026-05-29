$port = 7860
$auth = "vozpro_tunnel_2024"
$serverUpdate = "http://147.15.77.137/update_tunnel.php"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VozPro - Tunnel Automatico" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Verificando VozPro na porta $port..." -ForegroundColor Yellow
$serverReady = $false
for ($tentativa = 0; $tentativa -lt 24; $tentativa++) {
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:$port/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Host "[OK] VozPro respondendo! (tentativa $($tentativa + 1))" -ForegroundColor Green
        $serverReady = $true
        break
    } catch {
        $esperado = ($tentativa + 1) * 5
        Write-Host "  Aguardando... ${esperado}s (VozPro ainda subindo)" -ForegroundColor DarkGray
        Start-Sleep -Seconds 5
    }
}
if (-not $serverReady) {
    Write-Host "[ERRO] VozPro NAO subiu apos 120s! Verifique a janela OmniVoice GPU." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host ""
Write-Host "[2/2] Abrindo Cloudflared Tunnel..." -ForegroundColor Yellow
Write-Host ""

$outputFile = "$env:TEMP\cf_output.txt"
Remove-Item $outputFile -Force -ErrorAction SilentlyContinue

$job = Start-Job -ScriptBlock {
    param($p)
    cmd /c "cloudflared tunnel --url http://localhost:$p 2>&1" | Out-File -FilePath $using:outputFile -Encoding ascii
} -ArgumentList $port

$url = $null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $outputFile) {
        $content = Get-Content $outputFile -Raw -ErrorAction SilentlyContinue
        # Aceita qualquer URL do cloudflared (trycloudflare.com, cfargotunnel.com, etc)
        if ($content -match "(https://[a-z0-9\-\.]+\.cloudflare\.com|[a-z0-9\-\.]+\.trycloudflare\.com|[a-z0-9\-\.]+\.cfargotunnel\.com)") {
            $url = $Matches[1]
            break
        }
        # Fallback: qualquer URL https que contenha palavras tipicas do cloudflared
        if (-not $url -and $content -match "(https://[a-z0-9\-]+\.[a-z0-9\-]+\.(?:com|net|dev|io)[^\s\"'\)]*)") {
            $candidate = $Matches[1]
            # Filtra apenas URLs que parecem do cloudflared (nao localhost, nao oracle)
            if ($candidate -notmatch "localhost|127\.0\.0|147\.15\.77" -and $candidate -match "cloud|tunnel|cf|flare") {
                $url = $candidate
                break
            }
        }
    }
}

if ($url) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  URL: $url" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""

    try {
        $resp = Invoke-RestMethod -Uri "$serverUpdate`?auth=$auth&url=$url" -TimeoutSec 15
        if ($resp.ok -or $resp.status -eq 'ok') {
            Write-Host "[OK] Servidor atualizado automaticamente!" -ForegroundColor Green
        } else {
            Write-Host "[ERRO] $($resp.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "[ERRO] $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "Tunel ativo! Nao feche esta janela." -ForegroundColor Yellow
    Write-Host "Pressione Ctrl+C para parar." -ForegroundColor DarkGray
    Write-Host ""

    try {
        Wait-Job $job | Out-Null
    } catch {
        Start-Sleep -Seconds 999999
    }
} else {
    Write-Host "[ERRO] Nao conseguiu obter URL do Cloudflared." -ForegroundColor Red
    Write-Host "Verifique se o cloudflared esta instalado:" -ForegroundColor Yellow
    Write-Host "  winget install Cloudflare.cloudflared" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[DEBUG] Conteudo capturado do cloudflared:" -ForegroundColor DarkGray
    if (Test-Path $outputFile) {
        Get-Content $outputFile -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    } else {
        Write-Host "  (nenhum output capturado)" -ForegroundColor DarkGray
    }
    Stop-Job $job -ErrorAction SilentlyContinue
    Read-Host "Pressione Enter para sair"
}
