$port = 7860
$auth = "vozpro_tunnel_2024"
$serverUpdate = "https://sorteiomax.com.br/omnivoice/update_tunnel.php"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OmniVoice - Tunnel Cloudflare" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se cloudflared esta instalado
$cloudflared = $null
$pathsToCheck = @(
    "cloudflared",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe",
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "$env:ProgramFiles(x86)\cloudflared\cloudflared.exe",
    "$env:USERPROFILE\cloudflared\cloudflared.exe"
)

foreach ($path in $pathsToCheck) {
    try {
        $result = Get-Command $path -ErrorAction Stop
        $cloudflared = $result.Source
        break
    } catch {
        continue
    }
}

if (-not $cloudflared) {
    Write-Host "[ERRO] cloudflared NAO encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Instale com um dos comandos:" -ForegroundColor Yellow
    Write-Host "  winget install Cloudflare.cloudflared" -ForegroundColor White
    Write-Host "  OU" -ForegroundColor White
    Write-Host "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor White
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "[OK] cloudflared encontrado: $cloudflared" -ForegroundColor Green

Write-Host ""
Write-Host "[1/2] Verificando OmniVoice na porta $port..." -ForegroundColor Yellow
try {
    $null = Invoke-WebRequest -Uri "http://localhost:$port/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "[OK] OmniVoice respondendo!" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] OmniVoice NAO esta rodando!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host ""
Write-Host "[2/2] Abrindo tunnel cloudflare..." -ForegroundColor Yellow
Write-Host ""

$outputFile = "$env:TEMP\cf_output.txt"
Remove-Item $outputFile -Force -ErrorAction SilentlyContinue

$job = Start-Job -ScriptBlock {
    param($p, $cf)
    & $cf tunnel --url "http://localhost:$p" 2>&1 | Out-File -FilePath $using:outputFile -Encoding ascii
} -ArgumentList $port, $cloudflared

$url = $null
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $outputFile) {
        $content = Get-Content $outputFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-z0-9\-]+\.trycloudflare\.com)") {
            $url = $Matches[1]
            break
        }
    }
}

if ($url) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  URL: $url" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""

    # Testar se o tunnel esta funcionando
    Write-Host "[INFO] Testando tunnel..." -ForegroundColor Yellow
    try {
        $null = Invoke-WebRequest -Uri "$url/" -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        Write-Host "[OK] Tunnel respondendo!" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Tunnel pode nao estar respondendo ainda, mas a URL esta ativa" -ForegroundColor DarkYellow
    }

    Write-Host ""
    Write-Host "[INFO] Atualizando servidor HostGator..." -ForegroundColor Yellow
    try {
        $resp = Invoke-RestMethod -Uri "$serverUpdate`?auth=$auth&url=$url" -TimeoutSec 15
        if ($resp.ok) {
            Write-Host "[OK] Servidor atualizado: $($resp.oldUrl) -> $($resp.newUrl)" -ForegroundColor Green
        } else {
            Write-Host "[ERRO] $($resp.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "[ERRO] $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "Tunnel ativo! Nao feche esta janela." -ForegroundColor Yellow
    Write-Host "Pressione Ctrl+C para parar." -ForegroundColor DarkGray
    Write-Host ""

    try {
        Wait-Job $job | Out-Null
    } catch {
        Start-Sleep -Seconds 999999
    }
} else {
    Write-Host "[ERRO] Nao conseguiu obter URL do tunnel" -ForegroundColor Red
    Stop-Job $job -ErrorAction SilentlyContinue
    Read-Host "Pressione Enter para sair"
}
