#!/usr/bin/env bash
# ============================================================
#  VozPro — Pipeline Completa: Upload + Deploy Remoto
# ============================================================
#
#  Este script transfere os arquivos do motor NLP v2.7.0
#  para o servidor de produção e executa o deploy atômico.
#
#  Uso:
#    chmod +x pipeline-deploy.sh
#    ./pipeline-deploy.sh [USUARIO@SERVIDOR]
#
#  Exemplo:
#    ./pipeline-deploy.sh ubuntu@192.168.1.100
#    ./pipeline-deploy.sh root@meudominio.com
#
# ============================================================

set -euo pipefail

# --- Configuração ---
REMOTE="${1:-ubuntu@$(hostname)}"
LOCAL_DIR="/home/z/my-project/download/omnivoice-deploy"
REMOTE_DIR="/home/ubuntu/omnivoice"
TARGET_FILE="/var/www/omnivoice/tunnel-generate.php"

echo ""
echo "══════════════════════════════════════════════"
echo "  VozPro — Upload + Deploy Pipeline"
echo "  Motor NLP v2.7.0"
echo "══════════════════════════════════════════════"
echo ""

# --- Validação local ---
echo "[LOCAL] Verificando arquivos..."

if [[ ! -f "${LOCAL_DIR}/tunnel-generate.php" ]]; then
    echo "✗ ERRO: tunnel-generate.php não encontrado em ${LOCAL_DIR}"
    exit 1
fi

if [[ ! -f "${LOCAL_DIR}/deploy-seguro.py" ]]; then
    echo "✗ ERRO: deploy-seguro.py não encontrado em ${LOCAL_DIR}"
    exit 1
fi

SIZE=$(stat -c%s "${LOCAL_DIR}/tunnel-generate.php")
echo "  ✓ tunnel-generate.php (${SIZE} bytes)"
echo "  ✓ deploy-seguro.py"
echo ""

# --- Transferência via SCP ---
echo "[SCP] Transferindo arquivos para ${REMOTE}:${REMOTE_DIR}/"

# Cria diretório remoto se não existir
ssh "${REMOTE}" "mkdir -p ${REMOTE_DIR}" 2>/dev/null || {
    echo "✗ ERRO: Não foi possível conectar via SSH a ${REMOTE}"
    echo "  Verifique se a chave SSH está configurada."
    exit 1
}

# Upload dos dois arquivos
scp "${LOCAL_DIR}/tunnel-generate.php" "${REMOTE}:${REMOTE_DIR}/tunnel-generate.php"
echo "  ✓ tunnel-generate.php transferido"

scp "${LOCAL_DIR}/deploy-seguro.py" "${REMOTE}:${REMOTE_DIR}/deploy-seguro.py"
echo "  ✓ deploy-seguro.py transferido"
echo ""

# --- Deploy remoto ---
echo "[DEPLOY] Executando deploy atômico no servidor..."

ssh "${REMOTE}" "cd ${REMOTE_DIR} && python3 deploy-seguro.py"

echo ""
echo "══════════════════════════════════════════════"
echo "  Pipeline concluída com sucesso!"
echo "══════════════════════════════════════════════"
echo ""
