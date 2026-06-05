#!/bin/bash
# Deploy VozPro standalone build to Oracle VPS
# Usage: bash deploy-oracle.sh

set -e

REMOTE="ubuntu@147.15.77.137"
REMOTE_DIR="/home/ubuntu/omnivoice"
TARBALL="/home/z/my-project/download/vozpro-standalone.tar.gz"

echo "=== VozPro Deploy to Oracle VPS ==="
echo ""

# 1. Backup existing .env
echo "[1/6] Backing up existing .env..."
ssh -i /tmp/oracle_key "$REMOTE" "cp $REMOTE_DIR/.env $REMOTE_DIR/.env.backup 2>/dev/null || echo 'No .env to backup'"

# 2. Stop PM2
echo "[2/6] Stopping PM2..."
ssh -i /tmp/oracle_key "$REMOTE" "cd $REMOTE_DIR && pm2 stop omnivoice 2>/dev/null || echo 'PM2 not running'"

# 3. Backup existing .next (just in case)
echo "[3/6] Backing up old build..."
ssh -i /tmp/oracle_key "$REMOTE" "mv $REMOTE_DIR/.next $REMOTE_DIR/.next.bak.$(date +%s) 2>/dev/null; rm -rf $REMOTE_DIR/server.js $REMOTE_DIR/node_modules 2>/dev/null; echo 'Cleaned old files'"

# 4. Upload standalone build
echo "[4/6] Uploading standalone build (46MB)..."
scp -i /tmp/oracle_key "$TARBALL" "$REMOTE:/tmp/vozpro-standalone.tar.gz"

# 5. Extract on server
echo "[5/6] Extracting on server..."
ssh -i /tmp/oracle_key "$REMOTE" "cd $REMOTE_DIR && tar -xzf /tmp/vozpro-standalone.tar.gz --strip-components=1 && rm /tmp/vozpro-standalone.tar.gz"

# 6. Restore .env and restart PM2
echo "[6/6] Restoring .env and restarting PM2..."
ssh -i /tmp/oracle_key "$REMOTE" "cd $REMOTE_DIR && mv .env.backup .env 2>/dev/null; pm2 start server.js --name omnivoice && pm2 save"

echo ""
echo "=== Deploy complete! ==="
echo "Site: https://vozpro.cvmnews.com.br"
ssh -i /tmp/oracle_key "$REMOTE" "pm2 status omnivoice"
