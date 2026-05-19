@echo off
title VozPro GPU Server
echo ============================================
echo   VozPro TTS - Servidor GPU Local
echo ============================================
echo.

echo [1/3] Limpando processos antigos...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Iniciando VozPro Demo (porta 7860)...
start "VozPro GPU" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True && omnivoice-demo --ip 0.0.0.0 --port 7860"
echo      Aguardando 15 segundos...
timeout /t 15 /nobreak >nul

echo [3/3] Iniciando tunel automatico...
start "Tunnel Auto" cmd /k "powershell -ExecutionPolicy Bypass -File start_tunnel.ps1"
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   Pronto!
echo   - Janela "VozPro GPU" = F5-TTS (porta 7860)
echo   - Janela "Tunnel Auto" mostra a URL
echo ============================================
echo.
pause
