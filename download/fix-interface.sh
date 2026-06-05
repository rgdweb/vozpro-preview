#!/bin/bash
# ============================================
# FIX: Remover switches orfaos do page.tsx
# Erro: "denoise is not defined"
# Causa: useState removido mas switches ficaram no HTML
# Data: 2026-06-04
# ============================================

set -e
cd /home/ubuntu/omnivoice

echo "=== Backup page.tsx ==="
cp src/app/page.tsx src/app/page.tsx.bak.$(date +%Y%m%d%H%M)

echo "=== Removendo switch Denoise ==="
python3 -c "
import re
with open('src/app/page.tsx', 'r') as f:
    content = f.read()

# Remover bloco Denoise
content = re.sub(
    r'\s*<div className=\"flex items-center justify-between\">\s*<label className=\"text-xs text-slate-400\">Denoise \(remover ruido do ref\)</label>.*?</div>\s*</div>',
    '\n',
    content,
    flags=re.DOTALL
)

# Remover bloco Pos-processar
content = re.sub(
    r'\s*<div className=\"flex items-center justify-between\">\s*<label className=\"text-xs text-slate-400\">Pos-processar \(remover silencios longos\)</label>.*?</div>\s*</div>',
    '\n',
    content,
    flags=re.DOTALL
)

# Remover bloco Pre-processar
content = re.sub(
    r'\s*<div className=\"flex items-center justify-between\">\s*<label className=\"text-xs text-slate-400\">Pre-processar ref \(remover silencios\)</label>.*?</div>\s*</div>',
    '\n',
    content,
    flags=re.DOTALL
)

with open('src/app/page.tsx', 'w') as f:
    f.write(content)
print('Switches removidos com sucesso')
"

echo "=== Verificando se denoise ainda existe ==="
if grep -n "denoise\|postprocessOutput\|preprocessPrompt" src/app/page.tsx; then
    echo "Ainda existem referencias! Limpando manualmente com sed..."
    # Fallback: remove linhas que contenham essas palavras
    sed -i '/denoise/d; /postprocessOutput/d; /preprocessPrompt/d' src/app/page.tsx
fi

echo "=== Rebuild Next.js ==="
rm -rf .next
rm -rf node_modules/.prisma/client
npx prisma generate
npx next build

echo "=== Copiando estaticos ==="
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "=== Restart PM2 ==="
sudo PM2_HOME=/root/.pm2 pm2 restart all

echo "=== DONE! ==="
echo "Site deve estar funcionando em https://vozpro.cvmnews.com.br"
