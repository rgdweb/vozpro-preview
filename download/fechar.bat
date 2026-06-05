@echo off
title VozPro - Fechar Tudo
echo ============================================
echo   Fechando VozPro - Todos os servicos
echo ============================================
echo.

echo Parando OmniVoice...
taskkill /F /IM python.exe >nul 2>&1

echo Parando Localtunnel...
taskkill /F /IM node.exe >nul 2>&1

echo Parando Cloudflared...
taskkill /F /IM cloudflared.exe >nul 2>&1

echo Parando Monitor...
taskkill /F /FI "WINDOWTITLE eq Monitor*" >nul 2>&1

timeout /t 2 /nobreak >nul
echo.
echo Tudo fechado!
pause
