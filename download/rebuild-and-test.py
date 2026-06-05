#!/usr/bin/env python3
"""Upload just the analyze-voices route and rebuild."""
import paramiko
import os

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

def run_cmd(client, cmd, timeout=300):
    print(f"  $ {cmd[:120]}...")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.strip()[-500:])
    if err and 'warn' not in err.lower(): print(f"  ERR: {err.strip()[:300]}")
    return out

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print("Connecting...")
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    
    # Check if the file exists on server
    print("\n=== Checking server files ===")
    out = run_cmd(client, f'ls -la {REMOTE_DIR}/src/app/api/admin/analyze-voices/ 2>&1')
    out = run_cmd(client, f'ls -la {REMOTE_DIR}/src/lib/voice-analyzer.ts 2>&1')
    
    # Rebuild to ensure route is included
    print("\n=== Rebuilding ===")
    run_cmd(client, f'cd {REMOTE_DIR} && npm run build 2>&1 | tail -20', timeout=180)
    run_cmd(client, f'cd {REMOTE_DIR} && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public')
    run_cmd(client, f'cd {REMOTE_DIR} && sudo PM2_HOME=/root/.pm2 pm2 restart omnivoice 2>&1')
    
    # Wait a moment and test
    import time
    time.sleep(3)
    print("\n=== Testing endpoint ===")
    out = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' -X POST 'http://localhost:3000/api/admin/analyze-voices?dry=1' --max-time 60")
    print(f"HTTP Status: {out.strip()}")
    
    client.close()
    print("\nDone!")

if __name__ == '__main__':
    main()
