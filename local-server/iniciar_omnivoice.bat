@echo off
echo ============================================
echo   OmniVoice TTS Server (k2-fsa)
echo ============================================
echo.

:: Verificar se omnivoice esta instalado
python -c "import omnivoice" 2>nul
if errorlevel 1 (
    echo [ERRO] OmniVoice nao esta instalado!
    echo Instale com: pip install omnivoice
    echo.
    pause
    exit /b 1
)

echo [OK] OmniVoice encontrado
echo [INFO] Carregando modelo (primeira vez pode demorar)...
echo [INFO] Servidor sobe em http://localhost:7861
echo.

:: Iniciar servidor OmniVoice
python omnivoice_server.py --ip 0.0.0.0 --port 7861

pause
