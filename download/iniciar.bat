@echo off
title OmniVoice GPU Server
echo ============================================
echo   OmniVoice TTS - Servidor GPU Local
echo ============================================
echo.

echo [0/3] Ativando Conda...
call C:\Users\Administrador\Miniconda3\Scripts\activate.bat
set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

echo [1/3] Iniciando OmniVoice Demo (porta 7860)...
start "OmniVoice GPU" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True && omnivoice-demo --ip 0.0.0.0 --port 7860"
echo      Aguardando 15 segundos...
timeout /t 15 /nobreak >nul

echo [2/3] Iniciando tunel automatico...
start "Tunnel Auto" cmd /k "node start_tunnel.js"
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   Pronto! O tunel atualiza o servidor
echo   automaticamente. Pode fechar esta janela.
echo ============================================
echo.
pause
