@echo off
title OmniVoice - Servidor LOCAL Completo
echo ============================================
echo   OmniVoice TTS - Tudo LOCAL (Zero Tunnel!)
echo ============================================
echo.
echo   GPU + PHP na mesma maquina = audio perfeito
echo.

:: =====================
:: PASSO 0: LIMPAR PROCESSOS ANTIGOS
:: =====================
echo [0/5] Limpando processos antigos...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: =====================
:: PASSO 1: INICIAR APACHE (PHP) NO XAMPP
:: =====================
echo [1/5] Iniciando PHP Apache (XAMPP)...
set XAMPP_PATH=C:\xampp

:: Verifica se XAMPP existe
if not exist "%XAMPP_PATH%\apache\bin\httpd.exe" (
    echo.
    echo [ERRO] XAMPP nao encontrado em %XAMPP_PATH%
    echo Instale o XAMPP em C:\xampp
    echo Download: https://www.apachefriends.org/download.html
    echo.
    pause
    exit /b 1
)

:: Inicia Apache
start "" "%XAMPP_PATH%\apache_start.bat" >nul 2>&1
:: Alternativa se o bat nao funcionar:
if %ERRORLEVEL% neq 0 (
    start "" "%XAMPP_PATH%\apache\bin\httpd.exe" >nul 2>&1
)
timeout /t 3 /nobreak >nul
echo      Apache iniciado na porta 8080

:: =====================
:: PASSO 2: ATIVAR CONDA + INICIAR OMNIVOICE
:: =====================
echo [2/5] Ativando Conda + Iniciando OmniVoice GPU...
call C:\Users\Administrador\Miniconda3\Scripts\activate.bat
set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

start "OmniVoice GPU" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True && omnivoice-demo --ip 0.0.0.0 --port 7860"
echo      Aguardando OmniVoice subir (15s)...
timeout /t 15 /nobreak >nul

:: =====================
:: PASSO 3: VERIFICAR SE TUDO ESTA RODANDO
:: =====================
echo [3/5] Verificando servidores...

:: Verifica Apache
curl -s -o nul -w "%%{http_code}" http://localhost:8080/ > "%TEMP%\apache_check.txt" 2>nul
set /p APACHE_STATUS=<"%TEMP%\apache_check.txt"
del "%TEMP%\apache_check.txt" >nul 2>nul

if "%APACHE_STATUS%"=="200" (
    echo      [OK] Apache PHP rodando na porta 8080
) else (
    echo      [AVISO] Apache pode nao estar respondendo - verifique manualmente
)

:: Verifica OmniVoice
curl -s -o nul -w "%%{http_code}" http://localhost:7860/ > "%TEMP%\ov_check.txt" 2>nul
set /p OV_STATUS=<"%TEMP%\ov_check.txt"
del "%TEMP%\ov_check.txt" >nul 2>nul

if "%OV_STATUS%"=="200" (
    echo      [OK] OmniVoice GPU rodando na porta 7860
) else (
    echo      [AVISO] OmniVoice pode nao estar respondendo - aguardando mais...
    timeout /t 10 /nobreak >nul
)

:: =====================
:: PASSO 4: INICIAR TUNEL (so para o browser acessar)
:: =====================
echo [4/5] Iniciando tunnel (browser -> PHP local)...
start "Tunnel PHP" cmd /k "powershell -ExecutionPolicy Bypass -File tunnel_php.ps1"
timeout /t 8 /nobreak >nul

:: =====================
:: PASSO 5: PRONTO
:: =====================
echo.
echo ============================================
echo   TUDO PRONTO!
echo ============================================
echo.
echo   GPU:  http://localhost:7860 (local)
echo   PHP:  http://localhost:8080 (local)
echo   Teste: Abra o arquivo teste_local.html no navegador
echo.
echo   OU acesse via tunnel (URL aparece na
echo   janela "Tunnel PHP")
echo.
echo   Para parar: Feche as janelas cmd
echo ============================================
echo.
pause
