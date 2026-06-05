#!/usr/bin/env python3
"""Test SSH connection to Oracle server using paramiko."""
import paramiko
import sys

KEY_PATH = "/home/z/my-project/upload/ssh-key-oracle.key"
HOST = "147.15.77.137"
USER = "ubuntu"
PORT = 22

def connect():
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"Conectando em {USER}@{HOST}:{PORT}...")
    client.connect(hostname=HOST, port=PORT, username=USER, pkey=key, timeout=15)
    print("CONECTADO!")
    
    # Test commands
    for cmd in [
        "whoami",
        "hostname",
        "ls -la /var/www/omnivoice/",
        "pm2 list 2>/dev/null || echo 'PM2 not found'",
        "php -v 2>/dev/null | head -1 || echo 'PHP not found'",
    ]:
        print(f"\n--- CMD: {cmd} ---")
        stdin, stdout, stderr = client.exec_command(cmd, timeout=10)
        out = stdout.read().decode().strip()
        err = stderr.read().decode().strip()
        if out:
            print(out)
        if err:
            print(f"STDERR: {err}")
    
    client.close()
    print("\n=== FIM ===")

if __name__ == "__main__":
    try:
        connect()
    except Exception as e:
        print(f"ERRO: {e}")
        sys.exit(1)
