@echo off
title VozPro GPU
color 0A
echo ============================================
echo        VozPro - Servidor Local GPU
echo ============================================
echo.

echo [1/2] Limpando processos antigos...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/2] Ativando Conda e iniciando F5-TTS na porta 7860...
start "F5-TTS" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set CUDA_VISIBLE_DEVICES=0 && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32 && omnivoice-demo --ip 0.0.0.0 --port 7860"

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
    echo      Servidor GPU pronto! (esperou %WAITED% segundos)
    goto start_tunnel
)

set /a WAITED+=5
echo      Aguardando... %WAITED%s
timeout /t 5 /nobreak >nul
goto health_check

:start_tunnel
echo.
echo [2/2] Iniciando tunnel LocalTunnel...
start "Tunnel Auto" cmd /k "powershell -ExecutionPolicy Bypass -File start_tunnel.ps1"
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   Pronto! Aguarde a janela "Tunnel Auto"
echo ============================================
echo.
pause
