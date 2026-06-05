#!/usr/bin/env python3
"""
Upload modified files to Oracle server via SFTP (paramiko),
then rebuild and restart.
"""
import paramiko
import os
import sys

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

# Files to upload (local -> remote)
FILES = [
    ('/home/z/my-project/Omnivoice/src/lib/voice-analyzer.ts', f'{REMOTE_DIR}/src/lib/voice-analyzer.ts'),
    ('/home/z/my-project/Omnivoice/src/lib/audio-server.ts', f'{REMOTE_DIR}/src/lib/audio-server.ts'),
    ('/home/z/my-project/Omnivoice/src/app/api/admin/analyze-voices/route.ts', f'{REMOTE_DIR}/src/app/api/admin/analyze-voices/route.ts'),
    ('/home/z/my-project/Omnivoice/src/app/api/upload-voice/route.ts', f'{REMOTE_DIR}/src/app/api/upload-voice/route.ts'),
    ('/home/z/my-project/Omnivoice/prisma/schema.prisma', f'{REMOTE_DIR}/prisma/schema.prisma'),
    ('/home/z/my-project/Omnivoice/src/app/api/voices/[id]/variations/route.ts', f'{REMOTE_DIR}/src/app/api/voices/[id]/variations/route.ts'),
    ('/home/z/my-project/Omnivoice/src/app/api/queue/join/route.ts', f'{REMOTE_DIR}/src/app/api/queue/join/route.ts'),
    ('/home/z/my-project/Omnivoice/src/app/api/queue/complete/route.ts', f'{REMOTE_DIR}/src/app/api/queue/complete/route.ts'),
    ('/home/z/my-project/Omnivoice/src/components/payment-dialog.tsx', f'{REMOTE_DIR}/src/components/payment-dialog.tsx'),
    ('/home/z/my-project/Omnivoice/src/app/page.tsx', f'{REMOTE_DIR}/src/app/page.tsx'),
    ('/home/z/my-project/Omnivoice/src/app/admin/page.tsx', f'{REMOTE_DIR}/src/app/admin/page.tsx'),
]

def run_cmd(client, cmd, timeout=300):
    print(f"  $ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out.strip())
    if err: print(f"  STDERR: {err.strip()}")
    return out

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    print("Connected!")
    
    # Create dirs first
    print("\n=== Creating directories ===")
    run_cmd(client, f'mkdir -p {REMOTE_DIR}/src/lib {REMOTE_DIR}/src/app/api/admin/analyze-voices {REMOTE_DIR}/src/components')
    
    # Upload files via SFTP
    print("\n=== Uploading files ===")
    sftp = client.open_sftp()
    for local, remote in FILES:
        if not os.path.exists(local):
            print(f"  SKIP {local} (not found)")
            continue
        try:
            sftp.put(local, remote)
            size = os.path.getsize(local)
            print(f"  OK  {os.path.basename(local)} ({size:,} bytes)")
        except Exception as e:
            print(f"  ERR {os.path.basename(local)}: {e}")
    sftp.close()
    
    # Rebuild
    print("\n=== Rebuilding ===")
    run_cmd(client, f'cd {REMOTE_DIR} && npx prisma generate 2>&1 | tail -3')
    run_cmd(client, f'cd {REMOTE_DIR} && npm run build 2>&1 | tail -15')
    run_cmd(client, f'cd {REMOTE_DIR} && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && echo "Static copied OK"')
    run_cmd(client, f'cd {REMOTE_DIR} && sudo chown -R ubuntu:ubuntu .next 2>/dev/null || true')
    run_cmd(client, f'cd {REMOTE_DIR} && sudo PM2_HOME=/root/.pm2 pm2 restart omnivoice 2>&1')
    
    # Verify
    print("\n=== PM2 Status ===")
    run_cmd(client, f'sudo PM2_HOME=/root/.pm2 pm2 list 2>&1')
    
    client.close()
    print("\n=== Deploy complete! ===")

if __name__ == '__main__':
    main()
