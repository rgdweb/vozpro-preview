@echo off
title VozPro GPU
color 0A
echo ============================================
echo        VozPro - Servidor Local GPU
echo ============================================
echo.

set CUDA_VISIBLE_DEVICES=0
set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32

echo [1/2] Iniciando F5-TTS na porta 7860...
start "F5-TTS" /B cmd /c "python -m f5_tts.infer_cli_gradio --port 7860 2>&1"

timeout /t 5 /nobreak >nul

echo [2/2] Iniciando Tunnel...
start "Tunnel" /B cmd /c "npx localtunnel --port 7860 2>&1"

echo.
echo ============================================
echo   Servidor iniciado! Aguarde o tunnel gerar a URL
echo ============================================
timeout /t 999999
