#!/usr/bin/env python3
"""Deploy VozPro standalone build to Oracle VPS via paramiko"""
import paramiko
import os
import tarfile
import io
import time

KEY_PATH = '/home/z/my-project/upload/ssh-key-oracle.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'
TARBALL_PATH = '/home/z/my-project/download/vozpro-standalone.tar.gz'

def ssh_exec(client, cmd):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out, err

def main():
    print("=== VozPro Deploy to Oracle VPS ===\n")

    # 1. Connect
    print("[1/7] Conectando via SSH...")
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key)
    print("  OK - Conectado!")

    # 2. Check current status
    print("[2/7] Verificando status atual...")
    out, err = ssh_exec(client, "pm2 status omnivoice --no-color 2>/dev/null; echo '---'; ls -la " + REMOTE_DIR + "/.env 2>/dev/null")
    print(f"  PM2: {out.strip()[:200]}")

    # 3. Backup .env
    print("[3/7] Backup do .env...")
    ssh_exec(client, f"cp {REMOTE_DIR}/.env {REMOTE_DIR}/.env.backup 2>/dev/null; echo 'done'")
    print("  OK")

    # 4. Stop PM2
    print("[4/7] Parando PM2...")
    out, err = ssh_exec(client, f"cd {REMOTE_DIR} && pm2 stop omnivoice 2>/dev/null || echo 'not running'")
    print(f"  {out.strip() or err.strip()}")

    # 5. Backup old build
    print("[5/7] Backup build antigo e limpando...")
    out, err = ssh_exec(client, f"""
        cd {REMOTE_DIR}
        mv .next .next.bak.$(date +%s) 2>/dev/null
        rm -rf server.js node_modules 2>/dev/null
        echo 'cleaned'
    """)
    print(f"  {out.strip()}")

    # 6. Upload standalone build
    print("[6/7] Enviando build standalone (46MB)...")
    sftp = client.open_sftp()

    # Upload tarball to /tmp first
    remote_tmp = '/tmp/vozpro-standalone.tar.gz'
    file_size = os.path.getsize(TARBALL_PATH)
    print(f"  Tamanho: {file_size / 1024 / 1024:.1f} MB")

    # Upload with progress
    sftp.put(TARBALL_PATH, remote_tmp)
    print("  Upload completo!")

    # Extract on server (no --strip-components since tarball has flat structure)
    print("  Extraindo no servidor...")
    out, err = ssh_exec(client, f"cd {REMOTE_DIR} && tar -xzf {remote_tmp} && rm {remote_tmp} && echo 'extracted'")
    print(f"  {out.strip()}")

    sftp.close()

    # 7. Restore .env and restart
    print("[7/7] Restaurando .env e reiniciando PM2...")
    out, err = ssh_exec(client, f"""
        cd {REMOTE_DIR}
        mv .env.backup .env 2>/dev/null
        cat .env | head -3
    """)
    print(f"  .env restaurado: {out.strip()[:100]}")

    # Ensure PORT=3001 in .env (tecos uses 3000)
    ssh_exec(client, f"grep -q '^PORT=3001' {REMOTE_DIR}/.env || echo 'PORT=3001' >> {REMOTE_DIR}/.env")
    out, err = ssh_exec(client, f"cd {REMOTE_DIR} && PORT=3001 pm2 start server.js --name omnivoice && pm2 save && echo 'started'")
    print(f"  {out.strip()}")

    # Wait a moment then check status
    time.sleep(3)
    out, err = ssh_exec(client, "pm2 status omnivoice --no-color 2>/dev/null")
    print(f"\n  Status PM2:\n{out.strip()}")

    client.close()

    print("\n=== Deploy completo! ===")
    print("Site: https://vozpro.cvmnews.com.br")

if __name__ == '__main__':
    main()
