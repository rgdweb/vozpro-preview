@echo off
REM ============================================================
REM OmniVoice GPU Server + Cloudflare Tunnel
REM CORRECAO (15/05/2026): Substituido timeout fixo de 15s
REM por health check que verifica se o servidor GPU subiu
REM (resolve o bug de "precisar abrir 3 vezes")
REM ============================================================
title OmniVoice GPU Server
echo ============================================
echo   OmniVoice TTS - Servidor GPU Local
echo ============================================
echo.

echo [0/4] Limpando processos antigos...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [1/4] Ativando Conda...
call C:\Users\Administrador\Miniconda3\Scripts\activate.bat
set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

echo [2/4] Iniciando OmniVoice Demo (porta 7860)...
start "OmniVoice GPU" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True && omnivoice-demo --ip 0.0.0.0 --port 7860"

REM Health check - tenta conectar ate o servidor responder (max 120s)
echo      Aguardando servidor GPU ficar pronto...
set MAX_WAIT=120
set WAITED=0
set READY=0

:health_check
if %WAITED% GEQ %MAX_WAIT% (
    echo.
    echo [AVISO] Servidor GPU nao respondeu em %MAX_WAIT% segundos
    echo Verifique se o Python e as dependencias estao instalados.
    echo.
    goto start_tunnel
)

curl -s --connect-timeout 2 --max-time 5 http://localhost:7860/ >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo      Servidor GPU pronto! ^(esperou %WAITED% segundos^)
    set READY=1
    goto start_tunnel
)

set /a WAITED+=5
if %WAITED%==5 (
    echo      Aguardando... 5s
) else if %WAITED%==15 (
    echo      Aguardando... 15s
) else if %WAITED%==30 (
    echo      Aguardando... 30s
) else if %WAITED%==60 (
    echo      Aguardando... 60s ^(se demorar muito, verifique a GPU^)
) else if %WAITED%==90 (
    echo      Aguardando... 90s
)

timeout /t 5 /nobreak >nul
goto health_check

:start_tunnel
echo.
echo [3/4] Iniciando tunnel Cloudflare (mais estavel que loca.lt)...
start "Tunnel Auto" cmd /k "powershell -ExecutionPolicy Bypass -File start_tunnel.ps1"
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   Pronto! Aguarde a janela "Tunnel Auto"
echo   URL: xxx.trycloudflare.com
echo   Sem pagina "Click to Continue"!
echo ============================================
echo.
pause
