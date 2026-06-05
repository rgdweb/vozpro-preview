#!/bin/bash
# ============================================================
# VozPro Deploy Script - Oracle VPS
# Copia os arquivos limpos para os locais corretos no Oracle
# Uso: chmod +x deploy-oracle.sh && ./deploy-oracle.sh
# ============================================================

set -e

ORACLE_USER="ubuntu"
ORACLE_HOST="129.213.40.137"
DEPLOY_DIR="/home/z/my-project/download/vozpro-deploy"

echo "============================================"
echo "  VozPro Deploy para Oracle"
echo "============================================"
echo ""

# ---- 1. PHP Backend (api.cvmnews.com.br) ----
echo "[1/3] Deploy PHP Backend (/var/www/omnivoice/)..."
scp "$DEPLOY_DIR/oracle-php/tunnel-generate.php" \
    "$ORACLE_USER@$ORACLE_HOST:/var/www/omnivoice/tunnel-generate.php"

scp "$DEPLOY_DIR/oracle-php/config.php" \
    "$ORACLE_USER@$ORACLE_HOST:/var/www/omnivoice/config.php"

scp "$DEPLOY_DIR/oracle-php/update_tunnel.php" \
    "$ORACLE_USER@$ORACLE_HOST:/var/www/omnivoice/update_tunnel.php"

scp "$DEPLOY_DIR/oracle-php/get_tunnel.php" \
    "$ORACLE_USER@$ORACLE_HOST:/var/www/omnivoice/get_tunnel.php"

scp "$DEPLOY_DIR/oracle-php/tunnel-config.ini" \
    "$ORACLE_USER@$ORACLE_HOST:/var/www/omnivoice/tunnel-config.ini"

echo "[OK] PHP Backend deployado!"
echo ""

# ---- 2. Next.js Frontend (vozpro.cvmnews.com.br) ----
echo "[2/3] Deploy Next.js Frontend (/home/ubuntu/omnivoice/)..."
echo "   Copiando src/app/api/tunnel-generate/route.ts..."
scp "$ORACLE_USER@$ORACLE_HOST:/home/ubuntu/omnivoice/src/app/api/tunnel-generate/route.ts" \
    "/tmp/tunnel-generate-route.ts" 2>/dev/null || true
echo ""

echo "[3/3] Reconstruindo Next.js no Oracle..."
ssh "$ORACLE_USER@$ORACLE_HOST" bash -s << 'REMOTE_EOF'
    cd /home/ubuntu/omnivoice

    echo "  Parando PM2..."
    pm2 stop omnivoice 2>/dev/null || echo "  PM2 nao estava rodando"

    echo "  Instalando dependencias..."
    npm install --production=false 2>&1 | tail -3

    echo "  Removendo build antigo (.next/)..."
    rm -rf .next

    echo "  Construindo novo build..."
    npm run build 2>&1 | tail -10

    echo "  Reiniciando PM2..."
    pm2 restart omnivoice 2>/dev/null || pm2 start npm --name omnivoice -- start

    echo "  Status PM2:"
    pm2 status omnivoice

    echo ""
    echo "[OK] Next.js rebuild completo!"
REMOTE_EOF

echo ""
echo "============================================"
echo "  DEPLOY CONCLUIDO!"
echo "============================================"
echo ""
echo "O que foi feito:"
echo "  - PHP Backend: arquivos atualizados em /var/www/omnivoice/"
echo "  - Next.js: rebuild completo em /home/ubuntu/omnivoice/"
echo ""
echo "NOTA: GPU PC precisa ser atualizado manualmente:"
echo "  1. Copie gpu-pc/omnivoice_gpu.py para o PC"
echo "  2. Copie gpu-pc/start_tunnel.ps1 para o PC"
echo "  3. Reinicie o servidor: FECHAR_TUDO.bat -> INICIAR_COM_MONITOR.bat"
echo ""
echo "Para verificar:"
echo "  - vozpro.cvmnews.com.br (frontend)"
echo "  - api.cvmnews.com.br/tunnel-generate.php (PHP)"
