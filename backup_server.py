#!/usr/bin/env python3
"""FASE 1: Backup completo dos arquivos criticos no Oracle."""
import paramiko
import json
import os

KEY_PATH = "/home/z/my-project/upload/ssh-key-oracle.key"
HOST = "147.15.77.137"
USER = "ubuntu"
TIMESTAMP = "20250602"

# Comandos de backup - zero alteracao nos arquivos originais
BACKUP_COMMANDS = f"""
TIMESTAMP="{TIMESTAMP}"
echo "=== OMNIVOICE BACKUP {TIMESTAMP} ==="

# 1. Backup PHP completo
echo "[1/6] Backup /var/www/omnivoice/ ..."
sudo cp -a /var/www/omnivoice /var/www/omnivoice-backup-{TIMESTAMP}
echo "  OK -> /var/www/omnivoice-backup-{TIMESTAMP}"

# 2. Backup Next.js source
echo "[2/6] Backup /home/ubuntu/omnivoice/src/ ..."
mkdir -p /home/ubuntu/omnivoice-backup-{TIMESTAMP}
sudo cp -a /home/ubuntu/omnivoice/src /home/ubuntu/omnivoice-backup-{TIMESTAMP}/src
echo "  OK -> /home/ubuntu/omnivoice-backup-{TIMESTAMP}/src/"

# 3. Backup .env
echo "[3/6] Backup .env ..."
sudo cp /home/ubuntu/omnivoice/.env /home/ubuntu/omnivoice-backup-{TIMESTAMP}/.env.backup
echo "  OK"

# 4. Backup next.config.ts
echo "[4/6] Backup next.config.ts ..."
sudo cp /home/ubuntu/omnivoice/next.config.ts /home/ubuntu/omnivoice-backup-{TIMESTAMP}/next.config.ts.backup 2>/dev/null && echo "  OK" || echo "  SKIP (nao encontrado)"

# 5. Backup package.json
echo "[5/6] Backup package.json ..."
sudo cp /home/ubuntu/omnivoice/package.json /home/ubuntu/omnivoice-backup-{TIMESTAMP}/package.json.backup 2>/dev/null && echo "  OK" || echo "  SKIP"

# 6. Gerar hashes
echo "[6/6] Gerando hashes SHA256..."
(
  cd /var/www/omnivoice-backup-{TIMESTAMP} && find . -type f -exec sha256sum {{}} \\; | sort
) > /var/www/omnivoice-backup-{TIMESTAMP}/.sha256sums 2>/dev/null
echo "  OK"

echo ""
echo "=== BACKUP CONCLUIDO ==="
echo "PHP:     /var/www/omnivoice-backup-{TIMESTAMP}/"
echo "Next.js: /home/ubuntu/omnivoice-backup-{TIMESTAMP}/"
echo "Hashes:  /var/www/omnivoice-backup-{TIMESTAMP}/.sha256sums"
"""

def main():
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=HOST, username=USER, pkey=key, timeout=15)

    print(f"Conectado em {HOST}. Executando backup...")
    print()
    
    stdin, stdout, stderr = client.exec_command(BACKUP_COMMANDS, timeout=60)
    output = stdout.read().decode()
    errors = stderr.read().decode().strip()
    
    print(output)
    if errors:
        print(f"STDERR: {errors}")
    
    # Verificar se backup foi criado
    stdin, stdout, stderr = client.exec_command(
        f"ls -la /var/www/omnivoice-backup-{TIMESTAMP}/ | head -5 && "
        f"echo '---' && "
        f"ls -la /home/ubuntu/omnivoice-backup-{TIMESTAMP}/ 2>/dev/null | head -5",
        timeout=10
    )
    verify = stdout.read().decode()
    print("\n=== VERIFICACAO ===")
    print(verify)
    
    client.close()
    print("Backup concluido com sucesso!")

if __name__ == "__main__":
    main()
