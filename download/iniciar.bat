@echo off
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
echo      Aguardando 15 segundos...
timeout /t 15 /nobreak >nul

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
