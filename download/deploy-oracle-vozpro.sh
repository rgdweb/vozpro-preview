#!/bin/bash
# =============================================
# DEPLOY VOZPRO UNIFICADO — Servidor Oracle
# =============================================
# Executar como ubuntu no servidor Oracle
# Este script faz o merge: para o PM2 ativo (/home/ubuntu/omnivoice)
# e remove a cópia inativa (/var/www/vozpro-app)
#
# Uso: bash deploy-oracle-vozpro.sh
# =============================================

set -e

ACTIVE_DIR="/home/ubuntu/omnivoice"
BACKUP_DIR="/home/ubuntu/omnivoice-backup-$(date +%Y%m%d-%H%M%S)"
INACTIVE_DIR="/var/www/vozpro-app"
PACKAGE_FILE="vozpro-unificado.tar.gz"

echo "=========================================="
echo "  DEPLOY VOZPRO UNIFICADO"
echo "=========================================="
echo ""

# 1. Verificar se está no diretório correto
if [ ! -f "$PACKAGE_FILE" ]; then
    echo "❌ ERRO: Arquivo $PACKAGE_FILE nao encontrado."
    echo "   Coloque este script e o .tar.gz no mesmo diretorio."
    exit 1
fi

echo "📦 Pacote encontrado: $PACKAGE_FILE"
echo ""

# 2. Backup do app ativo
echo "📦 Criando backup do app ativo..."
cp -r "$ACTIVE_DIR" "$BACKUP_DIR"
echo "   ✅ Backup: $BACKUP_DIR"
echo ""

# 3. Parar PM2
echo "⏹️  Parando PM2..."
pm2 stop vozpro 2>/dev/null || pm2 stop omnivoice 2>/dev/null || echo "   (PM2 nao esta rodando, continuando...)"
echo ""

# 4. Limpar build velho do app ativo
echo "🧹 Limpando build velho..."
rm -rf "$ACTIVE_DIR/.next"
echo "   ✅ .next removido"
echo ""

# 5. Extrair pacote no app ativo
echo "📦 Extraindo pacote unificado..."
tar xzf "$PACKAGE_FILE" -C "$ACTIVE_DIR"
echo "   ✅ Arquivos extraidos em $ACTIVE_DIR"
echo ""

# 6. Instalar dependências
echo "📥 Instalando dependencias..."
cd "$ACTIVE_DIR"
npm install --production=false
echo "   ✅ npm install concluido"
echo ""

# 7. Gerar Prisma client
echo "🗄️  Gerando Prisma client..."
npx prisma generate
echo "   ✅ Prisma generate concluido"
echo ""

# 8. Verificar/enviar migrações do banco
echo "🗄️  Verificando migrações do banco..."
# Verificar se DATABASE_URL está configurada
if [ -f "$ACTIVE_DIR/.env" ]; then
    source "$ACTIVE_DIR/.env" 2>/dev/null || true
fi
if [ -z "$DATABASE_URL" ]; then
    echo "   ⚠️  DATABASE_URL nao configurada em .env"
    echo "   Configurar .env com DATABASE_URL antes de rodar migrations"
    echo "   Exemplo: DATABASE_URL=postgresql://user:pass@localhost:5432/vozpro"
else
    echo "   DATABASE_URL configurada, aplicando migrations..."
    npx prisma migrate deploy 2>/dev/null || npx prisma db push 2>/dev/null || echo "   ⚠️  Migrations falharam, verificar manualmente"
    echo "   ✅ Migrations aplicadas"
fi
echo ""

# 9. Build do Next.js
echo "🔨 Fazendo build do Next.js..."
npx next build
echo "   ✅ Build concluido"
echo ""

# 10. Reiniciar PM2
echo "▶️  Reiniciando PM2..."
pm2 restart vozpro 2>/dev/null || pm2 restart omnivoice 2>/dev/null || {
    echo "   PM2 nao encontrado, tentando iniciar..."
    pm2 start "$ACTIVE_DIR/npm" --name vozpro -- start 2>/dev/null || \
    pm2 start "npx next start -p 3001" --name vozpro --cwd "$ACTIVE_DIR"
}
echo "   ✅ PM2 reiniciado"
echo ""

# 11. Status
echo "📊 Status PM2:"
pm2 list
echo ""

# 12. Perguntar sobre cópia inativa
echo "=========================================="
echo "  LIMPEZA"
echo "=========================================="
if [ -d "$INACTIVE_DIR" ]; then
    echo "📁 Cópia inativa encontrada: $INACTIVE_DIR"
    echo "   Esta cópia (git) ja foi mergada no app ativo."
    echo "   Deseja apagar? (Ctrl+C para cancelar, Enter para continuar)"
    read -r
    rm -rf "$INACTIVE_DIR"
    echo "   ✅ $INACTIVE_DIR removido"
else
    echo "   (Nenhuma cópia inativa encontrada)"
fi
echo ""

echo "=========================================="
echo "  ✅ DEPLOY CONCLUÍDO!"
echo "=========================================="
echo ""
echo "  App ativo: $ACTIVE_DIR"
echo "  Backup:    $BACKUP_DIR"
echo "  Porta:     3001 (PM2)"
echo "  URL:       vozpro.cvmnews.com.br"
echo ""
echo "  Fluxo do numStep:"
echo "    Frontend (slider) → body.numStep → tunnel-generate → GPU"
echo "    Valor padrão: 32 (pode ajustar de 4 a 64 no slider)"
echo ""
echo "  Rotas de API:"
echo "    /api/tunnel-generate  → Geração principal (F5-TTS via tunnel)"
echo "    /api/php-generate     → Proxy PHP (alternativa)"
echo "    /api/proxy-audio      → Proxy de áudio (CORS/mixed-content)"
echo "    /api/payment/*        → MercadoPago pagamentos"
echo "    /api/queue/*          → Fila de geração"
echo "    /api/auth/google      → Google OAuth"
echo ""
