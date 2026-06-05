@echo off
title VozPro GPU Server (OmniVoice + Kokoro)
echo ============================================
echo   VozPro TTS - OmniVoice + Kokoro-82M
echo ============================================
echo.

echo [0/5] Limpando processos antigos...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":7860" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":7861" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [1/5] Ativando Conda...
call C:\Users\Administrador\Miniconda3\Scripts\activate.bat
set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32

echo [1.5/5] Verificando arquivos...
if not exist omnivoice_gpu.py (
    echo      Baixando omnivoice_gpu.py do GitHub...
    powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/rgdweb/Omnivoice/main/local-server/omnivoice_gpu.py' -OutFile 'omnivoice_gpu.py'" 2>nul
    if not exist omnivoice_gpu.py (
        echo [ERRO] Nao conseguiu baixar omnivoice_gpu.py!
        pause
        exit /b 1
    )
    echo      Arquivo baixado!
) else (
    echo      omnivoice_gpu.py encontrado!
)
if not exist kokoro_server.py (
    echo [ERRO] kokoro_server.py nao encontrado na pasta!
    pause
    exit /b 1
) else (
    echo      kokoro_server.py encontrado!
)

echo.
echo [2/5] Iniciando Kokoro-82M (porta 7861)...
start "Kokoro-82M" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32 && python kokoro_server.py --ip 0.0.0.0 --port 7861"

echo      Aguardando Kokoro ficar pronto...
set KOKORO_WAITED=0
:kokoro_check
if %KOKORO_WAITED% GEQ 60 (
    echo.
    echo [AVISO] Kokoro demorou mais de 60s, continuando sem Kokoro...
    goto start_omnivoice
)
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:7861/health' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo      Kokoro pronto! ^(esperou %KOKORO_WAITED% segundos^)
    set KOKORO_OK=1
    goto start_omnivoice
)
set /a KOKORO_WAITED+=3
echo      Aguardando Kokoro... %KOKORO_WAITED%s
timeout /t 3 /nobreak >nul
goto kokoro_check

:start_omnivoice
echo.
echo [3/5] Iniciando OmniVoice com GPU (porta 7860)...
start "OmniVoice GPU" cmd /k "call C:\Users\Administrador\Miniconda3\Scripts\activate.bat && set CUDA_VISIBLE_DEVICES=0 && set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:32 && set KOKORO_URL=http://localhost:7861 && python omnivoice_gpu.py --ip 0.0.0.0 --port 7860"

echo      Aguardando OmniVoice ficar pronto...
set WAITED=0
:health_check
if %WAITED% GEQ 120 (
    echo.
    echo [AVISO] OmniVoice demorou mais de 120s, iniciando tunnel mesmo assim...
    goto start_tunnel
)
powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:7860/' -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo      OmniVoice pronto! ^(esperou %WAITED% segundos^)
    goto start_tunnel
)
set /a WAITED+=5
echo      Aguardando OmniVoice... %WAITED%s
timeout /t 5 /nobreak >nul
goto health_check

:start_tunnel
echo.
echo [4/5] Iniciando tunnel Cloudflare...
start "Tunnel Auto" cmd /k "powershell -ExecutionPolicy Bypass -File start_tunnel.ps1"
timeout /t 8 /nobreak >nul

echo.
echo ============================================
echo   Pronto! Sistema ativo:
echo     - Kokoro-82M   : porta 7861
echo     - OmniVoice    : porta 7860
echo     - Tunnel       : Cloudflare
echo ============================================
echo.
pause
