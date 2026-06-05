#!/bin/bash
# =============================================================================
# Omnivoice Migration - FASE 2: MIGRAR PHP (Gradio → native-generate)
# Executar NO SERVIDOR ORACLE (147.15.77.137) como ubuntu ou root
# PRE-REQUISITO: Script 01-backup.sh ja foi executado com sucesso
# =============================================================================

set -euo pipefail

TIMESTAMP="20250602"
BACKUP_BASE="/var/www/omnivoice-backup-${TIMESTAMP}"

echo "=========================================="
echo "  OMNIVOICE MIGRACAO - FASE 2"
echo "  Gradio API → native-generate"
echo "=========================================="
echo ""

# --- Verificar se backup existe ---
if [ ! -d "${BACKUP_BASE}" ]; then
    echo "ERRO: Backup nao encontrado em ${BACKUP_BASE}"
    echo "Execute o script 01-backup.sh PRIMEIRO!"
    exit 1
fi

echo "[OK] Backup encontrado. Prosseguindo com migracao..."
echo ""

# --- Copiar arquivo migrado para o servidor ---
# O arquivo generate-omnivoice-native.php ja deve estar no servidor
# Caso contrario, copie-o manualmente antes de rodar este script

MIGRATED_FILE="/var/www/omnivoice/generate-omnivoice-native.php"

if [ ! -f "${MIGRATED_FILE}" ]; then
    echo "ERRO: Arquivo migrado nao encontrado em ${MIGRATED_FILE}"
    echo "Copie o arquivo generate-omnivoice-native.php para o servidor primeiro!"
    echo ""
    echo "  scp generate-omnivoice-native.php ubuntu@147.15.77.137:/tmp/"
    echo "  ssh ubuntu@147.15.77.137 'sudo mv /tmp/generate-omnivoice-native.php /var/www/omnivoice/'"
    exit 1
fi

# --- Fazer backup do arquivo ATUAL (segundo backup, por seguranca) ---
echo "[1/5] Backup extra do generate-omnivoice.php atual..."
sudo cp /var/www/omnivoice/generate-omnivoice.php \
    /var/www/omnivoice/generate-omnivoice.php.pre-migration-backup
echo "  -> Salvo como generate-omnivoice.php.pre-migration-backup"
echo ""

# --- Substituir o arquivo principal ---
echo "[2/5] Ativando versao nativa..."
sudo cp /var/www/omnivoice/generate-omnivoice.php \
    /var/www/omnivoice/generate-omnivoice.php.gradio-backup
sudo cp "${MIGRATED_FILE}" /var/www/omnivoice/generate-omnivoice.php
echo "  -> Antigo: generate-omnivoice.php.gradio-backup"
echo "  -> Novo: generate-omnivoice.php (native-generate)"
echo ""

# --- Verificar permissoes ---
echo "[3/5] Ajustando permissoes..."
sudo chown www-data:www-data /var/www/omnivoice/generate-omnivoice.php
sudo chmod 644 /var/www/omnivoice/generate-omnivoice.php
echo "  -> Permissoes ajustadas"
echo ""

# --- Restart services ---
echo "[4/5] Restartando servicos..."
# PHP nao precisa de restart (Apache recarrega automaticamente)
# Mas se usar PHP-FPM:
sudo systemctl reload php*-fpm 2>/dev/null && echo "  -> PHP-FPM recarregado" || echo "  -> PHP-FPM nao encontrado (usando Apache mod_php, sem reload necessario)"

# Se o Next.js tambem for atualizado:
if pm2 list 2>/dev/null | grep -q omnivoice; then
    echo "  -> Reiniciando PM2 omnivoice..."
    cd /home/ubuntu/omnivoice && pm2 restart omnivoice
else
    echo "  -> PM2 omnivoice nao encontrado (pulando restart Next.js)"
fi
echo ""

# --- Teste rapido ---
echo "[5/5] Teste rapido do endpoint..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost/var/www/omnivoice/generate-omnivoice.php" 2>/dev/null || echo "000")
echo "  -> HTTP Status: ${RESPONSE}"
echo ""

echo "=========================================="
echo "  MIGRACAO CONCLUIDA!"
echo "=========================================="
echo ""
echo "PROXIMOS PASSOS:"
echo "  1. Execute o script 03-test.sh para testes completos"
echo "  2. Se houver problemas, execute 04-rollback.sh"
echo ""
echo "Arquivos de backup disponiveis:"
echo "  - generate-omnivoice.php.gradio-backup (versao Gradio)"
echo "  - generate-omnivoice.php.pre-migration-backup (backup extra)"
echo "  - ${BACKUP_BASE}/ (backup completo original)"
