#!/usr/bin/env python3
"""Fix permissions, rebuild, restart."""
import paramiko
import time

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

def run(client, cmd, timeout=180):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out[-1500:])
    if err and 'warn' not in err.lower(): print(f"ERR: {err[:500]}")
    return out

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    
    # Fix permissions on .next (root-owned cache from PM2)
    run(client, f'sudo chown -R ubuntu:ubuntu {REMOTE_DIR}/.next 2>&1')
    
    # Clean cache and rebuild
    run(client, f'cd {REMOTE_DIR} && rm -rf .next/cache .next/standalone/.next/cache 2>/dev/null && echo "Cache cleared"')
    run(client, f'cd {REMOTE_DIR} && npm run build 2>&1 | tail -15', timeout=180)
    run(client, f'cd {REMOTE_DIR} && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && echo "Static OK"')
    run(client, f'sudo PM2_HOME=/root/.pm2 pm2 restart omnivoice 2>&1')
    
    time.sleep(3)
    run(client, "curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/' --max-time 10")
    
    client.close()
    print("\nDone!")

if __name__ == '__main__':
    main()
