#!/bin/bash
# ============================================================
# SCRIPT DE RESTAURAÇÃO COMPLETA - Oracle VozPro
# ============================================================
# Uso: Subir os arquivos deste backup para o Oracle e executar:
#   1. Copiar arquivos para os locais corretos
#   2. npm install
#   3. npx prisma migrate deploy
#   4. sudo python3 deploy-seguro.py
#
# NÃO usar git reset --hard, NÃO matar processos manualmente.
# SEMPRE usar deploy-seguro.py para qualquer deploy.
# ============================================================

set -e

ORACLE_DIR="/home/ubuntu/omnivoice"
PHP_DIR="/var/www/omnivoice"
NGINX_DIR="/etc/nginx/sites-available"

echo "=== RESTAURAÇÃO VOZPRO - Oracle ==="
echo "Diretório do projeto: $ORACLE_DIR"
echo ""

# ---- 1. Copiar arquivos de configuração ----
echo "[1/6] Copiando arquivos de configuração..."

# .env (preserva arquivo existente como backup)
if [ -f "$ORACLE_DIR/.env" ]; then
    cp "$ORACLE_DIR/.env" "$ORACLE_DIR/.env.backup-$(date +%Y%m%d%H%M%S)"
    echo "  Backup do .env atual criado"
fi
cp env/.env "$ORACLE_DIR/.env"
echo "  [OK] .env copiado (com SMTP)"

# ---- 2. Copiar código fonte ----
echo "[2/6] Copiando código fonte (src/)..."
cp -r src/ "$ORACLE_DIR/src/"
echo "  [OK] src/ copiado"

# ---- 3. Copiar arquivos raiz ----
echo "[3/6] Copiando arquivos raiz do projeto..."
cp package.json "$ORACLE_DIR/package.json"
cp package-lock.json "$ORACLE_DIR/package-lock.json"
cp next.config.ts "$ORACLE_DIR/next.config.ts"
cp tsconfig.json "$ORACLE_DIR/tsconfig.json"
cp tailwind.config.ts "$ORACLE_DIR/tailwind.config.ts"
cp postcss.config.mjs "$ORACLE_DIR/postcss.config.mjs"
cp components.json "$ORACLE_DIR/components.json"
cp .gitignore "$ORACLE_DIR/.gitignore"
cp deploy-seguro.py "$ORACLE_DIR/deploy-seguro.py"
echo "  [OK] Arquivos raiz copiados"

# ---- 4. Copiar public/ ----
echo "[4/6] Copiando public/..."
cp -r public/ "$ORACLE_DIR/public/"
echo "  [OK] public/ copiado"

# ---- 5. Copiar PHP (tunnel-generate) ----
echo "[5/6] Copiando tunnel-generate.php..."
cp php/tunnel-generate.php "$PHP_DIR/tunnel-generate.php"
echo "  [OK] tunnel-generate.php copiado (com CURLOPT_ENCODING identity)"

# ---- 6. Copiar Prisma ----
echo "[6/6] Copiando schema e migrations Prisma..."
cp -r database/prisma/ "$ORACLE_DIR/prisma/"
echo "  [OK] prisma/ copiado"

# ---- Instalar dependências e migrar DB ----
echo ""
echo "=== INSTALAÇÃO ==="
cd "$ORACLE_DIR"

echo "Instalando dependências (npm install)..."
npm install

echo "Aplicando migrations do banco de dados..."
npx prisma migrate deploy

# ---- DEPLOY SEGURO ----
echo ""
echo "=== DEPLOY SEGURO ==="
echo "Executando deploy-seguro.py..."
sudo python3 deploy-seguro.py

echo ""
echo "=== RESTAURAÇÃO CONCLUÍDA ==="
echo "O sistema deve estar 100% funcional."
echo ""
echo "Se o Nginx não estiver configurado, copiar:"
echo "  cp nginx/vozpro.cvmnews.com.br $NGINX_DIR/vozpro.cvmnews.com.br"
echo "  sudo ln -sf $NGINX_DIR/vozpro.cvmnews.com.br /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Se necessário, certificado SSL:"
echo "  sudo certbot --nginx -d vozpro.cvmnews.com.br"