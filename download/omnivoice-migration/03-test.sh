#!/bin/bash
# =============================================================================
# Omnivoice Migration - FASE 3: TESTES POS-MIGRACAO
# Executar NO SERVIDOR ORACLE (147.15.77.137)
# =============================================================================

set -euo pipefail

echo "=========================================="
echo "  OMNIVOICE - TESTES POS-MIGRACAO"
echo "=========================================="
echo ""

# --- Configuracao de teste ---
TUNNEL_URL=""
TEST_TEXT="Teste de migracao. Uma dois tres quatro cinco."
TEST_REF_AUDIO=""  # Deixe vazio para voice design, ou aponte para um .wav
TEST_INSTRUCT="A warm female voice with a slight Brazilian accent"

# Tentar descobrir tunnel URL automaticamente
echo "[1/6] Descobrindo tunnel URL..."
TUNNEL_URL=$(php -r '
    require "/var/www/omnivoice/config.php";
    require "/var/www/omnivoice/get_tunnel.php";
    echo getActiveTunnelUrl();
' 2>/dev/null || echo "")

if [ -z "${TUNNEL_URL}" ]; then
    echo "  ERRO: Nao conseguiu descobrir tunnel URL automaticamente"
    echo "  Defina manualmente: TUNNEL_URL=https://seu-tunnel-url"
    exit 1
fi

echo "  -> Tunnel URL: ${TUNNEL_URL}"
echo ""

# --- Teste 1: Health check do endpoint native-generate ---
echo "[2/6] Teste: Health check do /api/native-generate..."
HEALTH=$(curl -s -m 15 "${TUNNEL_URL}/api/native-generate" -X POST \
    -H "Content-Type: application/json" \
    -d '{"text":"test","mode":"test"}' 2>/dev/null || echo "")
echo "  Resposta: ${HEALTH:0:200}"
echo ""

# --- Teste 2: Gerar audio (voice design) ---
echo "[3/6] Teste: Voice Design (instruct=${TEST_INSTRUCT:0:40}...)..."
VOICE_DESIGN_RESULT=$(curl -s -m 60 "${TUNNEL_URL}/api/native-generate" -X POST \
    -H "Content-Type: application/json" \
    -d "{
        \"text\": \"${TEST_TEXT}\",
        \"mode\": \"design\",
        \"instruct\": \"${TEST_INSTRUCT}\",
        \"speed\": 1.0,
        \"language\": \"Portuguese\"
    }" 2>/dev/null || echo "")

if echo "${VOICE_DESIGN_RESULT}" | head -1 | grep -qi "error\|exception\|fail"; then
    echo "  [FALHA] Resposta indica erro:"
    echo "  ${VOICE_DESIGN_RESULT:0:500}"
else
    echo "  [OK] Resposta recebida (tamanho: $(echo "${VOICE_DESIGN_RESULT}" | wc -c) bytes)"
fi
echo ""

# --- Teste 3: Gerar audio (voice clone) ---
if [ -n "${TEST_REF_AUDIO}" ] && [ -f "${TEST_REF_AUDIO}" ]; then
    echo "[4/6] Teste: Voice Clone (ref_audio=${TEST_REF_AUDIO})..."
    # Ler audio como base64
    REF_B64=$(base64 -w0 "${TEST_REF_AUDIO}")
    CLONE_RESULT=$(curl -s -m 60 "${TUNNEL_URL}/api/native-generate" -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"text\": \"${TEST_TEXT}\",
            \"mode\": \"clone\",
            \"ref_audio_base64\": \"${REF_B64}\",
            \"ref_text\": \"Referencia de audio\",
            \"speed\": 1.0,
            \"language\": \"Portuguese\"
        }" 2>/dev/null || echo "")

    if echo "${CLONE_RESULT}" | head -1 | grep -qi "error\|exception\|fail"; then
        echo "  [FALHA] Resposta indica erro:"
        echo "  ${CLONE_RESULT:0:500}"
    else
        echo "  [OK] Resposta recebida (tamanho: $(echo "${CLONE_RESULT}" | wc -c) bytes)"
    fi
else
    echo "[4/6] Teste: Voice Clone (PULADO - sem ref_audio definido)"
    echo "  Para testar: TEST_REF_AUDIO=/caminho/para/audio.wav bash 03-test.sh"
fi
echo ""

# --- Teste 4: Testar speed variations ---
echo "[5/6] Teste: Variacoes de speed..."
for SPEED in 0.8 1.0 1.2; do
    SPEED_RESULT=$(curl -s -m 60 "${TUNNEL_URL}/api/native-generate" -X POST \
        -H "Content-Type: application/json" \
        -d "{
            \"text\": \"Velocidade teste\",
            \"mode\": \"design\",
            \"instruct\": \"A neutral male voice\",
            \"speed\": ${SPEED},
            \"language\": \"Portuguese\"
        }" 2>/dev/null || echo "")

    SIZE=$(echo "${SPEED_RESULT}" | wc -c)
    echo "  Speed ${SPEED}: ${SIZE} bytes"
done
echo ""

# --- Teste 5: Acessar via PHP (endpoint completo) ---
echo "[6/6] Teste: Acesso via PHP (generate-omnivoice.php)..."
PHP_TEST=$(curl -s -m 30 "http://localhost/var/www/omnivoice/generate-omnivoice.php" \
    -X POST \
    -d "text=Teste&mode=design&instruct=A+natural+voice&speed=1.0" 2>/dev/null || echo "")
echo "  Resposta PHP: ${PHP_TEST:0:300}"
echo ""

# --- Resumo ---
echo "=========================================="
echo "  RESUMO DOS TESTES"
echo "=========================================="
echo "Se todos os testes passaram:"
echo "  -> Migracao concluida com sucesso!"
echo ""
echo "Se algum teste falhou:"
echo "  -> Execute 04-rollback.sh para reverter"
echo "  -> Verifique os logs em /var/log/apache2/error.log"
echo "  -> Verifique os logs do PM2: pm2 logs omnivoice"
