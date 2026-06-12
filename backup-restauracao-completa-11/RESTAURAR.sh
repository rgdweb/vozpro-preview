#!/bin/bash
# ================================================================
# RESTAURAR VOZPRO NO ORACLE - Backup 11 (12/06/2025)
# ================================================================
# MODO DE USAR:
#   1. Subir esta pasta inteira para o Oracle:
#      scp -r backup-restauracao-completa-11/ ubuntu@api.cvmnews.com.br:/home/ubuntu/backup-restore/
#
#   2. SSH no Oracle:
#      ssh ubuntu@api.cvmnews.com.br
#
#   3. Rodar este script:
#      cd /home/ubuntu/backup-restore/backup-restauracao-completa-11
#      chmod +x RESTAURAR.sh
#      ./RESTAURAR.sh
#
#   PRONTO. Site volta 100% no ar. Não precisa configurar nada.
# ================================================================
# REGRAS:
#   - NUNCA usar git reset --hard
#   - NUNCA matar processos manualmente
#   - SEMPRE usar deploy-seguro.py para deploy
# ================================================================

set -e

DIR_PROJETO="/home/ubuntu/omnivoice"
DIR_PHP="/var/www/omnivoice"
DIR_BACKUP="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "======================================================"
echo "  RESTAURAÇÃO VOZPRO - Backup #11 - 12/06/2025"
echo "======================================================"
echo ""

# ---- PASSO 1: Apagar código velho ----
echo "[1/5] Apagando código velho..."
rm -rf "$DIR_PROJETO/src"
rm -rf "$DIR_PROJETO/public"
rm -rf "$DIR_PROJETO/prisma"
echo "  [OK] src/ public/ prisma/ apagados"

# ---- PASSO 2: Copiar código novo do backup ----
echo "[2/5] Copiando código do backup..."
cp -r "$DIR_BACKUP/src" "$DIR_PROJETO/src"
cp -r "$DIR_BACKUP/public" "$DIR_PROJETO/public"
cp -r "$DIR_BACKUP/database/prisma" "$DIR_PROJETO/prisma"
echo "  [OK] src/ public/ prisma/ copiados"

# ---- PASSO 3: Copiar configs ----
echo "[3/5] Copiando arquivos de configuração..."

# .env (faz backup do atual se existir)
if [ -f "$DIR_PROJETO/.env" ]; then
    cp "$DIR_PROJETO/.env" "$DIR_PROJETO/.env.antes-restore-$(date +%Y%m%d%H%M%S)"
fi
cp "$DIR_BACKUP/env/.env" "$DIR_PROJETO/.env"
echo "  [OK] .env (com SMTP)"

# Arquivos raiz do projeto
cp "$DIR_BACKUP/package.json" "$DIR_PROJETO/package.json"
cp "$DIR_BACKUP/package-lock.json" "$DIR_PROJETO/package-lock.json"
cp "$DIR_BACKUP/next.config.ts" "$DIR_PROJETO/next.config.ts"
cp "$DIR_BACKUP/tsconfig.json" "$DIR_PROJETO/tsconfig.json"
cp "$DIR_BACKUP/tailwind.config.ts" "$DIR_PROJETO/tailwind.config.ts"
cp "$DIR_BACKUP/postcss.config.mjs" "$DIR_PROJETO/postcss.config.mjs"
cp "$DIR_BACKUP/components.json" "$DIR_PROJETO/components.json"
cp "$DIR_BACKUP/.gitignore" "$DIR_PROJETO/.gitignore"
cp "$DIR_BACKUP/deploy-seguro.py" "$DIR_PROJETO/deploy-seguro.py"
echo "  [OK] package.json, next.config.ts, deploy-seguro.py, etc"

# PHP (tunnel-generate.php com fix dos estalos)
cp "$DIR_BACKUP/php/tunnel-generate.php" "$DIR_PHP/tunnel-generate.php"
echo "  [OK] tunnel-generate.php (CURLOPT_ENCODING identity)"

# ---- PASSO 4: Instalar dependências + banco ----
echo "[4/5] Instalando dependências e banco..."
cd "$DIR_PROJETO"
npm install --production 2>&1 | tail -3
npx prisma migrate deploy 2>&1 | tail -5
echo "  [OK] npm install + prisma migrate"

# ---- PASSO 5: DEPLOY SEGURO ----
echo "[5/5] DEPLOY SEGURO..."
echo "  Executando deploy-seguro.py (pull + build + restart)..."
sudo python3 "$DIR_PROJETO/deploy-seguro.py"

echo ""
echo "======================================================"
echo "  RESTAURAÇÃO CONCLUÍDA - SITE DEVE ESTAR NO AR"
echo "======================================================"
echo ""
echo "  Se algo estiver errado com Nginx:"
echo "    sudo cp $DIR_BACKUP/nginx/vozpro.cvmnews.com.br /etc/nginx/sites-available/"
echo "    sudo ln -sf /etc/nginx/sites-available/vozpro.cvmnews.com.br /etc/nginx/sites-enabled/"
echo "    sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  Se o SSL expirou:"
echo "    sudo certbot --nginx -d vozpro.cvmnews.com.br"
echo ""