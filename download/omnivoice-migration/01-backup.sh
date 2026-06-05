#!/bin/bash
# =============================================================================
# Omnivoice Migration - FASE 1: BACKUP COMPLETO
# Executar NO SERVIDOR ORACLE (147.15.77.137) como ubuntu ou root
# Data: 2025-06-02
# =============================================================================

set -euo pipefail

TIMESTAMP="20250602"
BACKUP_BASE="/var/www/omnivoice-backup-${TIMESTAMP}"
NEXTJS_BACKUP="/home/ubuntu/omnivoice/backup-${TIMESTAMP}"

echo "=========================================="
echo "  OMNIVOICE BACKUP - ${TIMESTAMP}"
echo "=========================================="
echo ""

# --- 1. Backup PHP (Apache) ---
echo "[1/6] Backup do /var/www/omnivoice/ ..."
sudo cp -a /var/www/omnivoice "${BACKUP_BASE}"
echo "  -> Copiado para ${BACKUP_BASE}"
echo ""

# --- 2. Backup Next.js source ---
echo "[2/6] Backup do /home/ubuntu/omnivoice/src/ ..."
mkdir -p "${NEXTJS_BACKUP}"
cp -a /home/ubuntu/omnivoice/src "${NEXTJS_BACKUP}/src"
echo "  -> Copiado para ${NEXTJS_BACKUP}/src/"
echo ""

# --- 3. Backup .env ---
echo "[3/6] Backup do .env ..."
cp /home/ubuntu/omnivoice/.env "${NEXTJS_BACKUP}/.env.backup-${TIMESTAMP}"
echo "  -> Copiado para ${NEXTJS_BACKUP}/.env.backup-${TIMESTAMP}"
echo ""

# --- 4. Backup ecosystem.config.js (PM2) ---
echo "[4/6] Backup do ecosystem.config.js ..."
cp /home/ubuntu/omnivoice/ecosystem.config.js "${NEXTJS_BACKUP}/ecosystem.config.js.backup-${TIMESTAMP}"
echo "  -> Copiado para ${NEXTJS_BACKUP}/ecosystem.config.js.backup-${TIMESTAMP}"
echo ""

# --- 5. Backup package.json e next.config ---
echo "[5/6] Backup de configs do Next.js ..."
cp /home/ubuntu/omnivoice/package.json "${NEXTJS_BACKUP}/package.json.backup-${TIMESTAMP}" 2>/dev/null || echo "  -> package.json nao encontrado, pulando"
cp /home/ubuntu/omnivoice/next.config.* "${NEXTJS_BACKUP}/" 2>/dev/null || echo "  -> next.config nao encontrado, pulando"
echo ""

# --- 6. Verificar integridade ---
echo "[6/6] Verificacao de integridade ..."
echo ""
echo "  Arquivos no backup PHP:"
find "${BACKUP_BASE}" -type f | head -20
echo ""
echo "  Arquivos no backup Next.js:"
find "${NEXTJS_BACKUP}" -type f | head -20
echo ""

# --- Hash de verificacao ---
echo "=========================================="
echo "  GERANDO HASHES DE VERIFICACAO"
echo "=========================================="
(
  cd "${BACKUP_BASE}" && find . -type f -exec sha256sum {} \; | sort
) > "${BACKUP_BASE}/.sha256sums"

(
  cd "${NEXTJS_BACKUP}" && find . -type f -exec sha256sum {} \; | sort
) > "${NEXTJS_BACKUP}/.sha256sums"

echo ""
echo "Hashes salvos em:"
echo "  ${BACKUP_BASE}/.sha256sums"
echo "  ${NEXTJS_BACKUP}/.sha256sums"
echo ""

echo "=========================================="
echo "  BACKUP CONCLUIDO COM SUCESSO!"
echo "=========================================="
echo ""
echo "Para verificar o backup no futuro:"
echo "  cd ${BACKUP_BASE} && sha256sum -c .sha256sums"
echo "  cd ${NEXTJS_BACKUP} && sha256sum -c .sha256sums"
echo ""
echo "Para rollback:"
echo "  bash /path/to/04-rollback.sh"
