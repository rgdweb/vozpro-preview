@echo off
title OmniVoice GPU Server
color 0A

echo ============================================
echo   OmniVoice GPU Server - Inicio Automatico
echo ============================================
echo.

:: Ativar conda
call C:\Users\Administrador\Miniconda3\condabin\conda.bat activate base

:: Ir para pasta do script
cd /d "%~dp0"

echo [1/2] Iniciando servidor OmniVoice na porta 8000...
start "OmniVoice API" cmd /k "python omnivoice_api.py"

:: Esperar API subir
timeout /t 8 /nobreak >nul

echo [2/2] Iniciando tunnel cloudflared e registrando no Oracle...
start "Cloudflared Tunnel" cmd /k "python start_tunnel.py"

echo.
echo ============================================
echo   Tudo iniciado! Aguarde o tunnel registrar.
echo   Nao feche essas janelas!
echo ============================================
echo.
pause