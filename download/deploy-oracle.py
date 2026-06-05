#!/usr/bin/env python3
"""
Deploy Omnivoice to Oracle server via SSH (paramiko).
Usage: python3 deploy-oracle.py
"""
import paramiko
import sys
import time

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

COMMANDS = [
    f'cd {REMOTE_DIR} && echo "=== 1. Pull latest code ===" && git pull origin main 2>&1',
    f'cd {REMOTE_DIR} && echo "=== 2. Install deps ===" && npm install --production=false 2>&1 | tail -3',
    f'cd {REMOTE_DIR} && echo "=== 3. Prisma generate ===" && npx prisma generate 2>&1 | tail -3',
    f'cd {REMOTE_DIR} && echo "=== 4. Build ===" && npm run build 2>&1 | tail -10',
    f'cd {REMOTE_DIR} && echo "=== 5. Copy static ===" && cp -r .next/static .next/standalone/.next/static 2>/dev/null; cp -r public .next/standalone/public 2>/dev/null && echo "Static copied OK"',
    f'cd {REMOTE_DIR} && echo "=== 6. Restart PM2 ===" && sudo PM2_HOME=/root/.pm2 pm2 restart omnivoice 2>&1',
    f'cd {REMOTE_DIR} && echo "=== 7. PM2 Status ===" && sudo PM2_HOME=/root/.pm2 pm2 list 2>&1',
]

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    print("Connected!")
    
    for i, cmd in enumerate(COMMANDS):
        print(f"\n--- Step {i+1} ---")
        stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out: print(out)
        if err: print(f"STDERR: {err}")
    
    client.close()
    print("\n=== Deploy complete! ===")

if __name__ == '__main__':
    main()
