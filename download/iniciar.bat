@echo off
title OmniVoice GPU Server
echo ============================================
echo   OmniVoice TTS - Servidor GPU Local
echo ============================================
echo.

echo [0/4] Limpando processos antigos...
:: Matar APENAS o python na porta 7860 (NAO matar todos os python.exe!)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":7860" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [1/4] Ativando Conda...
call C:\Users\Administrador\Miniconda3\Scripts\activate.bat
set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32

echo [1.5/4] Verificando omnivoice_gpu.py...
if not exist omnivoice_gpu.py (
    echo      Baixando do GitHub...
    powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/rgdweb/Omnivoice/main/local-server/omnivoice_gpu.py' -OutFile 'omnivoice_gpu.py'" 2>nul
    if not exist omnivoice_gpu.py (
        echo [ERRO] Nao conseguiu baixar! Verifique sua internet.
        pause
        exit /b 1
    )
    echo      Arquivo baixado com sucesso!
) else (
    echo      Arquivo encontrado!
)

echo [2/4] Iniciando OmniVoice com GPU Limiter (porta 7860)...
start "OmniVoice GPU" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set CUDA_VISIBLE_DEVICES=0 && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32 && python omnivoice_gpu.py --ip 0.0.0.0 --port 7860"

echo      Aguardando servidor GPU ficar pronto...
set WAITED=0

:health_check
if %WAITED% GEQ 120 (
    echo.
    echo [AVISO] GPU demorou mais de 120s, iniciando tunnel mesmo assim...
    goto start_tunnel
)

powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:7860/' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo      Servidor GPU pronto! ^(esperou %WAITED% segundos^)
    goto start_tunnel
)

set /a WAITED+=5
echo      Aguardando... %WAITED%s
timeout /t 5 /nobreak >nul
goto health_check

:start_tunnel
echo.
echo [3/4] Iniciando tunnel Cloudflare...
start "Tunnel Auto" cmd /k "powershell -ExecutionPolicy Bypass -File start_tunnel.ps1"
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   Pronto! Aguarde a janela "Tunnel Auto"
echo ============================================
echo.
pause
