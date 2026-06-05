#!/usr/bin/env python3
"""Debug the standalone build on Oracle."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

def run(client, cmd):
    print(f"$ {cmd[:120]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out[:2000])
    if err: print(f"ERR: {err[:500]}")

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    
    # Check if analyze-voices route is in standalone server
    run(client, f'find {REMOTE_DIR}/.next/standalone -name "*.js" | xargs grep -l "analyze-voice" 2>/dev/null | head -5')
    run(client, f'ls {REMOTE_DIR}/.next/standalone/.next/server/app/api/admin/ 2>/dev/null')
    run(client, f'find {REMOTE_DIR}/.next -path "*analyze-voices*" 2>/dev/null')
    
    client.close()

if __name__ == '__main__':
    main()
