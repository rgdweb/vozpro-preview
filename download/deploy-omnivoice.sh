#!/bin/bash
# Deploy Omnivoice - Oracle Server
# Execute como ubuntu: cd /home/ubuntu/omnivoice && bash deploy.sh

set -e
cd /home/ubuntu/omnivoice

echo "=== 1. Pull latest code from GitHub ==="
git pull origin main 2>&1

echo "=== 2. Install dependencies (if needed) ==="
npm install --production=false 2>&1 | tail -3

echo "=== 3. Generate Prisma client ==="
npx prisma generate 2>&1 | tail -3

echo "=== 4. Build Next.js ==="
npm run build 2>&1 | tail -5

echo "=== 5. Copy static files to standalone ==="
cp -r .next/static .next/standalone/.next/static 2>/dev/null
cp -r public .next/standalone/public 2>/dev/null

echo "=== 6. Fix permissions ==="
sudo chown -R ubuntu:ubuntu .next 2>/dev/null || true

echo "=== 7. Restart PM2 ==="
sudo PM2_HOME=/root/.pm2 pm2 restart omnivoice 2>&1 || \
sudo PM2_HOME=/root/.pm2 pm2 start .next/standalone/server.js --name omnivoice 2>&1

echo ""
echo "=== Deploy completo! ==="
echo "Agora execute a análise das vozes:"
echo "  curl -X POST http://localhost:3000/api/admin/analyze-voices | python3 -m json.tool"
echo ""
echo "Ou dry-run primeiro (sem alterar o banco):"
echo "  curl -X POST 'http://localhost:3000/api/admin/analyze-voices?dry=1' | python3 -m json.tool"
