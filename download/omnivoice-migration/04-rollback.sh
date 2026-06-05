#!/bin/bash
# =============================================================================
# Omnivoice Migration - ROLLBACK (Restaurar versao Gradio)
# Executar NO SERVIDOR ORACLE (147.15.77.137) em caso de falha na migracao
# =============================================================================

set -euo pipefail

TIMESTAMP="20250602"
BACKUP_BASE="/var/www/omnivoice-backup-${TIMESTAMP}"
NEXTJS_BACKUP="/home/ubuntu/omnivoice/backup-${TIMESTAMP}"

echo "=========================================="
echo "  OMNIVOICE - ROLLBACK EMERGENCIA"
echo "=========================================="
echo ""

# --- Verificar qual backup usar ---
GRADIO_BACKUP="/var/www/omnivoice/generate-omnivoice.php.gradio-backup"
PRE_MIGRATION="/var/www/omnivoice/generate-omnivoice.php.pre-migration-backup"
FULL_BACKUP="${BACKUP_BASE}/generate-omnivoice.php"

SOURCE_FILE=""

if [ -f "${GRADIO_BACKUP}" ]; then
    SOURCE_FILE="${GRADIO_BACKUP}"
    echo "Usando backup incremental: ${GRADIO_BACKUP}"
elif [ -f "${PRE_MIGRATION}" ]; then
    SOURCE_FILE="${PRE_MIGRATION}"
    echo "Usando backup pre-migracao: ${PRE_MIGRATION}"
elif [ -f "${FULL_BACKUP}" ]; then
    SOURCE_FILE="${FULL_BACKUP}"
    echo "Usando backup completo: ${FULL_BACKUP}"
else
    echo "ERRO CRITICO: Nenhum backup encontrado!"
    echo "Backups procurados:"
    echo "  1. ${GRADIO_BACKUP}"
    echo "  2. ${PRE_MIGRATION}"
    echo "  3. ${FULL_BACKUP}"
    exit 1
fi

echo ""

# --- Restaurar arquivo PHP ---
echo "[1/3] Restaurando generate-omnivoice.php..."
sudo cp "${SOURCE_FILE}" /var/www/omnivoice/generate-omnivoice.php
sudo chown www-data:www-data /var/www/omnivoice/generate-omnivoice.php
sudo chmod 644 /var/www/omnivoice/generate-omnivoice.php
echo "  -> Restaurado com sucesso!"
echo ""

# --- Recarregar PHP ---
echo "[2/3] Recarregando servicos..."
sudo systemctl reload php*-fpm 2>/dev/null && echo "  -> PHP-FPM recarregado" || echo "  -> PHP-FPM nao encontrado (sem reload necessario)"
echo ""

# --- Restart PM2 (se aplicavel) ---
echo "[3/3] Verificando PM2..."
if pm2 list 2>/dev/null | grep -q omnivoice; then
    # Restaurar backup do Next.js se existir
    if [ -d "${NEXTJS_BACKUP}/src" ]; then
        echo "  -> Restaurando backup Next.js src..."
        cp -a "${NEXTJS_BACKUP}/src"/* /home/ubuntu/omnivoice/src/ 2>/dev/null || true
    fi
    if [ -f "${NEXTJS_BACKUP}/.env.backup-${TIMESTAMP}" ]; then
        echo "  -> Restaurando .env..."
        cp "${NEXTJS_BACKUP}/.env.backup-${TIMESTAMP}" /home/ubuntu/omnivoice/.env
    fi
    cd /home/ubuntu/omnivoice && pm2 restart omnivoice
    echo "  -> PM2 reiniciado"
else
    echo "  -> PM2 omnivoice nao encontrado (pulando)"
fi
echo ""

echo "=========================================="
echo "  ROLLBACK CONCLUIDO!"
echo "=========================================="
echo ""
echo "A versao Gradio original foi restaurada."
echo "Verifique se tudo esta funcionando acessando o sistema."
