# tunnel_php.ps1 - Tunnel APENAS para o browser acessar o PHP local
# O audio binario NUNCA passa por aqui (PHP e GPU sao ambos locais)

$port = 8080
$auth = "vozpro_tunnel_2024"
$serverUpdate = "http://147.15.77.137/update_tunnel.php"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Tunnel PHP Local -> Browser" -ForegroundColor Cyan
Write-Host "  (Audio NAO passa por aqui!)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Verificando PHP na porta $port..." -ForegroundColor Yellow
try {
    $null = Invoke-WebRequest -Uri "http://localhost:$port/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "[OK] PHP Apache respondendo!" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] PHP Apache NAO esta rodando!" -ForegroundColor Red
    Write-Host "Inicie o Apache do XAMPP primeiro." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host ""
Write-Host "[2/2] Abrindo localtunnel..." -ForegroundColor Yellow
Write-Host ""

$outputFile = "$env:TEMP\lt_php_output.txt"
Remove-Item $outputFile -Force -ErrorAction SilentlyContinue

$job = Start-Job -ScriptBlock {
    param($p)
    cmd /c "npx localtunnel --port $p 2>&1" | Out-File -FilePath $using:outputFile -Encoding ascii
} -ArgumentList $port

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
    Write-Host "  PHP LOCAL acessivel em:" -ForegroundColor Green
    Write-Host "  $url" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""

    # Atualiza o config do PHP server (HostGator) para que o Vercel
    # saiba que agora o PHP e LOCAL (usado como fallback)
    try {
        $resp = Invoke-RestMethod -Uri "$serverUpdate`?auth=$auth&url=$url" -TimeoutSec 15
        if ($resp.ok) {
            Write-Host "[OK] URL atualizada no servidor!" -ForegroundColor Green
        }
    } catch {
        Write-Host "[INFO] Nao atualizou servidor remoto (nao precisa)" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "ATENCAO: Este tunnel so transporta JSON!" -ForegroundColor Yellow
    Write-Host "O audio binario fica 100% LOCAL (PHP -> GPU)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Nao feche esta janela." -ForegroundColor Yellow
    Write-Host ""

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
