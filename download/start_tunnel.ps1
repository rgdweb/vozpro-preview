$port = 7860
$auth = "vozpro_tunnel_2024"
$serverUpdate = "https://sorteiomax.com.br/omnivoice/update_tunnel.php"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OmniVoice - Tunnel Automatico" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
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
Write-Host "[2/2] Abrindo localtunnel..." -ForegroundColor Yellow
Write-Host ""

# Rodar localtunnel e capturar a saida
$outputFile = "$env:TEMP\lt_output.txt"
Remove-Item $outputFile -Force -ErrorAction SilentlyContinue

$job = Start-Job -ScriptBlock {
    param($p)
    cmd /c "npx localtunnel --port $p 2>&1" | Out-File -FilePath $using:outputFile -Encoding ascii
} -ArgumentList $port

# Aguardar URL (ate 30 segundos)
$url = $null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $outputFile) {
        $content = Get-Content $outputFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "your url is: (https://[a-z0-9\-]+\.loca\.lt)") {
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

    try {
        $updateUrl = "$serverUpdate?auth=$auth&url=$([System.Web.HttpUtility]::UrlEncode($url))"
        $null = Invoke-WebRequest -Uri $updateUrl -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        Write-Host "[OK] Servidor atualizado automaticamente!" -ForegroundColor Green
    } catch {
        Write-Host "[ERRO] Nao foi possivel atualizar: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "Tunel ativo! Nao feche esta janela." -ForegroundColor Yellow
    Write-Host "Pressione Ctrl+C para parar." -ForegroundColor DarkGray
    Write-Host ""

    # Manter script rodando
    try {
        Wait-Job $job | Out-Null
    } catch {
        Start-Sleep -Seconds 999999
    }
} else {
    Write-Host "[ERRO] Nao conseguiu obter URL" -ForegroundColor Red
    Stop-Job $job -ErrorAction SilentlyContinue
    Read-Host "Pressione Enter para sair"
}
