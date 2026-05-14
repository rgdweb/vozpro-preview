@echo off
REM ============================================================
REM OmniVoice GPU Server + Cloudflare Tunnel
REM CORRECAO: Espera o servidor GPU subir com health check
REM em vez de timeout fixo de 15s que causava "abrir 3 vezes"
REM ============================================================

echo.
echo ===================================================
echo    OmniVoice GPU Server + Cloudflare Tunnel
echo ===================================================
echo.

REM Inicia o servidor OmniVoice GPU em background
echo [1/3] Iniciando OmniVoice GPU Server...
start "OmniVoice GPU" /MIN cmd /c "python api_v2.py 2>&1 | tee gpu_server.log"
echo Servidor GPU iniciando em background...

REM Health check - tenta conectar ate o servidor responder
echo [2/3] Aguardando servidor GPU ficar pronto...
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

REM Tenta conectar ao servidor local na porta 7860
curl -s --connect-timeout 2 --max-time 5 http://localhost:7860/ >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Servidor GPU pronto! ^(esperou %WAITED% segundos^)
    set READY=1
    goto start_tunnel
)

REM Mostra progresso
set /a WAITED+=5
if %WAITED%==5 (
    echo Aguardando... 5s
) else if %WAITED%==15 (
    echo Aguardando... 15s
) else if %WAITED%==30 (
    echo Aguardando... 30s
) else if %WAITED%==60 (
    echo Aguardando... 60s ^(se demorar muito, verifique a GPU^)
) else if %WAITED%==90 (
    echo Aguardando... 90s
)

timeout /t 5 /nobreak >nul
goto health_check

:start_tunnel
echo.
echo [3/3] Iniciando Cloudflare Tunnel...
powershell -ExecutionPolicy Bypass -File "%~dp0start_tunnel.ps1"

echo.
echo ===================================================
echo    OmniVoice pronto para uso!
echo ===================================================
echo.
pause
