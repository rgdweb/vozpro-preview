#!/usr/bin/env python3
"""Restore page.tsx and admin/page.tsx from the PREVIOUS git commit (before my changes)."""
import paramiko
import subprocess
import tempfile
import os

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

# The commit BEFORE my changes
PREV_COMMIT = 'd85a501'

def main():
    # 1. Extract page.tsx and admin/page.tsx from the previous commit
    print("=== Extracting original files from git ===")
    os.chdir('/tmp/omnivoice-fresh')
    
    # Get the files from the commit BEFORE mine
    for f in ['src/app/page.tsx', 'src/app/admin/page.tsx']:
        try:
            content = subprocess.check_output(
                ['git', 'show', f'{PREV_COMMIT}:{f}'],
                timeout=10
            )
            tmp = f'/tmp/restore_{f.replace("/", "_")}'
            with open(tmp, 'wb') as fh:
                fh.write(content)
            print(f"  OK: {f} ({len(content):,} bytes)")
        except Exception as e:
            print(f"  ERR: {f}: {e}")
    
    # 2. Upload restored files to Oracle
    print("\n=== Restoring on Oracle ===")
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    
    sftp = client.open_sftp()
    
    for local, remote in [
        ('/tmp/restore_src_app_page.tsx', f'{REMOTE_DIR}/src/app/page.tsx'),
        ('/tmp/restore_src_app_admin_page.tsx', f'{REMOTE_DIR}/src/app/admin/page.tsx'),
    ]:
        if os.path.exists(local):
            sftp.put(local, remote)
            print(f"  Restored: {remote}")
    
    sftp.close()
    
    # 3. Rebuild with RESTORED files + only the new voice-analyzer files
    print("\n=== Rebuilding with restored UI ===")
    stdin, stdout, stderr = client.exec_command(
        f'cd {REMOTE_DIR} && npm run build 2>&1 | tail -15',
        timeout=180
    )
    print(stdout.read().decode()[-1000:])
    err = stderr.read().decode()
    if err: print(f"ERR: {err[:300]}")
    
    stdin, stdout, stderr = client.exec_command(
        f'cd {REMOTE_DIR} && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && echo "Static OK"',
        timeout=30
    )
    print(stdout.read().decode())
    
    stdin, stdout, stderr = client.exec_command(
        f'sudo PM2_HOME=/root/.pm2 pm2 restart omnivoice 2>&1',
        timeout=15
    )
    print(stdout.read().decode()[-500:])
    
    # 4. Verify
    import time
    time.sleep(3)
    stdin, stdout, stderr = client.exec_command(
        "curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/' --max-time 10",
        timeout=15
    )
    print(f"\nHomepage HTTP: {stdout.read().decode().strip()}")
    
    client.close()
    print("\n=== RESTORE COMPLETE ===")

if __name__ == '__main__':
    main()
